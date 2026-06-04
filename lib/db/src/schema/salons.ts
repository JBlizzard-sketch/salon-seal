import { pgTable, serial, text, integer, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type BusinessDayHours = { isOpen: boolean; openTime: string; closeTime: string };
export type BusinessHours = Record<"monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday", BusinessDayHours>;
export type NotificationChannels = { sms: boolean; whatsapp: boolean; email: boolean };
export type NotificationPrefs = { remind24h: boolean; remind2h: boolean; channels: NotificationChannels; whatsappNumber?: string | null };

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday:    { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  tuesday:   { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  wednesday: { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  thursday:  { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  friday:    { isOpen: true,  openTime: "09:00", closeTime: "18:00" },
  saturday:  { isOpen: true,  openTime: "09:00", closeTime: "17:00" },
  sunday:    { isOpen: false, openTime: "09:00", closeTime: "17:00" },
};

export const salonsTable = pgTable("salons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  phone: text("phone").notNull(),
  location: text("location").notNull(),
  cancellationWindowHours: integer("cancellation_window_hours").notNull().default(24),
  platformFeePercent: numeric("platform_fee_percent", { precision: 5, scale: 2 }).notNull().default("2.50"),
  monthlyRevenueGoal: integer("monthly_revenue_goal"),
  autoBlacklistThreshold: integer("auto_blacklist_threshold"),
  businessHours: jsonb("business_hours").$type<BusinessHours>(),
  notificationPrefs: jsonb("notification_prefs").$type<NotificationPrefs>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSalonSchema = createInsertSchema(salonsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSalon = z.infer<typeof insertSalonSchema>;
export type Salon = typeof salonsTable.$inferSelect;
