import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { salonsTable } from "./salons";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  salonId: integer("salon_id").notNull().references(() => salonsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  totalVisits: integer("total_visits").notNull().default(0),
  noShowCount: integer("no_show_count").notNull().default(0),
  totalSpent: integer("total_spent").notNull().default(0),
  isBlacklisted: boolean("is_blacklisted").notNull().default(false),
  lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
