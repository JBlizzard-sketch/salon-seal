import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, servicesTable } from "@workspace/db";
import {
  CreateServiceBody,
  UpdateServiceBody,
  CreateServiceParams,
  UpdateServiceParams,
  DeleteServiceParams,
  ListServicesParams,
  ListServicesResponse,
  UpdateServiceResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/salons/:salonId/services", async (req, res): Promise<void> => {
  const params = ListServicesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const services = await db.select().from(servicesTable).where(eq(servicesTable.salonId, params.data.salonId));
  res.json(ListServicesResponse.parse(services));
});

router.post("/salons/:salonId/services", async (req, res): Promise<void> => {
  const params = CreateServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [service] = await db.insert(servicesTable).values({ ...parsed.data, salonId: params.data.salonId }).returning();
  res.status(201).json(service);
});

router.patch("/salons/:salonId/services/:id", async (req, res): Promise<void> => {
  const params = UpdateServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateServiceBody.safeParse(req.body);
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
  const [service] = await db
    .update(servicesTable)
    .set(updates)
    .where(and(eq(servicesTable.id, id), eq(servicesTable.salonId, params.data.salonId)))
    .returning();
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  res.json(UpdateServiceResponse.parse(service));
});

router.delete("/salons/:salonId/services/:id", async (req, res): Promise<void> => {
  const params = DeleteServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [service] = await db
    .delete(servicesTable)
    .where(and(eq(servicesTable.id, params.data.id), eq(servicesTable.salonId, params.data.salonId)))
    .returning();
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
