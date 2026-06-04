import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { salonsTable } from "./salons";
import { staffTable } from "./staff";

export const staffBlocksTable = pgTable("staff_blocks", {
  id: serial("id").primaryKey(),
  salonId: integer("salon_id").notNull().references(() => salonsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffBlock = typeof staffBlocksTable.$inferSelect;
