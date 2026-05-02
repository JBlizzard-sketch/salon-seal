import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db, bookingsTable, activityTable } from "@workspace/db";
import {
  GetDashboardSummaryParams,
  GetSalonAnalyticsParams,
  GetRecentActivityParams,
  GetRecentActivityQueryParams,
  GetDashboardSummaryResponse,
  GetSalonAnalyticsResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/salons/:salonId/dashboard", async (req, res): Promise<void> => {
  const params = GetDashboardSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { salonId } = params.data;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayBookings = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.salonId, salonId),
        gte(bookingsTable.appointmentAt, todayStart),
        lte(bookingsTable.appointmentAt, todayEnd),
      ),
    )
    .orderBy(bookingsTable.appointmentAt);

  const completedToday = todayBookings.filter((b) => b.status === "completed").length;
  const noShowsToday = todayBookings.filter((b) => b.status === "no_show").length;
  const todayRevenue = todayBookings
    .filter((b) => b.status === "completed")
    .reduce((sum, b) => sum + b.depositAmount, 0);

  // All confirmed bookings pending attendance
  const allBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.salonId, salonId));
  const totalCompleted = allBookings.filter((b) => b.status === "completed").length;
  const totalNoShows = allBookings.filter((b) => b.status === "no_show").length;
  const noShowRate = totalCompleted + totalNoShows > 0 ? (totalNoShows / (totalCompleted + totalNoShows)) * 100 : 0;

  const depositsHeld = allBookings
    .filter((b) => b.status === "confirmed" || b.status === "pending")
    .reduce((sum, b) => (b.depositPaid ? sum + b.depositAmount : sum), 0);

  const pendingBookings = allBookings.filter((b) => b.status === "pending" || b.status === "confirmed").length;

  const now = new Date();
  const upcomingBookings = allBookings
    .filter((b) => new Date(b.appointmentAt) > now && (b.status === "confirmed" || b.status === "pending"))
    .sort((a, b) => new Date(a.appointmentAt).getTime() - new Date(b.appointmentAt).getTime())
    .slice(0, 10);

  res.json(
    GetDashboardSummaryResponse.parse({
      todayBookings: todayBookings.length,
      todayRevenue,
      depositsHeld,
      noShowRate: Math.round(noShowRate * 10) / 10,
      pendingBookings,
      completedToday,
      noShowsToday,
      upcomingBookings,
    }),
  );
});

router.get("/salons/:salonId/analytics", async (req, res): Promise<void> => {
  const params = GetSalonAnalyticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { salonId } = params.data;

  const allBookings = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.salonId, salonId)));

  // Peak days
  const dayCounts: Record<string, number> = {};
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (const b of allBookings) {
    const day = dayNames[new Date(b.appointmentAt).getDay()];
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  const peakDays = Object.entries(dayCounts)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => b.count - a.count);

  // Popular services
  const serviceCounts: Record<number, { serviceName: string; count: number; revenue: number }> = {};
  for (const b of allBookings) {
    if (!serviceCounts[b.serviceId]) {
      serviceCounts[b.serviceId] = { serviceName: b.serviceName, count: 0, revenue: 0 };
    }
    serviceCounts[b.serviceId].count++;
    if (b.status === "completed") serviceCounts[b.serviceId].revenue += b.depositAmount;
  }
  const popularServices = Object.entries(serviceCounts)
    .map(([serviceId, data]) => ({ serviceId: Number(serviceId), ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Weekly trend (last 8 weeks)
  const weeklyMap: Record<string, { bookings: number; revenue: number; noShows: number }> = {};
  for (const b of allBookings) {
    const d = new Date(b.appointmentAt);
    const mon = new Date(d);
    mon.setDate(d.getDate() - d.getDay() + 1);
    const week = mon.toISOString().split("T")[0];
    if (!weeklyMap[week]) weeklyMap[week] = { bookings: 0, revenue: 0, noShows: 0 };
    weeklyMap[week].bookings++;
    if (b.status === "completed") weeklyMap[week].revenue += b.depositAmount;
    if (b.status === "no_show") weeklyMap[week].noShows++;
  }
  const weeklyTrend = Object.entries(weeklyMap)
    .map(([week, data]) => ({ week, ...data }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-8);

  // Staff performance
  const staffMap: Record<number, { staffName: string; bookings: number; completed: number; noShows: number }> = {};
  for (const b of allBookings) {
    if (!b.staffId) continue;
    if (!staffMap[b.staffId]) {
      staffMap[b.staffId] = { staffName: b.staffName ?? "Unknown", bookings: 0, completed: 0, noShows: 0 };
    }
    staffMap[b.staffId].bookings++;
    if (b.status === "completed") staffMap[b.staffId].completed++;
    if (b.status === "no_show") staffMap[b.staffId].noShows++;
  }
  const staffPerformance = Object.entries(staffMap).map(([staffId, data]) => ({ staffId: Number(staffId), ...data }));

  res.json(
    GetSalonAnalyticsResponse.parse({ peakDays, popularServices, weeklyTrend, staffPerformance }),
  );
});

router.get("/salons/:salonId/recent-activity", async (req, res): Promise<void> => {
  const params = GetRecentActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = query.success && query.data.limit ? query.data.limit : 20;

  const activity = await db
    .select()
    .from(activityTable)
    .where(eq(activityTable.salonId, params.data.salonId))
    .orderBy(desc(activityTable.occurredAt))
    .limit(limit);

  res.json(GetRecentActivityResponse.parse(activity));
});

export default router;
