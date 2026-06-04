import { Router, type IRouter } from "express";
import { eq, and, lt, gt, gte, lte } from "drizzle-orm";
import { db, staffBlocksTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/salons/:salonId/staff/:staffId/blocks", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  const staffId = parseInt(req.params.staffId);
  if (isNaN(salonId) || isNaN(staffId)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const conditions = [
    eq(staffBlocksTable.salonId, salonId),
    eq(staffBlocksTable.staffId, staffId),
  ];
  if (from) conditions.push(gte(staffBlocksTable.endAt, new Date(from)));
  if (to) conditions.push(lte(staffBlocksTable.startAt, new Date(to)));

  const blocks = await db
    .select()
    .from(staffBlocksTable)
    .where(and(...conditions))
    .orderBy(staffBlocksTable.startAt);

  res.json({ blocks: blocks.map(b => ({ ...b, startAt: b.startAt.toISOString(), endAt: b.endAt.toISOString(), createdAt: b.createdAt.toISOString() })) });
});

router.post("/salons/:salonId/staff/:staffId/blocks", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  const staffId = parseInt(req.params.staffId);
  if (isNaN(salonId) || isNaN(staffId)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const { startAt, endAt, reason } = req.body;
  if (!startAt || !endAt) {
    res.status(400).json({ error: "startAt and endAt are required" });
    return;
  }
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    res.status(400).json({ error: "Invalid time range: endAt must be after startAt" });
    return;
  }

  const [block] = await db
    .insert(staffBlocksTable)
    .values({ salonId, staffId, startAt: start, endAt: end, reason: reason ?? null })
    .returning();

  res.status(201).json({ block: { ...block, startAt: block.startAt.toISOString(), endAt: block.endAt.toISOString(), createdAt: block.createdAt.toISOString() } });
});

router.delete("/salons/:salonId/staff/:staffId/blocks/:blockId", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  const staffId = parseInt(req.params.staffId);
  const blockId = parseInt(req.params.blockId);
  if (isNaN(salonId) || isNaN(staffId) || isNaN(blockId)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  await db.delete(staffBlocksTable).where(
    and(
      eq(staffBlocksTable.id, blockId),
      eq(staffBlocksTable.staffId, staffId),
      eq(staffBlocksTable.salonId, salonId),
    ),
  );

  res.json({ success: true });
});

export default router;
