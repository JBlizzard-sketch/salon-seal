import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, waitlistTable } from "@workspace/db";

const router = Router();

router.get("/salons/:salonId/waitlist", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  if (isNaN(salonId)) { res.status(400).json({ error: "Invalid salonId" }); return; }
  const entries = await db
    .select()
    .from(waitlistTable)
    .where(eq(waitlistTable.salonId, salonId))
    .orderBy(desc(waitlistTable.createdAt));
  res.json({ entries });
});

router.post("/salons/:salonId/waitlist", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  if (isNaN(salonId)) { res.status(400).json({ error: "Invalid salonId" }); return; }
  const { staffId, serviceId, appointmentAt, clientName, clientPhone, serviceName, staffName } = req.body ?? {};
  if (!serviceId || !appointmentAt || !clientName || !clientPhone || !serviceName) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [entry] = await db
    .insert(waitlistTable)
    .values({ salonId, staffId: staffId ?? null, serviceId, appointmentAt: new Date(appointmentAt), clientName, clientPhone, serviceName, staffName: staffName ?? null })
    .returning();
  res.status(201).json(entry);
});

router.delete("/salons/:salonId/waitlist/:id", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  const id = parseInt(req.params.id);
  if (isNaN(salonId) || isNaN(id)) { res.status(400).json({ error: "Invalid params" }); return; }
  await db.delete(waitlistTable).where(and(eq(waitlistTable.id, id), eq(waitlistTable.salonId, salonId)));
  res.status(204).send();
});

router.patch("/salons/:salonId/waitlist/:id/notify", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  const id = parseInt(req.params.id);
  if (isNaN(salonId) || isNaN(id)) { res.status(400).json({ error: "Invalid params" }); return; }
  const [updated] = await db
    .update(waitlistTable)
    .set({ notified: true })
    .where(and(eq(waitlistTable.id, id), eq(waitlistTable.salonId, salonId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
