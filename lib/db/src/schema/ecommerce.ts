import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

export const promotionTypeEnum = pgEnum("promotion_type", [
  "fixed",
  "percentage",
  "amount",
]);

export const branchStatusEnum = pgEnum("branch_status", [
  "active",
  "inactive",
  "archived",
]);

export const reservationProviderEnum = pgEnum("reservation_provider", [
  "opentable",
  "external",
  "none",
]);

export const branchImageTypeEnum = pgEnum("branch_image_type", [
  "hero",
  "gallery",
  "logo",
  "card",
]);

export const branchLinkTypeEnum = pgEnum("branch_link_type", [
  "maps",
  "opentable",
  "whatsapp",
  "instagram",
  "facebook",
  "tripadvisor",
  "uber_eats",
  "rappi",
  "didi_food",
  "external",
  "other",
]);

export const branchAssignmentRoleEnum = pgEnum("branch_assignment_role", [
  "branch_manager",
  "staff",
  "operations",
]);

export type BranchHour = {
  day: string;
  label: string;
  open: string;
  close: string;
  closed: boolean;
  date?: string;
  slotOrder?: number;
};

export type BranchNotificationPreferences = {
  email?: boolean;
  inApp?: boolean;
  /** Queue WhatsApp delivery (no outbound provider yet). */
  whatsapp?: boolean;
  lowStock?: boolean;
  criticalStock?: boolean;
  outOfStock?: boolean;
  newOrder?: boolean;
  cancelledOrder?: boolean;
  incident?: boolean;
};

export const branchesTable = pgTable(
  "branches",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    branchCode: text("branch_code"),
    shortName: text("short_name").notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    address: text("address").notNull(),
    street: text("street"),
    externalNumber: text("external_number"),
    internalNumber: text("internal_number"),
    neighborhood: text("neighborhood").notNull(),
    borough: text("borough"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull().default("México"),
    latitude: numeric("latitude", { mode: "number" }),
    longitude: numeric("longitude", { mode: "number" }),
    placeId: text("place_id"),
    phone: text("phone").notNull(),
    secondaryPhone: text("secondary_phone"),
    whatsapp: text("whatsapp"),
    whatsappDefaultMessage: text("whatsapp_default_message"),
    email: text("email").notNull(),
    ordersEmail: text("orders_email"),
    reservationsEmail: text("reservations_email"),
    adminEmail: text("admin_email"),
    managerName: text("manager_name"),
    managerEmail: text("manager_email"),
    managerPhone: text("manager_phone"),
    notificationPreferences: jsonb("notification_preferences")
      .$type<BranchNotificationPreferences>()
      .notNull()
      .default({
        email: false,
        inApp: true,
        whatsapp: false,
        lowStock: true,
        criticalStock: true,
        outOfStock: true,
      }),
    mapsUrl: text("maps_url").notNull(),
    openTableUrl: text("open_table_url"),
    instagramUrl: text("instagram_url"),
    reservationProvider: reservationProviderEnum("reservation_provider")
      .notNull()
      .default("none"),
    reservationUrl: text("reservation_url"),
    reservationCta: text("reservation_cta").default("Reservar mesa"),
    imageUrl: text("image_url"),
    gallery: jsonb("gallery").$type<string[]>().notNull().default([]),
    hours: jsonb("hours").$type<BranchHour[]>().notNull().default([]),
    pickupAvailable: boolean("pickup_available").notNull().default(true),
    deliveryAvailable: boolean("delivery_available").notNull().default(true),
    deliveryRadiusKm: numeric("delivery_radius_km", { mode: "number" }),
    minimumOrder: numeric("minimum_order", { mode: "number" }),
    freeDeliveryFrom: numeric("free_delivery_from", { mode: "number" }),
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
    featured: boolean("featured").notNull().default(false),
    seoTitle: text("seo_title"),
    metaDescription: text("meta_description"),
    ogImageUrl: text("og_image_url"),
    status: branchStatusEnum("status").notNull().default("active"),
    /** Synced with status for storefront/commerce filters (active=true only when status=active). */
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

export const branchHoursTable = pgTable("branch_hours", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  closed: boolean("closed").notNull().default(false),
  slotOrder: integer("slot_order").notNull().default(0),
});

export const branchSpecialHoursTable = pgTable("branch_special_hours", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  closed: boolean("closed").notNull().default(false),
  label: text("label"),
});

export const branchLinksTable = pgTable("branch_links", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  type: branchLinkTypeEnum("type").notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const branchImagesTable = pgTable("branch_images", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  type: branchImageTypeEnum("type").notNull().default("gallery"),
  alt: text("alt"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const branchAuditLogsTable = pgTable("branch_audit_logs", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    criticalStock: integer("critical_stock"),
    autoAlertEnabled: boolean("auto_alert_enabled").notNull().default(true),
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

export const promotionsTable = pgTable(
  "promotions",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: promotionTypeEnum("type").notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
  },
  (table) => [
    uniqueIndex("promotions_product_name_start_unique").on(
      table.productId,
      table.name,
      table.startsAt,
    ),
  ],
);

export const promotionBranchesTable = pgTable(
  "promotion_branches",
  {
    id: serial("id").primaryKey(),
    promotionId: integer("promotion_id")
      .notNull()
      .references(() => promotionsTable.id, { onDelete: "cascade" }),
    branchId: integer("branch_id")
      .notNull()
      .references(() => branchesTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("promotion_branch_unique").on(
      table.promotionId,
      table.branchId,
    ),
  ],
);

export const importJobsTable = pgTable("import_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  type: text("type").notNull(),
  filename: text("filename"),
  status: text("status").notNull().default("pending"),
  createdCount: integer("created_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  errorLog: jsonb("error_log").$type<Array<Record<string, unknown>>>().notNull().default([]),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("import_jobs_idempotency_unique").on(table.idempotencyKey),
]);

export type ImportJob = typeof importJobsTable.$inferSelect;

/** Many-to-many product ↔ category (primary flagged for breadcrumbs/SEO). */
export const productCategoriesTable = pgTable(
  "product_categories",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => [
    uniqueIndex("product_categories_unique").on(table.productId, table.categoryId),
  ],
);

/** Canonical tag entities (slug normalized for case/space-insensitive dedupe). */
export const tagsTable = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("tags_slug_unique").on(table.slug)],
);

export const productTagsTable = pgTable(
  "product_tags",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tagsTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("product_tags_unique").on(table.productId, table.tagId),
  ],
);

/** Manual cross-sell recommendations (MVP); branch_id reserved for future per-branch sets. */
export const productCrossSellsTable = pgTable(
  "product_cross_sells",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    crossSellProductId: integer("cross_sell_product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    branchId: integer("branch_id").references(() => branchesTable.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    uniqueIndex("product_cross_sells_unique").on(
      table.productId,
      table.crossSellProductId,
      table.branchId,
    ),
    check(
      "product_cross_sells_no_self",
      sql`${table.productId} <> ${table.crossSellProductId}`,
    ),
  ],
);

export const catalogChangeLogTable = pgTable("catalog_change_log", {
  id: serial("id").primaryKey(),
  actorUserId: text("actor_user_id"),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
export const insertPromotionSchema = createInsertSchema(promotionsTable).omit({
  id: true,
  createdAt: true,
});

export type Branch = typeof branchesTable.$inferSelect;
export type BranchHourRow = typeof branchHoursTable.$inferSelect;
export type BranchSpecialHour = typeof branchSpecialHoursTable.$inferSelect;
export type BranchLink = typeof branchLinksTable.$inferSelect;
export type BranchImage = typeof branchImagesTable.$inferSelect;
export type BranchAuditLog = typeof branchAuditLogsTable.$inferSelect;
export type Category = typeof categoriesTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
export type ProductVariant = typeof productVariantsTable.$inferSelect;
export type BranchProduct = typeof branchProductsTable.$inferSelect;
export type Promotion = typeof promotionsTable.$inferSelect;
export type PromotionBranch = typeof promotionBranchesTable.$inferSelect;
export type ProductCategory = typeof productCategoriesTable.$inferSelect;
export type Tag = typeof tagsTable.$inferSelect;
export type ProductTag = typeof productTagsTable.$inferSelect;
export type ProductCrossSell = typeof productCrossSellsTable.$inferSelect;
export type CatalogChangeLog = typeof catalogChangeLogTable.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;