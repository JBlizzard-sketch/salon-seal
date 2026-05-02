import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { salonsTable } from "./salons";
import { servicesTable } from "./services";
import { staffTable } from "./staff";
import { clientsTable } from "./clients";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  salonId: integer("salon_id").notNull().references(() => salonsTable.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id),
  staffId: integer("staff_id").references(() => staffTable.id),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  appointmentAt: timestamp("appointment_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  depositAmount: integer("deposit_amount").notNull(),
  depositPaid: boolean("deposit_paid").notNull().default(false),
  mpesaRef: text("mpesa_ref"),
  refundEligible: boolean("refund_eligible").notNull().default(false),
  notes: text("notes"),
  serviceName: text("service_name").notNull(),
  staffName: text("staff_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
