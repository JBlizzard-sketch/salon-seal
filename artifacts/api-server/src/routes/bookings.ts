import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, bookingsTable, clientsTable, activityTable, salonsTable } from "@workspace/db";
import {
  CreateBookingBody,
  UpdateBookingStatusBody,
  CancelBookingBody,
  GetBookingParams,
  UpdateBookingStatusParams,
  CancelBookingParams,
  ListBookingsQueryParams,
  ListBookingsResponse,
  GetBookingResponse,
  UpdateBookingStatusResponse,
  CancelBookingResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/bookings", async (req, res): Promise<void> => {
  const query = ListBookingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const conditions = [];
  if (query.data.salonId) conditions.push(eq(bookingsTable.salonId, query.data.salonId));
  if (query.data.status) conditions.push(eq(bookingsTable.status, query.data.status));
  if (query.data.date) {
    const day = new Date(query.data.date as string);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    conditions.push(gte(bookingsTable.appointmentAt, day));
    conditions.push(lte(bookingsTable.appointmentAt, next));
  }
  const bookings = conditions.length
    ? await db.select().from(bookingsTable).where(and(...conditions)).orderBy(bookingsTable.appointmentAt)
    : await db.select().from(bookingsTable).orderBy(bookingsTable.appointmentAt);
  res.json(ListBookingsResponse.parse(bookings));
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { salonId, serviceId, staffId, clientName, clientPhone, appointmentAt, notes } = parsed.data;

  // Upsert client — but reject if blacklisted
  let [client] = await db
    .select()
    .from(clientsTable)
    .where(and(eq(clientsTable.salonId, salonId), eq(clientsTable.phone, clientPhone)));
  if (client?.isBlacklisted) {
    res.status(403).json({ error: "BLACKLISTED", message: "We're unable to accept new bookings from this number. Please contact the salon directly." });
    return;
  }
  if (!client) {
    [client] = await db.insert(clientsTable).values({ salonId, name: clientName, phone: clientPhone }).returning();
  }

  // Get service for deposit amount
  const { servicesTable, staffTable } = await import("@workspace/db");
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  let staffName: string | undefined;
  if (staffId) {
    const [member] = await db.select().from(staffTable).where(eq(staffTable.id, staffId));
    staffName = member?.name;
  }

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      salonId,
      serviceId,
      staffId: staffId ?? null,
      clientId: client.id,
      clientName,
      clientPhone,
      appointmentAt: new Date(appointmentAt as unknown as string),
      status: "pending",
      depositAmount: service.depositAmount,
      depositPaid: false,
      refundEligible: false,
      serviceName: service.name,
      staffName: staffName ?? null,
      notes: notes ?? null,
    })
    .returning();

  // Log activity
  await db.insert(activityTable).values({
    salonId,
    bookingId: booking.id,
    type: "booking_created",
    clientName,
    serviceName: service.name,
    amount: service.depositAmount,
  });

  res.status(201).json(GetBookingResponse.parse(booking));
});

router.get("/bookings/:id", async (req, res): Promise<void> => {
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  res.json(GetBookingResponse.parse(booking));
});

router.patch("/bookings/:id/status", async (req, res): Promise<void> => {
  const params = UpdateBookingStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBookingStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const [booking] = await db
    .update(bookingsTable)
    .set({ status: parsed.data.status })
    .where(eq(bookingsTable.id, params.data.id))
    .returning();

  // Update client stats on completion or no-show
  if (parsed.data.status === "completed") {
    await db
      .update(clientsTable)
      .set({
        totalVisits: sql`${clientsTable.totalVisits} + 1`,
        totalSpent: sql`${clientsTable.totalSpent} + ${existing.depositAmount}`,
        lastVisitAt: new Date(),
      })
      .where(eq(clientsTable.id, existing.clientId));
  } else if (parsed.data.status === "no_show") {
    await db
      .update(clientsTable)
      .set({ noShowCount: sql`${clientsTable.noShowCount} + 1` })
      .where(eq(clientsTable.id, existing.clientId));
  }

  const activityType =
    parsed.data.status === "completed"
      ? "booking_completed"
      : parsed.data.status === "no_show"
        ? "no_show"
        : parsed.data.status === "arrived"
          ? "booking_confirmed"
          : "booking_cancelled";

  await db.insert(activityTable).values({
    salonId: existing.salonId,
    bookingId: existing.id,
    type: activityType,
    clientName: existing.clientName,
    serviceName: existing.serviceName,
    amount: parsed.data.status === "completed" ? existing.depositAmount : null,
  });

  res.json(UpdateBookingStatusResponse.parse(booking));
});

router.post("/bookings/:id/simulate-payment", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (booking.depositPaid) {
    res.status(400).json({ error: "Deposit already paid" });
    return;
  }

  const ref = "QFJ" + Math.floor(100000 + Math.random() * 900000);

  const [updated] = await db
    .update(bookingsTable)
    .set({ depositPaid: true, mpesaRef: ref, status: "confirmed" })
    .where(eq(bookingsTable.id, id))
    .returning();

  await db.insert(activityTable).values({
    salonId: booking.salonId,
    bookingId: booking.id,
    type: "deposit_received",
    clientName: booking.clientName,
    serviceName: booking.serviceName,
    amount: booking.depositAmount,
  });

  res.json({
    booking: GetBookingResponse.parse(updated),
    mpesaRef: ref,
    message: `Deposit of Ksh ${booking.depositAmount} received via M-Pesa. Reference: ${ref}`,
  });
});

router.post("/bookings/:id/send-deposit-nudge", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (booking.depositPaid) {
    res.status(400).json({ error: "Deposit already paid" });
    return;
  }
  if (["cancelled", "completed", "no_show"].includes(booking.status)) {
    res.status(400).json({ error: `Cannot nudge a ${booking.status} booking` });
    return;
  }

  const apptDate = new Date(booking.appointmentAt);
  const dateStr = apptDate.toLocaleDateString("en-KE", { weekday: "long", month: "long", day: "numeric", timeZone: "Africa/Nairobi" });
  const timeStr = apptDate.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Nairobi" });

  const waMessageId = "WA-" + Date.now() + Math.floor(Math.random() * 10000);

  await db.insert(activityTable).values({
    salonId: booking.salonId,
    bookingId: booking.id,
    type: "deposit_nudge_sent",
    clientName: booking.clientName,
    serviceName: booking.serviceName,
    amount: booking.depositAmount,
  });

  res.json({
    message: `Hi ${booking.clientName}! 👋 Your *${booking.serviceName}* appointment at Lavish Beauty Studio is on *${dateStr} at ${timeStr}*.\n\nTo confirm your spot, please pay your deposit of *Ksh ${booking.depositAmount}* via M-Pesa:\n📱 Paybill: *247247*\nAccount: *SALON${String(booking.salonId).padStart(3,"0")}*\nAmount: *Ksh ${booking.depositAmount}*\n\nBooking Ref: #${booking.id}. Questions? Call us!`,
    waMessageId,
  });
});

router.post("/bookings/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (booking.status === "cancelled" || booking.status === "completed" || booking.status === "no_show") {
    res.status(400).json({ error: `Booking is already ${booking.status}` });
    return;
  }

  // Check cancellation window
  const [salon] = await db.select().from(salonsTable).where(eq(salonsTable.id, booking.salonId));
  const now = new Date();
  const apptTime = new Date(booking.appointmentAt);
  const hoursUntilAppt = (apptTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const refundEligible = hoursUntilAppt >= (salon?.cancellationWindowHours ?? 24);

  const newStatus = refundEligible ? "cancelled" : "cancelled";
  const [updated] = await db
    .update(bookingsTable)
    .set({ status: newStatus, refundEligible })
    .where(eq(bookingsTable.id, params.data.id))
    .returning();

  await db.insert(activityTable).values({
    salonId: booking.salonId,
    bookingId: booking.id,
    type: refundEligible ? "refund_issued" : "booking_cancelled",
    clientName: booking.clientName,
    serviceName: booking.serviceName,
    amount: refundEligible ? booking.depositAmount : null,
  });

  res.json(
    CancelBookingResponse.parse({
      booking: updated,
      refundEligible,
      refundAmount: refundEligible ? booking.depositAmount : 0,
      message: refundEligible
        ? `Booking cancelled. Ksh ${booking.depositAmount} refund will be sent to ${booking.clientPhone} via Mpesa.`
        : `Booking cancelled outside the ${salon?.cancellationWindowHours ?? 24}-hour window. Deposit is non-refundable.`,
    }),
  );
});

export default router;
