import { Router, type IRouter } from "express";
import { eq, and, gte, lte, lt, gt, ne, sql, getTableColumns, asc } from "drizzle-orm";
import { db, bookingsTable, clientsTable, activityTable, salonsTable, servicesTable, waitlistTable, staffBlocksTable } from "@workspace/db";
import {
  CreateBookingBody,
  UpdateBookingStatusBody,
  CancelBookingBody,
  AssignBookingStaffBody,
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
  if (query.data.staffId) conditions.push(eq(bookingsTable.staffId, query.data.staffId));
  if (query.data.date) {
    const day = new Date(query.data.date as string);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    conditions.push(gte(bookingsTable.appointmentAt, day));
    conditions.push(lte(bookingsTable.appointmentAt, next));
  }
  const baseQuery = db
    .select({ ...getTableColumns(bookingsTable), durationMinutes: servicesTable.durationMinutes })
    .from(bookingsTable)
    .leftJoin(servicesTable, eq(bookingsTable.serviceId, servicesTable.id))
    .orderBy(bookingsTable.appointmentAt);
  const bookings = conditions.length
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;
  res.json(ListBookingsResponse.parse(bookings));
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { salonId, serviceId, staffId, clientName, clientPhone, appointmentAt, notes, depositWaived, recurrenceRule, recurrenceCount } = parsed.data;

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
  const { staffTable } = await import("@workspace/db");
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  let staffName: string | undefined;
  if (staffId) {
    const [member] = await db.select().from(staffTable).where(eq(staffTable.id, staffId));
    staffName = member?.name;

    // Conflict check: reject if this staff member is already booked in the service's time window
    const apptDate = new Date(appointmentAt as unknown as string);
    const windowStart = new Date(apptDate.getTime() - service.durationMinutes * 60 * 1000);
    const windowEnd = new Date(apptDate.getTime() + service.durationMinutes * 60 * 1000);
    const conflicts = await db
      .select({ id: bookingsTable.id, staffName: bookingsTable.staffName })
      .from(bookingsTable)
      .where(and(
        eq(bookingsTable.staffId, staffId),
        ne(bookingsTable.status, "cancelled"),
        gte(bookingsTable.appointmentAt, windowStart),
        lt(bookingsTable.appointmentAt, windowEnd),
      ));
    if (conflicts.length > 0) {
      res.status(409).json({ error: "STAFF_CONFLICT", message: `${staffName ?? "This stylist"} is already booked at that time. Please choose a different time or stylist.` });
      return;
    }

    // Block check: reject if staff member has a time-off block covering this appointment
    const apptStart = apptDate;
    const apptEnd = new Date(apptDate.getTime() + service.durationMinutes * 60 * 1000);
    const blockConflicts = await db
      .select({ id: staffBlocksTable.id, reason: staffBlocksTable.reason })
      .from(staffBlocksTable)
      .where(and(
        eq(staffBlocksTable.staffId, staffId),
        lt(staffBlocksTable.startAt, apptEnd),
        gt(staffBlocksTable.endAt, apptStart),
      ));
    if (blockConflicts.length > 0) {
      res.status(409).json({ error: "STAFF_CONFLICT", message: `${staffName ?? "This stylist"} is unavailable at that time${blockConflicts[0].reason ? ` (${blockConflicts[0].reason})` : ""}. Please choose a different time or stylist.` });
      return;
    }
  }

  let [booking] = await db
    .insert(bookingsTable)
    .values({
      salonId,
      serviceId,
      staffId: staffId ?? null,
      clientId: client.id,
      clientName,
      clientPhone,
      appointmentAt: new Date(appointmentAt as unknown as string),
      status: depositWaived ? "confirmed" : "pending",
      depositAmount: service.depositAmount,
      depositPaid: depositWaived ? true : false,
      depositWaived: depositWaived ? true : false,
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

  // Handle recurring bookings
  const additionalBookings: typeof booking[] = [];
  if (recurrenceRule && recurrenceCount && recurrenceCount > 1) {
    const intervalDays: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30 };
    const days = intervalDays[recurrenceRule] ?? 7;
    // Tag the first booking with its own id as the group id
    await db.update(bookingsTable)
      .set({ recurringGroupId: booking.id, recurrenceRule })
      .where(eq(bookingsTable.id, booking.id));
    booking = { ...booking, recurringGroupId: booking.id, recurrenceRule };

    const apptMs = new Date(appointmentAt as unknown as string).getTime();
    for (let i = 1; i < recurrenceCount; i++) {
      const nextAppt = new Date(apptMs + days * i * 86400000);
      const [next] = await db.insert(bookingsTable).values({
        salonId, serviceId, staffId: staffId ?? null, clientId: client.id,
        clientName, clientPhone, appointmentAt: nextAppt,
        status: depositWaived ? "confirmed" : "pending",
        depositAmount: service.depositAmount,
        depositPaid: depositWaived ? true : false,
        depositWaived: depositWaived ? true : false,
        refundEligible: false, serviceName: service.name,
        staffName: staffName ?? null, notes: notes ?? null,
        recurringGroupId: booking.id, recurrenceRule,
      }).returning();
      additionalBookings.push(next);
    }
  }

  res.status(201).json({ booking: GetBookingResponse.parse(booking), additionalBookings: additionalBookings.map(b => GetBookingResponse.parse(b)) });
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
  let autoBlacklisted = false;
  let autoBlacklistedName: string | null = null;

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
    const [updatedClient] = await db
      .update(clientsTable)
      .set({ noShowCount: sql`${clientsTable.noShowCount} + 1` })
      .where(eq(clientsTable.id, existing.clientId))
      .returning();

    // Auto-blacklist if salon threshold is configured and reached
    if (updatedClient) {
      const [salon] = await db.select().from(salonsTable).where(eq(salonsTable.id, existing.salonId));
      const threshold = salon?.autoBlacklistThreshold;
      if (threshold && updatedClient.noShowCount >= threshold && !updatedClient.isBlacklisted) {
        await db
          .update(clientsTable)
          .set({ isBlacklisted: true })
          .where(eq(clientsTable.id, existing.clientId));
        autoBlacklisted = true;
        autoBlacklistedName = updatedClient.name;
      }
    }
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

  res.json(UpdateBookingStatusResponse.parse({ booking, autoBlacklisted, autoBlacklistedName }));
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

  // Find ALL unnotified waitlist entries for the same service (broader match for display)
  const waitlistedClients = await db
    .select()
    .from(waitlistTable)
    .where(and(
      eq(waitlistTable.salonId, booking.salonId),
      eq(waitlistTable.serviceId, booking.serviceId),
      eq(waitlistTable.notified, false),
    ))
    .orderBy(asc(waitlistTable.createdAt));

  // Auto-promote: notify the top (oldest) waiting client automatically
  let autoPromoted = false;
  let autoPromotedClientName: string | null = null;
  let autoPromotedPhone: string | null = null;
  let autoPromotedMessage: string | null = null;

  if (waitlistedClients.length > 0) {
    const top = waitlistedClients[0];
    await db
      .update(waitlistTable)
      .set({ notified: true })
      .where(eq(waitlistTable.id, top.id));

    const apptDate = new Date(booking.appointmentAt);
    const dateStr = apptDate.toLocaleDateString("en-KE", { weekday: "long", month: "long", day: "numeric", timeZone: "Africa/Nairobi" });
    const timeStr = apptDate.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Nairobi" });

    autoPromoted = true;
    autoPromotedClientName = top.clientName;
    autoPromotedPhone = top.clientPhone;
    autoPromotedMessage = `Hi ${top.clientName}! 🎉 Great news — a *${booking.serviceName}* slot has just opened up${booking.staffName ? ` with ${booking.staffName}` : ""} on *${dateStr} at ${timeStr}*.\n\nYou're next on our waitlist! Reply *YES* to claim this spot or call us to book. First come, first served! 📞`;

    // Log the auto-promotion in activity
    await db.insert(activityTable).values({
      salonId: booking.salonId,
      bookingId: booking.id,
      type: "booking_confirmed",
      clientName: top.clientName,
      serviceName: booking.serviceName,
      amount: null,
    });
  }

  res.json(
    CancelBookingResponse.parse({
      booking: updated,
      refundEligible,
      refundAmount: refundEligible ? booking.depositAmount : 0,
      message: refundEligible
        ? `Booking cancelled. Ksh ${booking.depositAmount} refund will be sent to ${booking.clientPhone} via M-Pesa.`
        : `Booking cancelled outside the ${salon?.cancellationWindowHours ?? 24}-hour window. Deposit is non-refundable.`,
      waitlistedClients: waitlistedClients.slice(1), // remaining (already sent top one)
      autoPromoted,
      autoPromotedClientName,
      autoPromotedPhone,
      autoPromotedMessage,
    }),
  );
});

router.patch("/bookings/:id/reschedule", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const { appointmentAt } = req.body ?? {};
  if (!appointmentAt || typeof appointmentAt !== "string") {
    res.status(400).json({ error: "appointmentAt is required" });
    return;
  }
  const newDate = new Date(appointmentAt);
  if (isNaN(newDate.getTime())) {
    res.status(400).json({ error: "Invalid appointmentAt date" });
    return;
  }

  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Booking not found" }); return; }
  if (existing.status === "completed" || existing.status === "no_show" || existing.status === "cancelled") {
    res.status(400).json({ error: `Cannot reschedule a ${existing.status} booking` });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ appointmentAt: newDate })
    .where(eq(bookingsTable.id, id))
    .returning();

  res.json(GetBookingResponse.parse(updated));
});

router.patch("/bookings/:id/staff", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  const parsed = AssignBookingStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const { staffTable } = await import("@workspace/db");
  let staffName: string | null = null;
  if (parsed.data.staffId) {
    const [member] = await db.select().from(staffTable).where(eq(staffTable.id, parsed.data.staffId));
    if (!member) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }
    staffName = member.name;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ staffId: parsed.data.staffId ?? null, staffName })
    .where(eq(bookingsTable.id, id))
    .returning();

  res.json(GetBookingResponse.parse(updated));
});

router.get("/salons/:salonId/staff/:staffId/busy-slots", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  const staffId = parseInt(req.params.staffId);
  const date = req.query.date as string;
  if (isNaN(salonId) || isNaN(staffId) || !date) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const dayStart = new Date(date + "T00:00:00");
  const dayEnd = new Date(date + "T23:59:59");
  const bookings = await db
    .select({ appointmentAt: bookingsTable.appointmentAt, durationMinutes: servicesTable.durationMinutes })
    .from(bookingsTable)
    .leftJoin(servicesTable, eq(bookingsTable.serviceId, servicesTable.id))
    .where(and(
      eq(bookingsTable.salonId, salonId),
      eq(bookingsTable.staffId, staffId),
      ne(bookingsTable.status, "cancelled"),
      gte(bookingsTable.appointmentAt, dayStart),
      lte(bookingsTable.appointmentAt, dayEnd),
    ));
  res.json({
    busySlots: bookings.map(b => ({
      appointmentAt: b.appointmentAt.toISOString(),
      durationMinutes: b.durationMinutes ?? 60,
    })),
  });
});

export default router;
