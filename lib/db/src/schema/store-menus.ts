import { customType, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { branchesTable } from "./ecommerce";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const storeMenusTable = pgTable("store_menus", {
  menuKey: text("menu_key").primaryKey(),
  scope: text("scope").notNull(),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  fileData: bytea("file_data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
