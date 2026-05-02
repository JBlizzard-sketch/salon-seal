import { db, pool, bookingsTable, clientsTable, activityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const SALON_ID = 1;

const services = [
  { id: 1, name: "Hair Relaxer + Set", price: 3500, depositAmount: 500 },
  { id: 2, name: "Box Braids (Medium)", price: 5000, depositAmount: 500 },
  { id: 3, name: "Knotless Braids", price: 6500, depositAmount: 500 },
  { id: 4, name: "Haircut + Style", price: 1800, depositAmount: 300 },
  { id: 5, name: "Natural Hair Treatment", price: 2500, depositAmount: 300 },
  { id: 6, name: "Manicure + Pedicure", price: 2000, depositAmount: 200 },
];

const staff = [
  { id: 1, name: "Wanjiku Mwangi" },
  { id: 2, name: "Aisha Odhiambo" },
  { id: 3, name: "Njeri Kamau" },
  { id: 4, name: "Fatuma Hassan" },
];

const clients = [
  { id: 1, name: "Faith Muthoni", phone: "+254722004004" },
  { id: 2, name: "Grace Wanjiru", phone: "+254722001001" },
  { id: 3, name: "Amara Okonkwo", phone: "+254722002002" },
  { id: 4, name: "Zara Mohamed", phone: "+254722003003" },
  { id: 5, name: "Diana Chebet", phone: "+254722005005" },
];

function daysAgo(n: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function daysFromNow(n: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function todayAt(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

function mpesaRef(): string {
  return "QFJ" + Math.floor(100000 + Math.random() * 900000);
}

interface BookingDef {
  clientIdx: number;
  serviceIdx: number;
  staffIdx: number;
  appointmentAt: Date;
  status: string;
  depositPaid: boolean;
}

const bookingDefs: BookingDef[] = [
  // Past — completed & no-shows
  { clientIdx: 0, serviceIdx: 0, staffIdx: 0, appointmentAt: daysAgo(28, 9),  status: "completed", depositPaid: true },
  { clientIdx: 1, serviceIdx: 1, staffIdx: 1, appointmentAt: daysAgo(26, 11), status: "completed", depositPaid: true },
  { clientIdx: 2, serviceIdx: 3, staffIdx: 0, appointmentAt: daysAgo(25, 14), status: "no_show",   depositPaid: true },
  { clientIdx: 3, serviceIdx: 4, staffIdx: 2, appointmentAt: daysAgo(24, 10), status: "completed", depositPaid: true },
  { clientIdx: 4, serviceIdx: 5, staffIdx: 2, appointmentAt: daysAgo(23, 15), status: "completed", depositPaid: true },
  { clientIdx: 0, serviceIdx: 2, staffIdx: 1, appointmentAt: daysAgo(21, 9),  status: "completed", depositPaid: true },
  { clientIdx: 1, serviceIdx: 3, staffIdx: 0, appointmentAt: daysAgo(20, 11), status: "no_show",   depositPaid: true },
  { clientIdx: 2, serviceIdx: 1, staffIdx: 1, appointmentAt: daysAgo(19, 13), status: "completed", depositPaid: true },
  { clientIdx: 3, serviceIdx: 0, staffIdx: 3, appointmentAt: daysAgo(18, 10), status: "completed", depositPaid: true },
  { clientIdx: 4, serviceIdx: 2, staffIdx: 1, appointmentAt: daysAgo(17, 14), status: "no_show",   depositPaid: false },
  { clientIdx: 0, serviceIdx: 4, staffIdx: 2, appointmentAt: daysAgo(15, 9),  status: "completed", depositPaid: true },
  { clientIdx: 1, serviceIdx: 5, staffIdx: 2, appointmentAt: daysAgo(14, 12), status: "completed", depositPaid: true },
  { clientIdx: 2, serviceIdx: 0, staffIdx: 0, appointmentAt: daysAgo(13, 10), status: "completed", depositPaid: true },
  { clientIdx: 3, serviceIdx: 1, staffIdx: 1, appointmentAt: daysAgo(11, 14), status: "completed", depositPaid: true },
  { clientIdx: 0, serviceIdx: 3, staffIdx: 3, appointmentAt: daysAgo(10, 11), status: "completed", depositPaid: true },
  { clientIdx: 1, serviceIdx: 2, staffIdx: 1, appointmentAt: daysAgo(8,  9),  status: "completed", depositPaid: true },
  { clientIdx: 4, serviceIdx: 0, staffIdx: 0, appointmentAt: daysAgo(7,  13), status: "no_show",   depositPaid: true },
  { clientIdx: 2, serviceIdx: 4, staffIdx: 2, appointmentAt: daysAgo(6,  10), status: "completed", depositPaid: true },
  { clientIdx: 3, serviceIdx: 5, staffIdx: 2, appointmentAt: daysAgo(4,  15), status: "completed", depositPaid: true },
  { clientIdx: 0, serviceIdx: 1, staffIdx: 1, appointmentAt: daysAgo(3,  11), status: "completed", depositPaid: true },
  { clientIdx: 1, serviceIdx: 3, staffIdx: 3, appointmentAt: daysAgo(2,  14), status: "completed", depositPaid: true },
  { clientIdx: 2, serviceIdx: 2, staffIdx: 1, appointmentAt: daysAgo(1,  10), status: "cancelled", depositPaid: false },
  // Today
  { clientIdx: 0, serviceIdx: 0, staffIdx: 0, appointmentAt: todayAt(9),  status: "completed",  depositPaid: true },
  { clientIdx: 3, serviceIdx: 3, staffIdx: 3, appointmentAt: todayAt(11), status: "arrived",    depositPaid: true },
  { clientIdx: 4, serviceIdx: 5, staffIdx: 2, appointmentAt: todayAt(14), status: "confirmed",  depositPaid: true },
  // Upcoming
  { clientIdx: 1, serviceIdx: 1, staffIdx: 1, appointmentAt: daysFromNow(1, 10), status: "confirmed", depositPaid: true },
  { clientIdx: 2, serviceIdx: 4, staffIdx: 2, appointmentAt: daysFromNow(1, 14), status: "pending",   depositPaid: false },
  { clientIdx: 0, serviceIdx: 2, staffIdx: 1, appointmentAt: daysFromNow(2, 9),  status: "confirmed", depositPaid: true },
  { clientIdx: 3, serviceIdx: 0, staffIdx: 0, appointmentAt: daysFromNow(3, 11), status: "pending",   depositPaid: false },
  { clientIdx: 4, serviceIdx: 3, staffIdx: 3, appointmentAt: daysFromNow(4, 15), status: "confirmed", depositPaid: true },
  { clientIdx: 1, serviceIdx: 5, staffIdx: 2, appointmentAt: daysFromNow(5, 10), status: "pending",   depositPaid: false },
  { clientIdx: 2, serviceIdx: 1, staffIdx: 1, appointmentAt: daysFromNow(7, 13), status: "pending",   depositPaid: false },
];

async function main() {
  console.log("Clearing existing bookings and activity...");
  await db.delete(activityTable);
  await db.delete(bookingsTable);

  // Reset client stats
  for (const c of clients) {
    await db
      .update(clientsTable)
      .set({ totalVisits: 0, totalSpent: 0, noShowCount: 0, lastVisitAt: null })
      .where(and(eq(clientsTable.id, c.id), eq(clientsTable.salonId, SALON_ID)));
  }

  const clientStats: Record<number, { visits: number; spent: number; noShows: number; lastVisit: Date | null }> = {};
  for (const c of clients) clientStats[c.id] = { visits: 0, spent: 0, noShows: 0, lastVisit: null };

  let inserted = 0;
  for (const def of bookingDefs) {
    const client  = clients[def.clientIdx];
    const service = services[def.serviceIdx];
    const member  = staff[def.staffIdx];

    const [booking] = await db
      .insert(bookingsTable)
      .values({
        salonId:       SALON_ID,
        serviceId:     service.id,
        staffId:       member.id,
        clientId:      client.id,
        clientName:    client.name,
        clientPhone:   client.phone,
        appointmentAt: def.appointmentAt,
        status:        def.status,
        depositAmount: service.depositAmount,
        depositPaid:   def.depositPaid,
        mpesaRef:      def.depositPaid ? mpesaRef() : null,
        refundEligible: false,
        serviceName:   service.name,
        staffName:     member.name,
      })
      .returning();

    // Update in-memory client stats
    const cs = clientStats[client.id];
    if (def.status === "completed") {
      cs.visits++;
      cs.spent += service.price;
      if (!cs.lastVisit || def.appointmentAt > cs.lastVisit) cs.lastVisit = def.appointmentAt;
    } else if (def.status === "no_show") {
      cs.noShows++;
    }

    // Activity row
    const actType =
      def.status === "completed"  ? "booking_completed" :
      def.status === "no_show"    ? "no_show" :
      def.status === "cancelled"  ? "booking_cancelled" :
      def.status === "arrived"    ? "booking_confirmed" :
      "booking_created";

    await db.insert(activityTable).values({
      salonId:     SALON_ID,
      bookingId:   booking.id,
      type:        actType,
      clientName:  client.name,
      serviceName: service.name,
      amount:      def.status === "completed" ? service.depositAmount : null,
    });

    if (def.depositPaid) {
      await db.insert(activityTable).values({
        salonId:     SALON_ID,
        bookingId:   booking.id,
        type:        "deposit_received",
        clientName:  client.name,
        serviceName: service.name,
        amount:      service.depositAmount,
      });
    }

    inserted++;
  }

  // Persist client stats
  for (const c of clients) {
    const cs = clientStats[c.id];
    await db
      .update(clientsTable)
      .set({ totalVisits: cs.visits, totalSpent: cs.spent, noShowCount: cs.noShows, lastVisitAt: cs.lastVisit })
      .where(and(eq(clientsTable.id, c.id), eq(clientsTable.salonId, SALON_ID)));
  }

  console.log(`✓ Seeded ${inserted} bookings`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
