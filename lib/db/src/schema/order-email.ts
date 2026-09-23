import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ordersTable } from "./commerce";
export const orderEmailJobsTable = pgTable(
  "order_email_jobs",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    audience: text("audience").notNull(),
    recipient: text("recipient"),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    sendPayload: jsonb("send_payload").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerId: text("provider_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("order_email_jobs_audience_unique").on(
      table.orderId,
      table.audience,
    ),
  ],
);
