import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, clientsTable, bookingsTable } from "@workspace/db";
import {
  ListClientsParams,
  GetClientParams,
  ListClientsResponse,
  GetClientResponse,
} from "@workspace/api-zod";
const router: IRouter = Router();

router.get("/salons/:salonId/clients", async (req, res): Promise<void> => {
  const params = ListClientsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const clients = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.salonId, params.data.salonId))
    .orderBy(desc(clientsTable.totalVisits));
  res.json(ListClientsResponse.parse(clients));
});

router.get("/salons/:salonId/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(and(eq(clientsTable.id, params.data.id), eq(clientsTable.salonId, params.data.salonId)));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const recentBookings = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.clientId, client.id))
    .orderBy(desc(bookingsTable.appointmentAt))
    .limit(10);
  res.json(GetClientResponse.parse({ ...client, recentBookings }));
});

router.patch("/salons/:salonId/clients/:id/blacklist", async (req, res): Promise<void> => {
  const salonId = parseInt(req.params.salonId);
  const id = parseInt(req.params.id);
  if (isNaN(salonId) || isNaN(id)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const isBlacklisted = req.body?.isBlacklisted;
  if (typeof isBlacklisted !== "boolean") {
    res.status(400).json({ error: "isBlacklisted must be a boolean" });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(and(eq(clientsTable.id, id), eq(clientsTable.salonId, salonId)));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  await db
    .update(clientsTable)
    .set({ isBlacklisted })
    .where(eq(clientsTable.id, id));

  const recentBookings = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.clientId, client.id))
    .orderBy(desc(bookingsTable.appointmentAt))
    .limit(10);

  res.json(GetClientResponse.parse({ ...client, isBlacklisted, recentBookings }));
});

export default router;
