import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { salonsTable } from "./salons";
import { servicesTable } from "./services";
import { staffTable } from "./staff";

export const waitlistTable = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  salonId: integer("salon_id").notNull().references(() => salonsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staffTable.id),
  serviceId: integer("service_id").references(() => servicesTable.id),
  appointmentAt: timestamp("appointment_at", { withTimezone: true }).notNull(),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  serviceName: text("service_name").notNull(),
  staffName: text("staff_name"),
  notified: boolean("notified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WaitlistEntry = typeof waitlistTable.$inferSelect;
