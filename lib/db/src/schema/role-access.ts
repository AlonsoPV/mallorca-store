import { pgTable, integer, jsonb, text, timestamp, bigserial, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const roleAccessPolicyTable = pgTable("role_access_policy", {
  id: integer("id").primaryKey(),
  policy: jsonb("policy").notNull().$type<Record<string, Record<string, boolean>>>(),
  version: integer("version").notNull().default(0),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [check("role_access_policy_id_check", sql`${table.id} = 1`)]);
export const roleAccessAuditTable = pgTable("role_access_audit", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: text("actor_id").notNull(),
  beforePolicy: jsonb("before_policy").notNull(),
  afterPolicy: jsonb("after_policy").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
