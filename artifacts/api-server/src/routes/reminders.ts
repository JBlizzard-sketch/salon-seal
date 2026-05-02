import { Router, type IRouter } from "express";
import { eq, and, gte, lte, notExists } from "drizzle-orm";
import { db, bookingsTable, remindersTable, activityTable } from "@workspace/db";
import {
  SendBookingReminderParams,
  SendBookingReminderBody,
  SendBookingReminderResponse,
  ProcessRemindersParams,
  ProcessRemindersResponse,
  ListRemindersParams,
  ListRemindersResponse,
} from "@workspace/api-zod";
const router: IRouter = Router();

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Nairobi" });
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-KE", { weekday: "long", month: "long", day: "numeric", timeZone: "Africa/Nairobi" });
}

function buildWhatsAppMessage(opts: {
  clientName: string;
  serviceName: string;
  staffName: string | null;
  appointmentAt: Date;
  depositAmount: number;
  mpesaRef: string | null;
  hoursUntil: number;
}): string {
  const timeStr = fmtTime(opts.appointmentAt);
  const dateStr = fmtDate(opts.appointmentAt);
  const window = opts.hoursUntil <= 3 ? "in about 2 hours" : "tomorrow";
  const staffLine = opts.staffName ? `\n👤 Stylist: *${opts.staffName}*` : "";
  const depositLine = opts.mpesaRef
    ? `\n💵 Deposit: Ksh ${opts.depositAmount} ✅ (Ref: ${opts.mpesaRef})`
    : `\n💵 Deposit: Ksh ${opts.depositAmount} ⏳ Pending`;
  return (
    `Hi ${opts.clientName}! 👋\n\n` +
    `Reminder from *Lavish Beauty Studio* – your appointment is ${window}.\n\n` +
    `📅 *${dateStr} at ${timeStr}*\n` +
    `💇 Service: *${opts.serviceName}*` +
    staffLine +
    depositLine +
    `\n\nTo cancel, reply CANCEL (at least 24 hrs before for a refund).\n\nSee you soon! ✨`
  );
}

function generateWaMessageId(): string {
  return "WA-" + Date.now() + Math.floor(Math.random() * 10000);
}

router.post("/bookings/:id/send-reminder", async (req, res): Promise<void> => {
  const params = SendBookingReminderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendBookingReminderBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (["cancelled", "completed", "no_show"].includes(booking.status)) {
    res.status(400).json({ error: `Cannot send reminder for a ${booking.status} booking` });
    return;
  }

  const now = new Date();
  const hoursUntil = (booking.appointmentAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  const message = buildWhatsAppMessage({
    clientName: booking.clientName,
    serviceName: booking.serviceName,
    staffName: booking.staffName,
    appointmentAt: booking.appointmentAt,
    depositAmount: booking.depositAmount,
    mpesaRef: booking.mpesaRef,
    hoursUntil,
  });

  const waMessageId = generateWaMessageId();

  const [reminder] = await db
    .insert(remindersTable)
    .values({
      bookingId: booking.id,
      salonId: booking.salonId,
      type: body.data.type,
      channel: "whatsapp",
      phoneNumber: booking.clientPhone,
      message,
      status: "sent",
      messageId: waMessageId,
    })
    .returning();

  await db.insert(activityTable).values({
    salonId: booking.salonId,
    bookingId: booking.id,
    type: "reminder_sent",
    clientName: booking.clientName,
    serviceName: booking.serviceName,
    amount: null,
  });

  const enriched = {
    ...reminder,
    clientName: booking.clientName,
    serviceName: booking.serviceName,
    appointmentAt: booking.appointmentAt,
  };

  res.json(
    SendBookingReminderResponse.parse({
      reminder: enriched,
      message: `WhatsApp reminder sent to ${booking.clientPhone}`,
      waMessageId,
    }),
  );
});

router.post("/salons/:salonId/reminders/process", async (req, res): Promise<void> => {
  const params = ProcessRemindersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const salonId = params.data.salonId;
  const now = new Date();

  const window24hStart = new Date(now.getTime() + 22 * 60 * 60 * 1000);
  const window24hEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  const window2hStart = new Date(now.getTime() + 1 * 60 * 60 * 1000);
  const window2hEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const alreadySent24h = db
    .select({ id: remindersTable.id })
    .from(remindersTable)
    .where(
      and(
        eq(remindersTable.bookingId, bookingsTable.id),
        eq(remindersTable.type, "24h"),
      ),
    );

  const alreadySent2h = db
    .select({ id: remindersTable.id })
    .from(remindersTable)
    .where(
      and(
        eq(remindersTable.bookingId, bookingsTable.id),
        eq(remindersTable.type, "2h"),
      ),
    );

  const [due24h, due2h] = await Promise.all([
    db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.salonId, salonId),
          eq(bookingsTable.status, "confirmed"),
          gte(bookingsTable.appointmentAt, window24hStart),
          lte(bookingsTable.appointmentAt, window24hEnd),
          notExists(alreadySent24h),
        ),
      ),
    db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.salonId, salonId),
          eq(bookingsTable.status, "confirmed"),
          gte(bookingsTable.appointmentAt, window2hStart),
          lte(bookingsTable.appointmentAt, window2hEnd),
          notExists(alreadySent2h),
        ),
      ),
  ]);

  const toProcess = [
    ...due24h.map((b) => ({ booking: b, type: "24h" as const })),
    ...due2h.map((b) => ({ booking: b, type: "2h" as const })),
  ];

  const inserted: typeof remindersTable.$inferSelect[] = [];

  for (const { booking, type } of toProcess) {
    const hoursUntil = (booking.appointmentAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    const message = buildWhatsAppMessage({
      clientName: booking.clientName,
      serviceName: booking.serviceName,
      staffName: booking.staffName,
      appointmentAt: booking.appointmentAt,
      depositAmount: booking.depositAmount,
      mpesaRef: booking.mpesaRef,
      hoursUntil,
    });

    const waMessageId = generateWaMessageId();
    const [reminder] = await db
      .insert(remindersTable)
      .values({
        bookingId: booking.id,
        salonId,
        type,
        channel: "whatsapp",
        phoneNumber: booking.clientPhone,
        message,
        status: "sent",
        messageId: waMessageId,
      })
      .returning();

    await db.insert(activityTable).values({
      salonId,
      bookingId: booking.id,
      type: "reminder_sent",
      clientName: booking.clientName,
      serviceName: booking.serviceName,
      amount: null,
    });

    inserted.push(reminder);
  }

  const enriched = inserted.map((r) => {
    const booking = toProcess.find((p) => p.booking.id === r.bookingId)!.booking;
    return {
      ...r,
      clientName: booking.clientName,
      serviceName: booking.serviceName,
      appointmentAt: booking.appointmentAt,
    };
  });

  res.json(
    ProcessRemindersResponse.parse({
      sent: inserted.length,
      skipped: 0,
      reminders: enriched,
    }),
  );
});

router.get("/salons/:salonId/reminders", async (req, res): Promise<void> => {
  const params = ListRemindersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select({
      id: remindersTable.id,
      bookingId: remindersTable.bookingId,
      salonId: remindersTable.salonId,
      type: remindersTable.type,
      channel: remindersTable.channel,
      phoneNumber: remindersTable.phoneNumber,
      message: remindersTable.message,
      status: remindersTable.status,
      messageId: remindersTable.messageId,
      sentAt: remindersTable.sentAt,
      clientName: bookingsTable.clientName,
      serviceName: bookingsTable.serviceName,
      appointmentAt: bookingsTable.appointmentAt,
    })
    .from(remindersTable)
    .innerJoin(bookingsTable, eq(remindersTable.bookingId, bookingsTable.id))
    .where(eq(remindersTable.salonId, params.data.salonId))
    .orderBy(remindersTable.sentAt);

  res.json(ListRemindersResponse.parse(rows));
});

export default router;
