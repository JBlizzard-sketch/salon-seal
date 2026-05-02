import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, salonsTable, servicesTable, staffTable } from "@workspace/db";
import {
  CreateSalonBody,
  UpdateSalonBody,
  GetSalonParams,
  UpdateSalonParams,
  GetSalonBySlugParams,
  ListSalonsResponse,
  GetSalonResponse,
  UpdateSalonResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/salons", async (_req, res): Promise<void> => {
  const salons = await db.select().from(salonsTable).orderBy(salonsTable.createdAt);
  res.json(ListSalonsResponse.parse(salons.map((s) => ({ ...s, platformFeePercent: Number(s.platformFeePercent) }))));
});

router.post("/salons", async (req, res): Promise<void> => {
  const parsed = CreateSalonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [salon] = await db.insert(salonsTable).values(parsed.data).returning();
  res.status(201).json(GetSalonResponse.parse({ ...salon, platformFeePercent: Number(salon.platformFeePercent) }));
});

router.get("/salons/by-slug/:slug", async (req, res): Promise<void> => {
  const params = GetSalonBySlugParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [salon] = await db.select().from(salonsTable).where(eq(salonsTable.slug, params.data.slug));
  if (!salon) {
    res.status(404).json({ error: "Salon not found" });
    return;
  }
  const services = await db.select().from(servicesTable).where(eq(servicesTable.salonId, salon.id));
  const staff = await db.select().from(staffTable).where(eq(staffTable.salonId, salon.id));
  res.json({
    ...salon,
    platformFeePercent: Number(salon.platformFeePercent),
    services,
    staff,
  });
});

router.get("/salons/:id", async (req, res): Promise<void> => {
  const params = GetSalonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [salon] = await db.select().from(salonsTable).where(eq(salonsTable.id, params.data.id));
  if (!salon) {
    res.status(404).json({ error: "Salon not found" });
    return;
  }
  res.json(GetSalonResponse.parse({ ...salon, platformFeePercent: Number(salon.platformFeePercent) }));
});

router.patch("/salons/:id", async (req, res): Promise<void> => {
  const params = UpdateSalonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSalonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== null && v !== undefined) updates[k] = v;
  }
  const [salon] = await db.update(salonsTable).set(updates).where(eq(salonsTable.id, params.data.id)).returning();
  if (!salon) {
    res.status(404).json({ error: "Salon not found" });
    return;
  }
  res.json(UpdateSalonResponse.parse({ ...salon, platformFeePercent: Number(salon.platformFeePercent) }));
});

export default router;
