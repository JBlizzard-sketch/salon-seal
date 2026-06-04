import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db, bookingsTable, activityTable, salonsTable } from "@workspace/db";
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

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthRevenue = allBookings
    .filter((b) => b.status === "completed" && new Date(b.appointmentAt) >= monthStart)
    .reduce((sum, b) => sum + b.depositAmount, 0);

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
      monthRevenue,
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

  const period = (req.query.period as string) || "all";
  const now = new Date();
  let cutoff: Date | null = null;
  if (period === "week") {
    cutoff = new Date(now); cutoff.setDate(now.getDate() - 7);
  } else if (period === "month") {
    cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 1);
  } else if (period === "3months") {
    cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3);
  } else if (period === "6months") {
    cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 6);
  }

  const allBookings = await db
    .select()
    .from(bookingsTable)
    .where(
      cutoff
        ? and(eq(bookingsTable.salonId, salonId), gte(bookingsTable.appointmentAt, cutoff))
        : eq(bookingsTable.salonId, salonId),
    );

  // All-time bookings for monthly revenue chart (always last 12 months)
  const twelveMonthsCutoff = new Date(now);
  twelveMonthsCutoff.setMonth(now.getMonth() - 11);
  twelveMonthsCutoff.setDate(1);
  twelveMonthsCutoff.setHours(0, 0, 0, 0);
  const allTimeBookings = cutoff
    ? await db.select().from(bookingsTable).where(and(eq(bookingsTable.salonId, salonId), gte(bookingsTable.appointmentAt, twelveMonthsCutoff)))
    : allBookings;

  // Summary
  const completed = allBookings.filter(b => b.status === "completed");
  const noShows = allBookings.filter(b => b.status === "no_show");
  const nonCancelled = allBookings.filter(b => b.status !== "cancelled");
  const totalRevenue = completed.reduce((s, b) => s + b.depositAmount, 0);
  const depositCollected = allBookings.filter(b => b.depositPaid).reduce((s, b) => s + b.depositAmount, 0);
  const totalBookings = allBookings.length;
  const completedBookings = completed.length;
  const noShowBookings = noShows.length;
  const completionRate = nonCancelled.length > 0 ? Math.round((completedBookings / nonCancelled.length) * 1000) / 10 : 0;
  const noShowRate = nonCancelled.length > 0 ? Math.round((noShowBookings / nonCancelled.length) * 1000) / 10 : 0;
  const depositCollectionRate = totalBookings > 0 ? Math.round((allBookings.filter(b => b.depositPaid).length / totalBookings) * 1000) / 10 : 0;

  const summary = { totalRevenue, depositCollected, totalBookings, completedBookings, noShowBookings, completionRate, noShowRate, depositCollectionRate };

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
    if (!serviceCounts[b.serviceId]) serviceCounts[b.serviceId] = { serviceName: b.serviceName, count: 0, revenue: 0 };
    serviceCounts[b.serviceId].count++;
    if (b.status === "completed") serviceCounts[b.serviceId].revenue += b.depositAmount;
  }
  const popularServices = Object.entries(serviceCounts)
    .map(([serviceId, data]) => ({ serviceId: Number(serviceId), ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Weekly trend (last 8 within period)
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

  // Monthly revenue (last 12 months always)
  const monthlyMap: Record<string, { bookings: number; revenue: number; noShows: number }> = {};
  for (const b of allTimeBookings) {
    const d = new Date(b.appointmentAt);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[month]) monthlyMap[month] = { bookings: 0, revenue: 0, noShows: 0 };
    monthlyMap[month].bookings++;
    if (b.status === "completed") monthlyMap[month].revenue += b.depositAmount;
    if (b.status === "no_show") monthlyMap[month].noShows++;
  }
  const monthlyRevenue = Object.entries(monthlyMap)
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);

  // Staff performance
  const staffMap: Record<number, { staffName: string; bookings: number; completed: number; noShows: number }> = {};
  for (const b of allBookings) {
    if (!b.staffId) continue;
    if (!staffMap[b.staffId]) staffMap[b.staffId] = { staffName: b.staffName ?? "Unknown", bookings: 0, completed: 0, noShows: 0 };
    staffMap[b.staffId].bookings++;
    if (b.status === "completed") staffMap[b.staffId].completed++;
    if (b.status === "no_show") staffMap[b.staffId].noShows++;
  }
  const staffPerformance = Object.entries(staffMap).map(([staffId, data]) => ({ staffId: Number(staffId), ...data }));

  // Peak hours (0–23)
  const hourCounts: Record<number, number> = {};
  for (const b of allBookings) {
    const h = new Date(b.appointmentAt).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const fmt12 = (h: number) => h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
  const peakHours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: fmt12(h),
    count: hourCounts[h] ?? 0,
  })).filter(p => p.count > 0);

  // No-show heatmap: day (0=Sun..6=Sat) × hour
  const noShowCells: Record<string, number> = {};
  for (const b of noShows) {
    const d = new Date(b.appointmentAt);
    const key = `${d.getDay()}_${d.getHours()}`;
    noShowCells[key] = (noShowCells[key] ?? 0) + 1;
  }
  const noShowHeatmap = Object.entries(noShowCells).map(([key, count]) => {
    const [day, hour] = key.split("_").map(Number);
    return { day, dayLabel: dayNames[day], hour, count };
  });

  res.json(
    GetSalonAnalyticsResponse.parse({ summary, peakDays, popularServices, weeklyTrend, monthlyRevenue, staffPerformance, peakHours, noShowHeatmap }),
  );
});

router.get("/salons/:salonId/analytics/export", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId, 10);
  if (isNaN(salonId)) { res.status(400).json({ error: "Invalid salonId" }); return; }

  const period = (req.query.period as string) || "all";
  const now = new Date();
  let cutoff: Date | null = null;
  if (period === "week") { cutoff = new Date(now); cutoff.setDate(now.getDate() - 7); }
  else if (period === "month") { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 1); }
  else if (period === "3months") { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3); }
  else if (period === "6months") { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 6); }

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(
      cutoff
        ? and(eq(bookingsTable.salonId, salonId), gte(bookingsTable.appointmentAt, cutoff))
        : eq(bookingsTable.salonId, salonId),
    );

  const rows = [
    ["Date", "Client", "Phone", "Service", "Staff", "Status", "Price (Ksh)", "Deposit (Ksh)", "Deposit Paid", "M-Pesa Ref"],
    ...bookings.map(b => [
      new Date(b.appointmentAt).toISOString().split("T")[0],
      b.clientName,
      b.clientPhone,
      b.serviceName,
      b.staffName ?? "",
      b.status,
      "",
      String(b.depositAmount),
      b.depositPaid ? "Yes" : "No",
      b.mpesaRef ?? "",
    ]),
  ];

  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="salon-analytics-${period}.csv"`);
  res.send(csv);
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
