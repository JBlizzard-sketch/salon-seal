import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, staffTable } from "@workspace/db";
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
