import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { salonsTable } from "./salons";
import { bookingsTable } from "./bookings";

export const remindersTable = pgTable("reminders", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  salonId: integer("salon_id").notNull().references(() => salonsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  channel: text("channel").notNull().default("whatsapp"),
  phoneNumber: text("phone_number").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("sent"),
  messageId: text("message_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Reminder = typeof remindersTable.$inferSelect;
