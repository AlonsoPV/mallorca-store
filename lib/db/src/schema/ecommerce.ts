import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "inactive",
]);

export type BranchHour = {
  day: string;
  label: string;
  open: string;
  close: string;
  closed: boolean;
};

export const branchesTable = pgTable(
  "branches",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    branchCode: text("branch_code"),
    shortName: text("short_name").notNull(),
    description: text("description"),
    address: text("address").notNull(),
    neighborhood: text("neighborhood").notNull(),
    borough: text("borough"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull().default("México"),
    latitude: numeric("latitude", { mode: "number" }),
    longitude: numeric("longitude", { mode: "number" }),
    phone: text("phone").notNull(),
    whatsapp: text("whatsapp"),
    email: text("email").notNull(),
    managerName: text("manager_name"),
    managerEmail: text("manager_email"),
    managerPhone: text("manager_phone"),
    notificationPreferences: jsonb("notification_preferences")
      .$type<{ email?: boolean; inApp?: boolean }>()
      .notNull()
      .default({ email: false, inApp: true }),
    mapsUrl: text("maps_url").notNull(),
    openTableUrl: text("open_table_url"),
    instagramUrl: text("instagram_url"),
    imageUrl: text("image_url"),
    gallery: jsonb("gallery").$type<string[]>().notNull().default([]),
    hours: jsonb("hours").$type<BranchHour[]>().notNull().default([]),
    pickupAvailable: boolean("pickup_available").notNull().default(true),
    deliveryAvailable: boolean("delivery_available").notNull().default(true),
    deliveryRadiusKm: numeric("delivery_radius_km", { mode: "number" }),
    minimumOrder: numeric("minimum_order", { mode: "number" }),
    preparationTimeMinutes: integer("preparation_time_minutes")
      .notNull()
      .default(30),
    deliveryTimeMinutes: integer("delivery_time_minutes").notNull().default(60),
    pickupSlotIntervalMinutes: integer("pickup_slot_interval_minutes")
      .notNull()
      .default(30),
    pickupSlotCapacity: integer("pickup_slot_capacity").notNull().default(8),
    deliveryFee: numeric("delivery_fee", { mode: "number" })
      .notNull()
      .default(90),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("branches_slug_unique").on(table.slug),
    uniqueIndex("branches_code_unique").on(table.branchCode),
  ],
);

export const categoriesTable = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("categories_slug_unique").on(table.slug)],
);

export const productsTable = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    shortDescription: text("short_description").notNull(),
    description: text("description").notNull(),
    price: numeric("price", { mode: "number" }).notNull(),
    salePrice: numeric("sale_price", { mode: "number" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    imageUrl: text("image_url"),
    gallery: jsonb("gallery").$type<string[]>().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    ingredients: text("ingredients"),
    allergens: text("allergens"),
    conservation: text("conservation"),
    weight: text("weight"),
    portions: text("portions"),
    featured: boolean("featured").notNull().default(false),
    seasonal: boolean("seasonal").notNull().default(false),
    status: productStatusEnum("status").notNull().default("draft"),
    minimumLeadTimeHours: integer("minimum_lead_time_hours")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("products_sku_unique").on(table.sku),
    uniqueIndex("products_slug_unique").on(table.slug),
  ],
);

export const productVariantsTable = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    value: text("value").notNull(),
    sku: text("sku").notNull(),
    price: numeric("price", { mode: "number" }).notNull(),
    salePrice: numeric("sale_price", { mode: "number" }),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("product_variants_sku_unique").on(table.sku)],
);

export const branchProductsTable = pgTable(
  "branch_products",
  {
    id: serial("id").primaryKey(),
    branchId: integer("branch_id")
      .notNull()
      .references(() => branchesTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    available: boolean("available").notNull().default(true),
    inventory: integer("inventory").notNull().default(0),
    minStock: integer("min_stock").notNull().default(0),
    alertState: text("alert_state").notNull().default("NORMAL"),
    responsibleUserId: text("responsible_user_id"),
    priceOverride: numeric("price_override", { mode: "number" }),
    salePriceOverride: numeric("sale_price_override", { mode: "number" }),
    preparationTimeMinutes: integer("preparation_time_minutes"),
    pickupAvailable: boolean("pickup_available").notNull().default(true),
    deliveryAvailable: boolean("delivery_available").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("branch_products_branch_product_unique").on(
      table.branchId,
      table.productId,
    ),
  ],
);

export const insertBranchSchema = createInsertSchema(branchesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCategorySchema = createInsertSchema(categoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Branch = typeof branchesTable.$inferSelect;
export type Category = typeof categoriesTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
export type ProductVariant = typeof productVariantsTable.$inferSelect;
export type BranchProduct = typeof branchProductsTable.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;