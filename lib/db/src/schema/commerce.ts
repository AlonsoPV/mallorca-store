import {
  boolean,
  integer,
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
import {
  branchesTable,
  branchProductsTable,
  productsTable,
  productVariantsTable,
} from "./ecommerce";

export const userRoleEnum = pgEnum("user_role", [
  "customer",
  "staff",
  "manager",
  "admin",
  "branch_manager",
  "operations",
  "operations_manager",
]);
export const cartStatusEnum = pgEnum("cart_status", [
  "active",
  "converted",
  "abandoned",
]);
export const fulfillmentMethodEnum = pgEnum("fulfillment_method", [
  "pickup",
  "delivery",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "processing",
  "paid",
  "failed",
  "refunded",
]);
export const reservationStatusEnum = pgEnum("reservation_status", [
  "active",
  "committed",
  "released",
]);
export const inventoryMovementEnum = pgEnum("inventory_movement", [
  "reserve",
  "release",
  "sale",
  "adjustment",
]);
export const inventoryMovementCategoryEnum = pgEnum("inventory_movement_category", [
  "reserve",
  "release",
  "sale",
  "adjustment",
  "manual",
  "import",
]);
export const inventoryAlertStateEnum = pgEnum("inventory_alert_state", [
  "NORMAL",
  "LOW_STOCK",
  "OUT_OF_STOCK",
]);
export const inventoryAlertTypeEnum = pgEnum("inventory_alert_type", [
  "LOW_STOCK",
  "OUT_OF_STOCK",
]);

export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    role: userRoleEnum("role").notNull().default("customer"),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_stripe_customer_unique").on(table.stripeCustomerId),
  ],
);

export const addressesTable = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Casa"),
  recipientName: text("recipient_name").notNull(),
  phone: text("phone").notNull(),
  street: text("street").notNull(),
  exteriorNumber: text("exterior_number").notNull(),
  interiorNumber: text("interior_number"),
  neighborhood: text("neighborhood").notNull(),
  borough: text("borough").notNull(),
  postalCode: text("postal_code").notNull(),
  reference: text("reference"),
  latitude: numeric("latitude", { mode: "number" }).notNull(),
  longitude: numeric("longitude", { mode: "number" }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cartsTable = pgTable("carts", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  branchId: integer("branch_id")
    .notNull()
    .references(() => branchesTable.id),
  status: cartStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const cartItemsTable = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => cartsTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id),
    variantId: integer("variant_id").references(() => productVariantsTable.id),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("cart_items_cart_product_variant_unique").on(
      table.cartId,
      table.productId,
      table.variantId,
    ),
  ],
);

export const ordersTable = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    guestAccessToken: text("guest_access_token").notNull(),
    userId: text("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    branchId: integer("branch_id")
      .notNull()
      .references(() => branchesTable.id),
    cartId: text("cart_id").references(() => cartsTable.id),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("unpaid"),
    fulfillmentMethod: fulfillmentMethodEnum("fulfillment_method").notNull(),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    deliveryAddress: text("delivery_address"),
    deliveryLatitude: numeric("delivery_latitude", { mode: "number" }),
    deliveryLongitude: numeric("delivery_longitude", { mode: "number" }),
    customerNotes: text("customer_notes"),
    subtotal: numeric("subtotal", { mode: "number" }).notNull(),
    deliveryFee: numeric("delivery_fee", { mode: "number" }).notNull().default(0),
    total: numeric("total", { mode: "number" }).notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    inventoryCommittedAt: timestamp("inventory_committed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("orders_order_number_unique").on(table.orderNumber),
    uniqueIndex("orders_cart_unique").on(table.cartId),
    uniqueIndex("orders_payment_intent_unique").on(table.stripePaymentIntentId),
  ],
);

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id),
  variantId: integer("variant_id").references(() => productVariantsTable.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  variantLabel: text("variant_label"),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { mode: "number" }).notNull(),
  lineTotal: numeric("line_total", { mode: "number" }).notNull(),
});

export const inventoryReservationsTable = pgTable("inventory_reservations", {
  id: serial("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  branchProductId: integer("branch_product_id")
    .notNull()
    .references(() => branchProductsTable.id),
  quantity: integer("quantity").notNull(),
  status: reservationStatusEnum("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inventoryLedgerTable = pgTable("inventory_ledger", {
  id: serial("id").primaryKey(),
  branchProductId: integer("branch_product_id")
    .notNull()
    .references(() => branchProductsTable.id),
  orderId: text("order_id").references(() => ordersTable.id, {
    onDelete: "set null",
  }),
  movement: inventoryMovementEnum("movement").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  previousBalance: integer("previous_balance"),
  newBalance: integer("new_balance"),
  actorUserId: text("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reference: text("reference"),
  category: inventoryMovementCategoryEnum("category").notNull().default("adjustment"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const branchUserAssignmentsTable = pgTable(
  "branch_user_assignments",
  {
    id: serial("id").primaryKey(),
    branchId: integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("branch_user_assignment_unique").on(table.branchId, table.userId)],
);

export const inventoryAlertsTable = pgTable("inventory_alerts", {
  id: serial("id").primaryKey(),
  branchProductId: integer("branch_product_id").notNull().references(() => branchProductsTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  state: inventoryAlertStateEnum("state").notNull(),
  type: inventoryAlertTypeEnum("type").notNull(),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(0),
  responsibleName: text("responsible_name"),
  responsibleEmail: text("responsible_email"),
  responsibleUserId: text("responsible_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  deliveryState: text("delivery_state").notNull().default("pending"),
  channels: text("channels").array().notNull().default([]),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const internalNotificationsTable = pgTable("internal_notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "cascade" }),
  alertId: integer("alert_id").references(() => inventoryAlertsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertAddressSchema = createInsertSchema(addressesTable).omit({
  id: true,
  createdAt: true,
});
export const insertCartSchema = createInsertSchema(cartsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type User = typeof usersTable.$inferSelect;
export type Address = typeof addressesTable.$inferSelect;
export type Cart = typeof cartsTable.$inferSelect;
export type CartItem = typeof cartItemsTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type InsertCart = z.infer<typeof insertCartSchema>;
export type BranchUserAssignment = typeof branchUserAssignmentsTable.$inferSelect;
export type InventoryAlert = typeof inventoryAlertsTable.$inferSelect;
export type InternalNotification = typeof internalNotificationsTable.$inferSelect;