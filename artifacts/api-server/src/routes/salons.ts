import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, salonsTable, servicesTable, staffTable, DEFAULT_BUSINESS_HOURS } from "@workspace/db";
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

const DEFAULT_NOTIF_PREFS = { remind24h: true, remind2h: true, channels: { sms: false, whatsapp: true, email: false }, whatsappNumber: null };
const DEFAULT_CHANNELS = { sms: false, whatsapp: true, email: false };

function normalizeSalon(s: Record<string, unknown>) {
  const raw = (s.notificationPrefs as Record<string, unknown> | null) ?? {};
  const notificationPrefs = {
    ...DEFAULT_NOTIF_PREFS,
    ...raw,
    channels: { ...DEFAULT_CHANNELS, ...((raw.channels as Record<string, boolean> | null) ?? {}) },
  };
  return {
    ...s,
    platformFeePercent: Number(s.platformFeePercent),
    businessHours: (s.businessHours as object | null) ?? DEFAULT_BUSINESS_HOURS,
    notificationPrefs,
    autoBlacklistThreshold: (s.autoBlacklistThreshold as number | null) ?? null,
  };
}

router.get("/salons", async (_req, res): Promise<void> => {
  const salons = await db.select().from(salonsTable).orderBy(salonsTable.createdAt);
  res.json(ListSalonsResponse.parse(salons.map(normalizeSalon)));
});

router.post("/salons", async (req, res): Promise<void> => {
  const parsed = CreateSalonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [salon] = await db.insert(salonsTable).values(parsed.data).returning();
  res.status(201).json(GetSalonResponse.parse(normalizeSalon(salon as unknown as Record<string, unknown>)));
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
    businessHours: salon.businessHours ?? DEFAULT_BUSINESS_HOURS,
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
  res.json(GetSalonResponse.parse(normalizeSalon(salon as unknown as Record<string, unknown>)));
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
  res.json(UpdateSalonResponse.parse(normalizeSalon(salon as unknown as Record<string, unknown>)));
});

export default router;
