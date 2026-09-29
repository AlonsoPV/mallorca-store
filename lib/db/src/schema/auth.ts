import { integer, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const usernameLoginAttemptsTable = pgTable(
  "username_login_attempts",
  {
    key: text("key").primaryKey(),
    attempts: integer("attempts").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("username_login_attempts_window_idx").on(table.windowStartedAt)],
);