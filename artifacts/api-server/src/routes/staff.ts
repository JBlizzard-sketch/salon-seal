import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, staffTable, bookingsTable } from "@workspace/db";
import {
  CreateStaffMemberBody,
  UpdateStaffMemberBody,
  CreateStaffMemberParams,
  UpdateStaffMemberParams,
  DeleteStaffMemberParams,
  ListStaffParams,
  ListStaffResponse,
  UpdateStaffMemberResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/salons/:salonId/staff", async (req, res): Promise<void> => {
  const params = ListStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const staff = await db.select().from(staffTable).where(eq(staffTable.salonId, params.data.salonId));
  res.json(ListStaffResponse.parse(staff));
});

router.get("/salons/:salonId/staff/performance", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  if (isNaN(salonId)) { res.status(400).json({ error: "Invalid salonId" }); return; }

  const period = (req.query.period as string) || "month";
  const now = new Date();
  let cutoff: Date | null = null;
  if (period === "week") { cutoff = new Date(now); cutoff.setDate(now.getDate() - 7); }
  else if (period === "month") { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 1); }
  else if (period === "3months") { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3); }
  else if (period === "6months") { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 6); }

  const [allStaff, bookings] = await Promise.all([
    db.select().from(staffTable).where(eq(staffTable.salonId, salonId)),
    db.select().from(bookingsTable).where(
      cutoff
        ? and(eq(bookingsTable.salonId, salonId), eq(bookingsTable.salonId, salonId))
        : eq(bookingsTable.salonId, salonId),
    ),
  ]);

  const cutoffTime = cutoff?.getTime() ?? 0;
  const filtered = cutoff
    ? bookings.filter(b => new Date(b.appointmentAt).getTime() >= cutoffTime)
    : bookings;

  // Aggregate per staff
  const map = new Map<number, { completedBookings: number; totalRevenue: number; noShowCount: number; totalBookings: number }>();
  for (const s of allStaff) map.set(s.id, { completedBookings: 0, totalRevenue: 0, noShowCount: 0, totalBookings: 0 });

  for (const b of filtered) {
    if (b.staffId == null) continue;
    const entry = map.get(b.staffId);
    if (!entry) continue;
    entry.totalBookings++;
    if (b.status === "completed") { entry.completedBookings++; entry.totalRevenue += b.depositAmount; }
    if (b.status === "no_show") entry.noShowCount++;
  }

  const entries = allStaff.map(s => {
    const e = map.get(s.id)!;
    const nonCancelled = filtered.filter(b => b.staffId === s.id && b.status !== "cancelled").length;
    const noShowRate = nonCancelled > 0 ? Math.round((e.noShowCount / nonCancelled) * 1000) / 10 : 0;
    const avgBookingValue = e.completedBookings > 0 ? Math.round(e.totalRevenue / e.completedBookings) : 0;
    return { staffId: s.id, staffName: s.name, role: s.role, isActive: s.isActive, ...e, noShowRate, avgBookingValue };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  res.json({ period, entries });
});

router.post("/salons/:salonId/staff", async (req, res): Promise<void> => {
  const params = CreateStaffMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateStaffMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [member] = await db.insert(staffTable).values({ ...parsed.data, salonId: params.data.salonId }).returning();
  res.status(201).json(member);
});

router.patch("/salons/:salonId/staff/:id", async (req, res): Promise<void> => {
  const params = UpdateStaffMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStaffMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== null && v !== undefined) updates[k] = v;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [member] = await db
    .update(staffTable)
    .set(updates)
    .where(and(eq(staffTable.id, id), eq(staffTable.salonId, params.data.salonId)))
    .returning();
  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  res.json(UpdateStaffMemberResponse.parse(member));
});

router.delete("/salons/:salonId/staff/:id", async (req, res): Promise<void> => {
  const params = DeleteStaffMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [member] = await db
    .delete(staffTable)
    .where(and(eq(staffTable.id, id), eq(staffTable.salonId, params.data.salonId)))
    .returning();
  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
