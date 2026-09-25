import { Router, type IRouter } from "express";
import { and, eq, gt, gte, lt, sql, inArray, desc, isNull, or, ilike } from "drizzle-orm";
import {
  branchProductsTable,
  branchesTable,
  db,
  importJobsTable,
  productsTable,
  promotionBranchesTable,
  promotionsTable,
  branchAuditLogsTable,
  branchHoursTable,
  branchImagesTable,
  branchLinksTable,
  branchSpecialHoursTable,
  couponsTable,
  orderPaymentsTable,
  paymentMethodConfigsTable,
  paymentProviderSettingsTable,
} from "@workspace/db";
import {
  CreateProductBody,
  CreateProductResponse,
  GetAdminProductResponse,
  GetAdminSummaryResponse,
  ListAdminProductsQueryParams,
  ListAdminProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
  CreateProductPromotionBody,
  CreateProductPromotionParams,
  CreateProductPromotionResponse,
  ListProductPromotionsParams,
  ListProductPromotionsResponse,
  UpdateProductPromotionParams,
  UpdateProductPromotionBody,
  UpdateProductPromotionResponse,
  CancelProductPromotionParams,
  CancelProductPromotionResponse,
} from "@workspace/api-zod";
import { ordersTable, orderItemsTable, inventoryReservationsTable, inventoryLedgerTable, inventoryAlertsTable, inventoryAlertEventsTable, usersTable, branchUserAssignmentsTable, categoryResponsibleAssignmentsTable, categoriesTable } from "@workspace/db";
import {
  ListAdminOrdersQueryParams,
  ListAdminOrdersResponse,
  GetAdminOrderParams,
  GetAdminOrderResponse,
  UpdateAdminOrderParams,
  UpdateAdminOrderBody,
  UpdateAdminOrderResponse,
  CreateAdminOrderBody,
  CreateAdminOrderResponse,
  PreviewAdminOrderBody,
  PreviewAdminOrderResponse,
  SearchAdminCustomersQueryParams,
  SearchAdminCustomersResponse,
  RecordAdminOrderPaymentParams,
  RecordAdminOrderPaymentBody,
  RecordAdminOrderPaymentResponse,
  CreateAdminOrderPaymentLinkParams,
  CreateAdminOrderPaymentLinkResponse,
  DuplicateAdminOrderParams,
  DuplicateAdminOrderResponse,
  ListAdminCouponsResponse,
  CreateAdminCouponBody,
  CreateAdminCouponResponse,
  ListAdminPaymentMethodsResponse,
  UpdateAdminPaymentMethodParams,
  UpdateAdminPaymentMethodBody,
  UpdateAdminPaymentMethodResponse,
  GetAdminPaymentProviderParams,
  GetAdminPaymentProviderResponse,
  UpdateAdminPaymentProviderParams,
  UpdateAdminPaymentProviderBody,
  UpdateAdminPaymentProviderResponse,
} from "@workspace/api-zod";
import {
  applyInventoryAlert,
  createManualAlert,
  createManualAlertsBulk,
  updateAlertStatus,
} from "../lib/inventory-alerts";
import { createOrder, OrderCreateError } from "../lib/order-create";
import { writeOrderAudit } from "../lib/order-audit";
import { loadAdminOrder } from "../lib/admin-order-serialize";
import { canOverrideAvailability } from "../lib/order-permissions";
import {
  decideCancelPayment,
  decideCompleteUnpaid,
  decideRecordPayment,
  encryptSecret,
  gatewayCredentialsReady,
  loadGatewayCredentials,
  loadPaymentMethodConfigs,
  maskSecret,
  setOnlineProviderConfigured,
} from "../lib/payments";
import { fulfillmentSchedule, isValidSlotTime, mexicoDate } from "../lib/fulfillment-schedule";
import {
  calculatePromotionPrice,
  getAdminProductDetail,
  listProductCards,
  promotionStatus,
} from "../lib/catalog";
import { commitOrderReservations, releaseOrderReservations, reserveBranchProduct } from "../lib/inventory-hold";
import { canAccessBranch, getAccessibleBranchIds, getRequestUser, hasGlobalBranchAccess } from "../middlewares/auth";
import {
  assignUserToBranch,
  canAssignRole,
  canManageUsers,
  findUserByEmail,
  isAdminStaffRole,
  resolveIdentityForAdminUser,
  serializeSafeUser,
  syncClerkProfile,
  type AdminStaffRole,
} from "../lib/admin-users";
import { DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences } from "../lib/notification-prefs";
import {
  stockState,
  enteredAlertState,
  availableStock,
  deriveInventoryStatus,
  predictAlertOnStockChange,
  validateInventoryCsv,
  parseProductImportCsv,
  mapImportDiscountType,
  type ProductImportMapping,
  type ProductImportRecord,
} from "../lib/inventory";
import {
  promotionInputSchema,
  promotionsInputSchema,
  promotionValidationError,
  type PromotionInputData,
} from "../lib/promotion-validation";
import { z } from "zod/v4";
import { publishCatalogChange } from "../lib/catalog-events";
import {
  buildProductExportCsv,
  bulkUpdateProducts,
  completeImportJob,
  createImportJob,
  duplicateProductById,
  translateImportMessage,
} from "../lib/catalog-admin";
import { upsertProductAggregate } from "../lib/product-aggregate";
import {
  ExportProductsBody,
  BulkUpdateProductsBody,
  DuplicateProductParams,
  ListImportJobsQueryParams,
  GetImportJobParams,
  GetImportJobResponse,
  ListImportJobsResponse,
  ExportProductsResponse,
  BulkUpdateProductsResponse,
  DuplicateProductResponse,
} from "@workspace/api-zod";
import {
  branchDependencyCounts,
  resolveBranchFormattedAddress,
  countFutureOrders,
  enrichBranchesList,
  loadBranchSatellite,
  normalizeWhatsapp,
  replaceBranchHours,
  serializeAdminBranch,
  slugifyBranch,
  syncLegacyProjections,
  syncStatusFields,
  whatsappUrl,
  writeBranchAudit,
} from "../lib/branch-ops";

const router: IRouter = Router();

const productImportProductFields = [
  "name",
  "slug",
  "shortDescription",
  "description",
  "price",
  "salePrice",
  "categoryId",
  "imageUrl",
  "featured",
  "seasonal",
  "status",
  "minimumLeadTimeHours",
] as const;

type ProductImportPlanRow = {
  record: ProductImportRecord;
  action: "new" | "update";
};

type ProductImportPlan = {
  rows: ProductImportPlanRow[];
  errors: Array<{ row: number; message: string }>;
  existing: Map<string, { id: number; sku: string }>;
  branches: Array<{ id: number; code: string | null }>;
  allRows: ProductImportRecord[];
};

function importSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function makeProductImportPlan(
  req: Parameters<typeof getRequestUser>[0],
  csv: string,
  mapping: ProductImportMapping,
): Promise<ProductImportPlan> {
  const parsed = parseProductImportCsv(csv, mapping);
  const [products, branches, categories] = await Promise.all([
    db.select({ id: productsTable.id, sku: productsTable.sku }).from(productsTable),
    db.select({ id: branchesTable.id, code: branchesTable.branchCode }).from(branchesTable),
    db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable),
  ]);
  const existing = new Map(products.map((product) => [product.sku, product]));
  const branchMap = new Map(
    branches
      .filter((branch): branch is { id: number; code: string } => !!branch.code)
      .map((branch) => [branch.code.toLowerCase(), branch.id]),
  );
  const categoryIds = new Set(categories.map((category) => category.id));
  const categoryByName = new Map(
    categories.map((category) => [category.name.trim().toLowerCase(), category.id]),
  );
  const accessibleBranchIds = await getAccessibleBranchIds(req);
  const errors = [...parsed.errors];
  const errorsByRow = new Set(errors.map((error) => error.row));
  const recordsBySku = new Map<string, ProductImportRecord[]>();
  for (const record of parsed.rows) {
    const records = recordsBySku.get(record.sku) ?? [];
    records.push(record);
    recordsBySku.set(record.sku, records);
  }

  for (const record of parsed.rows) {
    const isNew = !existing.has(record.sku);
    const group = recordsBySku.get(record.sku) ?? [record];
    const hasCategory =
      group.some((item) => item.categoryId != null) ||
      group.some((item) => item.categories?.length);
    if (
      isNew &&
      (!group.some((item) => item.name) ||
        !group.some((item) => item.price != null) ||
        !hasCategory)
    ) {
      errors.push({
        row: record.row,
        message: "New SKU requires name, price and categoryId",
      });
      errorsByRow.add(record.row);
    }
    if (
      record.categoryId != null &&
      (!Number.isInteger(record.categoryId) || !categoryIds.has(record.categoryId))
    ) {
      errors.push({ row: record.row, message: "Unknown categoryId" });
      errorsByRow.add(record.row);
    }
    if (record.categories?.length) {
      for (const name of record.categories) {
        if (!categoryByName.has(name.trim().toLowerCase())) {
          errors.push({ row: record.row, message: "Unknown category name" });
          errorsByRow.add(record.row);
        }
      }
      if (record.primaryCategory) {
        const primaryOk = record.categories.some(
          (name) =>
            name.trim().toLowerCase() === record.primaryCategory!.trim().toLowerCase(),
        );
        if (!primaryOk) {
          errors.push({
            row: record.row,
            message: "primary_category must be included in categories",
          });
          errorsByRow.add(record.row);
        }
      }
    }
    for (const field of ["inventory", "minStock", "preparationTimeMinutes"] as const) {
      const value = record[field];
      if (value != null && !Number.isInteger(value)) {
        errors.push({ row: record.row, message: `${field} must be an integer` });
        errorsByRow.add(record.row);
      }
    }
    if (record.branchCode) {
      const branchId = branchMap.get(record.branchCode.toLowerCase());
      if (!branchId) {
        errors.push({ row: record.row, message: "Unknown branchCode" });
        errorsByRow.add(record.row);
      } else if (accessibleBranchIds !== null && !accessibleBranchIds.includes(branchId)) {
        errors.push({ row: record.row, message: "Branch access denied" });
        errorsByRow.add(record.row);
      }
    }
    if (record.discountBranches?.length) {
      for (const code of record.discountBranches) {
        if (!branchMap.has(code.toLowerCase())) {
          errors.push({ row: record.row, message: "Unknown branchCode" });
          errorsByRow.add(record.row);
        }
      }
    }
  }

  return {
    rows: parsed.rows
      .filter((record) => !errorsByRow.has(record.row))
      .map((record) => ({
        record,
        action: existing.has(record.sku) ? "update" : "new",
      })),
    errors,
    existing,
    branches,
    allRows: parsed.rows,
  };
}

function mergeProductImportFields(records: ProductImportRecord[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const field of productImportProductFields) {
    const record = records.find((item) => item[field] !== undefined);
    if (record) merged[field] = record[field];
  }
  return merged;
}

async function assignmentActor(req: Parameters<typeof getRequestUser>[0]) {
  const user = await getRequestUser(req);
  return user && hasGlobalBranchAccess(user) ? user : undefined;
}

// Assignment administration deliberately returns no authentication/provider fields.
router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  const rows = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(sql`${usersTable.role} <> 'customer'`)
    .orderBy(usersTable.email);
  res.json(rows.map(serializeSafeUser));
});

router.get("/admin/users/:id", async (req, res): Promise<void> => {
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  const [row] = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id))
    .limit(1);
  if (!row || row.role === "customer") {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(serializeSafeUser(row));
});

const adminUserCreateBody = z.object({
  email: z.string().email(),
  firstName: z.string().trim().nullable().optional(),
  lastName: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  role: z.enum(["staff", "branch_manager", "operations", "operations_manager", "manager", "admin"]),
  branchId: z.number().int().positive().nullable().optional(),
  branchRole: z.enum(["branch_manager", "staff", "operations"]).default("staff"),
  isPrimary: z.boolean().default(false),
  sendInvite: z.boolean().default(true),
});

const adminUserUpdateBody = z.object({
  firstName: z.string().trim().nullable().optional(),
  lastName: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  role: z.enum(["staff", "branch_manager", "operations", "operations_manager", "manager", "admin"]).optional(),
});

router.post("/admin/users", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  if (!actor || !canManageUsers(actor)) {
    res.status(403).json({ error: "Solo admin u operations manager pueden crear usuarios" });
    return;
  }
  const body = adminUserCreateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const role = body.data.role as AdminStaffRole;
  if (!canAssignRole(actor, role)) {
    res.status(403).json({ error: "No tienes permiso para asignar ese rol" });
    return;
  }

  const email = body.data.email.trim().toLowerCase();
  const existing = await findUserByEmail(email);
  if (existing && existing.role !== "customer") {
    res.status(409).json({ error: "Ya existe un usuario operativo con ese correo", code: "USER_EXISTS" });
    return;
  }

  if (body.data.branchId != null && !(await canAccessBranch(req, body.data.branchId))) {
    res.status(403).json({ error: "Branch access denied" });
    return;
  }

  let userRow = existing;
  let created = false;
  let promoted = false;
  let inviteSent = false;

  try {
    if (existing) {
      const [updated] = await db
        .update(usersTable)
        .set({
          firstName: body.data.firstName ?? existing.firstName,
          lastName: body.data.lastName ?? existing.lastName,
          phone: body.data.phone ?? existing.phone,
          role,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existing.id))
        .returning();
      userRow = updated;
      promoted = true;
      await syncClerkProfile({
        userId: existing.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
      });
    } else {
      const identity = await resolveIdentityForAdminUser({
        email,
        firstName: body.data.firstName,
        lastName: body.data.lastName,
        sendInvite: body.data.sendInvite,
      });
      inviteSent = identity.inviteSent;
      const [inserted] = await db
        .insert(usersTable)
        .values({
          id: identity.userId,
          email,
          firstName: body.data.firstName ?? null,
          lastName: body.data.lastName ?? null,
          phone: body.data.phone ?? null,
          role,
        })
        .onConflictDoUpdate({
          target: usersTable.id,
          set: {
            email,
            firstName: body.data.firstName ?? null,
            lastName: body.data.lastName ?? null,
            phone: body.data.phone ?? null,
            role,
            updatedAt: new Date(),
          },
        })
        .returning();
      userRow = inserted;
      created = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear el usuario";
    res.status(400).json({ error: message, code: "USER_CREATE_FAILED" });
    return;
  }

  if (!userRow) {
    res.status(500).json({ error: "Usuario no persistido" });
    return;
  }

  if (body.data.branchId != null) {
    try {
      await assignUserToBranch({
        branchId: body.data.branchId,
        userId: userRow.id,
        role: body.data.branchRole,
        isPrimary: body.data.isPrimary,
      });
    } catch {
      // User created; assignment can be completed from Responsables.
    }
  }

  res.status(201).json({
    user: serializeSafeUser(userRow),
    created,
    promoted,
    inviteSent,
    message: promoted
      ? "Cliente existente promovido a usuario operativo"
      : inviteSent
        ? "Usuario creado. Se envió invitación de acceso."
        : "Usuario creado",
  });
});

router.patch("/admin/users/:id", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  if (!actor || !canManageUsers(actor)) {
    res.status(403).json({ error: "Solo admin u operations manager pueden editar usuarios" });
    return;
  }
  const body = adminUserUpdateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [current] = await db.select().from(usersTable).where(eq(usersTable.id, req.params.id)).limit(1);
  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (body.data.role != null) {
    if (!isAdminStaffRole(body.data.role) || !canAssignRole(actor, body.data.role)) {
      res.status(403).json({ error: "No tienes permiso para asignar ese rol" });
      return;
    }
    if (current.id === actor.id && body.data.role !== "admin" && actor.role === "admin") {
      res.status(400).json({ error: "No puedes quitarte el rol admin a ti mismo" });
      return;
    }
  }

  const patch: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (body.data.firstName !== undefined) patch.firstName = body.data.firstName;
  if (body.data.lastName !== undefined) patch.lastName = body.data.lastName;
  if (body.data.phone !== undefined) patch.phone = body.data.phone;
  if (body.data.role !== undefined) patch.role = body.data.role;

  const [updated] = await db
    .update(usersTable)
    .set(patch)
    .where(eq(usersTable.id, current.id))
    .returning();

  await syncClerkProfile({
    userId: updated.id,
    firstName: updated.firstName,
    lastName: updated.lastName,
  });

  res.json(serializeSafeUser(updated));
});

router.get("/admin/branches/:id/assignments", async (req, res): Promise<void> => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || !(await canAccessBranch(req, branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const rows = await db.select({
    id: branchUserAssignmentsTable.id,
    branchId: branchUserAssignmentsTable.branchId,
    role: branchUserAssignmentsTable.role,
    isPrimary: branchUserAssignmentsTable.isPrimary,
    active: branchUserAssignmentsTable.active,
    user: {
      id: usersTable.id,
      name: sql<string>`trim(concat(${usersTable.firstName}, ' ', ${usersTable.lastName}))`,
      email: usersTable.email,
      role: usersTable.role,
    },
  })
    .from(branchUserAssignmentsTable).innerJoin(usersTable, eq(branchUserAssignmentsTable.userId, usersTable.id))
    .where(eq(branchUserAssignmentsTable.branchId, branchId));
  res.json(rows);
});

const assignmentBody = z.object({
  userId: z.string().min(1),
  role: z.enum(["branch_manager", "staff", "operations"]).default("staff"),
  isPrimary: z.boolean().default(false),
});
const assignmentUpdateBody = z.object({
  userId: z.string().min(1),
  role: z.enum(["branch_manager", "staff", "operations"]).optional(),
  isPrimary: z.boolean().optional(),
  active: z.boolean().optional(),
});

router.put("/admin/branches/:id/assignments", async (req, res): Promise<void> => {
  const branchId = Number(req.params.id), body = assignmentBody.safeParse(req.body);
  if (!Number.isInteger(branchId) || !body.success) { res.status(400).json({ error: "Invalid assignment" }); return; }
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, body.data.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (body.data.isPrimary) {
    await db.update(branchUserAssignmentsTable).set({ isPrimary: false }).where(eq(branchUserAssignmentsTable.branchId, branchId));
  }
  const [row] = await db.insert(branchUserAssignmentsTable).values({
    branchId,
    userId: body.data.userId,
    role: body.data.role,
    isPrimary: body.data.isPrimary,
    active: true,
  }).onConflictDoNothing().returning();
  if (!row) { res.status(409).json({ error: "Assignment already exists" }); return; }
  const actor = await getRequestUser(req);
  await writeBranchAudit({
    branchId,
    actorUserId: actor?.id,
    action: "user_assigned",
    after: { userId: body.data.userId, role: body.data.role, isPrimary: body.data.isPrimary },
  });
  res.status(201).json(row);
});

router.patch("/admin/branches/:id/assignments", async (req, res): Promise<void> => {
  const branchId = Number(req.params.id);
  const body = assignmentUpdateBody.safeParse(req.body);
  if (!Number.isInteger(branchId) || !body.success) { res.status(400).json({ error: "Invalid assignment update" }); return; }
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  if (body.data.isPrimary) {
    await db.update(branchUserAssignmentsTable).set({ isPrimary: false }).where(eq(branchUserAssignmentsTable.branchId, branchId));
  }
  const patch: Record<string, unknown> = {};
  if (body.data.role != null) patch.role = body.data.role;
  if (body.data.isPrimary != null) patch.isPrimary = body.data.isPrimary;
  if (body.data.active != null) patch.active = body.data.active;
  const [row] = await db.update(branchUserAssignmentsTable).set(patch)
    .where(and(eq(branchUserAssignmentsTable.branchId, branchId), eq(branchUserAssignmentsTable.userId, body.data.userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Assignment not found" }); return; }
  const actor = await getRequestUser(req);
  await writeBranchAudit({
    branchId,
    actorUserId: actor?.id,
    action: body.data.isPrimary ? "primary_changed" : "assignment_updated",
    after: patch,
  });
  res.json(row);
});

router.delete("/admin/branches/:id/assignments/:userId", async (req, res): Promise<void> => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || !(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  await db.delete(branchUserAssignmentsTable).where(and(eq(branchUserAssignmentsTable.branchId, branchId), eq(branchUserAssignmentsTable.userId, req.params.userId)));
  const actor = await getRequestUser(req);
  await writeBranchAudit({
    branchId,
    actorUserId: actor?.id,
    action: "user_removed",
    before: { userId: req.params.userId },
  });
  res.status(204).end();
});

router.get("/admin/category-responsibles", async (req, res): Promise<void> => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId != null && !(await canAccessBranch(req, branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const filters = branchId == null ? undefined : eq(categoryResponsibleAssignmentsTable.branchId, branchId);
  const rows = await db.select({ id: categoryResponsibleAssignmentsTable.id, branchId: categoryResponsibleAssignmentsTable.branchId, categoryId: categoryResponsibleAssignmentsTable.categoryId, category: categoriesTable.name, user: { id: usersTable.id, name: sql<string>`trim(concat(${usersTable.firstName}, ' ', ${usersTable.lastName}))`, email: usersTable.email, role: usersTable.role } })
    .from(categoryResponsibleAssignmentsTable).innerJoin(categoriesTable, eq(categoryResponsibleAssignmentsTable.categoryId, categoriesTable.id)).innerJoin(usersTable, eq(categoryResponsibleAssignmentsTable.userId, usersTable.id)).where(filters);
  res.json(rows);
});

const categoryResponsibleBody = z.object({ branchId: z.number().int(), categoryId: z.number().int(), userId: z.string().min(1) });
router.put("/admin/category-responsibles", async (req, res): Promise<void> => {
  const body = categoryResponsibleBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  const [row] = await db.insert(categoryResponsibleAssignmentsTable).values(body.data).onConflictDoUpdate({ target: [categoryResponsibleAssignmentsTable.branchId, categoryResponsibleAssignmentsTable.categoryId], set: { userId: body.data.userId } }).returning();
  res.json(row);
});

router.delete("/admin/category-responsibles/:id", async (req, res): Promise<void> => {
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  await db.delete(categoryResponsibleAssignmentsTable).where(eq(categoryResponsibleAssignmentsTable.id, Number(req.params.id)));
  res.status(204).end();
});
const branchConfigurationSchema = z.object({
  branchId: z.number().int(),
  available: z.boolean().optional(),
  inventory: z.number().int().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
  criticalStock: z.number().int().min(0).nullable().optional(),
  autoAlertEnabled: z.boolean().optional(),
  priceOverride: z.number().min(0).nullable().optional(),
  salePriceOverride: z.number().min(0).nullable().optional(),
  preparationTimeMinutes: z.number().int().min(0).nullable().optional(),
  pickupAvailable: z.boolean().optional(),
  deliveryAvailable: z.boolean().optional(),
});
const branchConfigurationsSchema = z.array(branchConfigurationSchema).optional();

function promotionHistoryShape(
  promotion: typeof promotionsTable.$inferSelect,
  branchIds: number[],
  basePrice: number,
  now = new Date(),
) {
  return {
    id: promotion.id,
    name: promotion.name,
    type: promotion.type,
    value: promotion.value,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    status: promotionStatus(promotion, now),
    ...calculatePromotionPrice(basePrice, promotion),
    branchIds,
    createdAt: promotion.createdAt,
    createdBy: promotion.createdBy,
    cancelledAt: promotion.cancelledAt,
    cancelledBy: promotion.cancelledBy,
  };
}

async function createPromotionsForProduct(
  req: Parameters<typeof getRequestUser>[0],
  productId: number,
  inputs: PromotionInputData[],
) {
  if (!inputs.length) return [];
  await validatePromotionScope(req, inputs);
  const [product] = await db
    .select({ price: productsTable.price })
    .from(productsTable)
    .where(eq(productsTable.id, productId));
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  const created: Array<{
    promotion: typeof promotionsTable.$inferSelect;
    branchIds: number[];
  }> = [];
  for (const input of inputs) {
    const [promotion] = await db
      .insert(promotionsTable)
      .values({
        productId,
        name: input.name,
        type: input.type,
        value: input.value,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdBy: req.localUser?.id ?? null,
      })
      .returning();
    if (input.branchIds.length) {
      await db.insert(promotionBranchesTable).values(
        input.branchIds.map((branchId) => ({
          promotionId: promotion.id,
          branchId,
        })),
      );
    }
    created.push({ promotion, branchIds: input.branchIds });
  }
  return created;
}

async function validatePromotionScope(
  req: Parameters<typeof getRequestUser>[0],
  inputs: PromotionInputData[],
) {
  if (!inputs.length) return;
  const branchIds = [...new Set(inputs.flatMap((input) => input.branchIds))];
  const accessibleBranchIds = await getAccessibleBranchIds(req);
  if (
    accessibleBranchIds !== null &&
    inputs.some((input) => input.branchIds.length === 0)
  ) {
    throw new Error("GLOBAL_PROMOTION_ACCESS_REQUIRED");
  }
  if (
    accessibleBranchIds !== null &&
    branchIds.some((branchId) => !accessibleBranchIds.includes(branchId))
  ) {
    throw new Error("FORBIDDEN_BRANCH");
  }
  const knownBranches = await db
    .select({ id: branchesTable.id })
    .from(branchesTable)
    .where(
      branchIds.length
        ? inArray(branchesTable.id, branchIds)
        : sql`false`,
    );
  if (knownBranches.length !== branchIds.length) {
    throw new Error("UNKNOWN_BRANCH");
  }
}

router.get("/admin/orders", async (req, res): Promise<void> => {
  const q = ListAdminOrdersQueryParams.safeParse({
    ...req.query,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const branchIds = await getAccessibleBranchIds(req);
  const filters = [];
  if (q.data.status) filters.push(eq(ordersTable.status, q.data.status as any));
  if (q.data.branchId != null && !(await canAccessBranch(req, q.data.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  if (q.data.branchId != null) filters.push(eq(ordersTable.branchId, q.data.branchId));
  if (q.data.fulfillmentMethod) filters.push(eq(ordersTable.fulfillmentMethod, q.data.fulfillmentMethod));
  if (q.data.orderSource) filters.push(eq(ordersTable.orderSource, q.data.orderSource));
  if (q.data.from) filters.push(gte(ordersTable.scheduledStart, q.data.from));
  if (q.data.to) filters.push(lt(ordersTable.scheduledStart, q.data.to));
  if (branchIds) filters.push(branchIds.length ? sql`${ordersTable.branchId} = ANY(${branchIds})` : sql`false`);
  const rows = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    status: ordersTable.status,
    orderSource: ordersTable.orderSource,
    paymentStatus: ordersTable.paymentStatus,
    paymentMethod: ordersTable.paymentMethod,
    amountPaid: ordersTable.amountPaid,
    total: ordersTable.total,
    createdAt: ordersTable.createdAt,
    scheduledStart: ordersTable.scheduledStart,
    branchId: ordersTable.branchId,
    branchName: branchesTable.name,
    customerName: ordersTable.customerName,
    customerEmail: ordersTable.customerEmail,
    customerPhone: ordersTable.customerPhone,
    fulfillmentMethod: ordersTable.fulfillmentMethod,
  })
    .from(ordersTable)
    .innerJoin(branchesTable, eq(ordersTable.branchId, branchesTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(ordersTable.scheduledStart);

  const orderIds = rows.map((r) => r.id);
  const itemRows = orderIds.length
    ? await db.select({
      orderId: orderItemsTable.orderId,
      name: orderItemsTable.name,
      quantity: orderItemsTable.quantity,
    }).from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds))
    : [];
  const itemsByOrder = new Map<string, { name: string; quantity: number }[]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({ name: item.name, quantity: item.quantity });
    itemsByOrder.set(item.orderId, list);
  }

  res.json(ListAdminOrdersResponse.parse(rows.map((row) => {
    const items = itemsByOrder.get(row.id) ?? [];
    return { ...row, items, itemCount: items.reduce((sum, i) => sum + i.quantity, 0) };
  })));
});

router.post("/admin/orders/preview", async (req, res): Promise<void> => {
  const b = PreviewAdminOrderBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: b.error.message }); return; }
  if (!(await canAccessBranch(req, b.data.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const user = await getRequestUser(req);
  try {
    const result = await createOrder({
      ...b.data,
      orderSource: b.data.orderSource,
      createdByUserId: user?.id,
      actorRole: user?.role,
      previewOnly: true,
      markPaid: false,
    });
    res.json(PreviewAdminOrderResponse.parse({
      lines: result.lines,
      subtotal: result.subtotal,
      promotionDiscountTotal: result.promotionDiscountTotal,
      discountAmount: result.discountAmount,
      discountPercent: result.discountPercent,
      couponCode: result.couponCode,
      couponDiscount: result.couponDiscount,
      deliveryFee: result.deliveryFee,
      total: result.total,
      errors: result.errors,
    }));
  } catch (error) {
    if (error instanceof OrderCreateError) {
      res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      return;
    }
    throw error;
  }
});

router.post("/admin/orders", async (req, res): Promise<void> => {
  const b = CreateAdminOrderBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: b.error.message }); return; }
  if (!(await canAccessBranch(req, b.data.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const user = await getRequestUser(req);
  try {
    const result = await createOrder({
      ...b.data,
      userId: b.data.userId ?? null,
      createdByUserId: user?.id,
      actorRole: user?.role,
      reservationTtlMinutes: b.data.paymentMethod === "TRANSFER" && !b.data.markPaid ? 24 * 60 : 15,
    });
    if (!result.order) { res.status(500).json({ error: "Order create failed" }); return; }
    const full = await loadAdminOrder(result.order.id);
    res.status(201).json(CreateAdminOrderResponse.parse(full));
  } catch (error) {
    if (error instanceof OrderCreateError) {
      res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      return;
    }
    throw error;
  }
});

router.get("/admin/customers/search", async (req, res): Promise<void> => {
  const q = SearchAdminCustomersQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const term = `%${q.data.q.trim()}%`;
  const limit = q.data.limit ?? 20;

  const users = await db
    .select()
    .from(usersTable)
    .where(
      or(
        ilike(usersTable.email, term),
        ilike(usersTable.phone, term),
        ilike(usersTable.firstName, term),
        ilike(usersTable.lastName, term),
        sql`concat(coalesce(${usersTable.firstName},''),' ',coalesce(${usersTable.lastName},'')) ilike ${term}`,
      ),
    )
    .limit(limit);

  const orderHits = await db
    .select({
      customerName: ordersTable.customerName,
      customerEmail: ordersTable.customerEmail,
      customerPhone: ordersTable.customerPhone,
      userId: ordersTable.userId,
      lastOrderAt: sql<Date>`max(${ordersTable.createdAt})`,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .where(
      or(
        ilike(ordersTable.customerName, term),
        ilike(ordersTable.customerEmail, term),
        ilike(ordersTable.customerPhone, term),
      ),
    )
    .groupBy(
      ordersTable.customerName,
      ordersTable.customerEmail,
      ordersTable.customerPhone,
      ordersTable.userId,
    )
    .limit(limit);

  const byKey = new Map<string, {
    userId: string | null;
    name: string;
    email: string;
    phone: string | null;
    orderCount: number;
    lastOrderAt: Date | null;
  }>();

  for (const u of users) {
    const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
    byKey.set(u.email.toLowerCase(), {
      userId: u.id,
      name,
      email: u.email,
      phone: u.phone,
      orderCount: 0,
      lastOrderAt: null,
    });
  }
  for (const hit of orderHits) {
    const key = hit.customerEmail.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.orderCount = hit.orderCount;
      existing.lastOrderAt = hit.lastOrderAt;
      if (!existing.phone) existing.phone = hit.customerPhone;
    } else {
      byKey.set(key, {
        userId: hit.userId,
        name: hit.customerName,
        email: hit.customerEmail,
        phone: hit.customerPhone,
        orderCount: hit.orderCount,
        lastOrderAt: hit.lastOrderAt,
      });
    }
  }

  res.json(SearchAdminCustomersResponse.parse([...byKey.values()].slice(0, limit)));
});

router.get("/admin/coupons", async (_req, res): Promise<void> => {
  const rows = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
  res.json(ListAdminCouponsResponse.parse(rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type as "percentage" | "amount",
    value: row.value,
    active: row.active,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    minSubtotal: row.minSubtotal,
  }))));
});

router.post("/admin/coupons", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || !hasGlobalBranchAccess(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = CreateAdminCouponBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: b.error.message }); return; }
  const [row] = await db.insert(couponsTable).values({
    code: b.data.code.trim().toUpperCase(),
    name: b.data.name,
    type: b.data.type,
    value: b.data.value,
    active: b.data.active ?? true,
    startsAt: b.data.startsAt ?? null,
    endsAt: b.data.endsAt ?? null,
    maxRedemptions: b.data.maxRedemptions ?? null,
    minSubtotal: b.data.minSubtotal ?? null,
  }).returning();
  res.status(201).json(CreateAdminCouponResponse.parse({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type as "percentage" | "amount",
    value: row.value,
    active: row.active,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    minSubtotal: row.minSubtotal,
  }));
});

router.get("/admin/payment-methods", async (_req, res): Promise<void> => {
  const configs = await loadPaymentMethodConfigs();
  res.json(ListAdminPaymentMethodsResponse.parse(configs));
});

router.patch("/admin/payment-methods/:code", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || !hasGlobalBranchAccess(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const p = UpdateAdminPaymentMethodParams.safeParse(req.params);
  const b = UpdateAdminPaymentMethodBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Invalid payment method" }); return; }
  if (p.data.code === "CASH_ON_PICKUP" && b.data.allowDelivery === true) {
    res.status(400).json({ error: "Cash on pickup cannot be enabled for delivery", code: "DELIVERY_NOT_ALLOWED" });
    return;
  }
  const configs = await loadPaymentMethodConfigs();
  const current = configs.find((row) => row.code === p.data.code);
  if (!current) { res.status(404).json({ error: "Payment method not found" }); return; }
  const next = {
    ...current,
    enabled: b.data.enabled ?? current.enabled,
    allowPickup: b.data.allowPickup ?? current.allowPickup,
    allowDelivery: p.data.code === "CASH_ON_PICKUP" ? false : (b.data.allowDelivery ?? current.allowDelivery),
    customerLabel: b.data.customerLabel ?? current.customerLabel,
    customerDescription: b.data.customerDescription === undefined ? current.customerDescription : b.data.customerDescription,
    sortOrder: b.data.sortOrder ?? current.sortOrder,
  };
  const [row] = await db
    .insert(paymentMethodConfigsTable)
    .values({
      code: next.code,
      name: next.name,
      provider: next.provider,
      enabled: next.enabled,
      sortOrder: next.sortOrder,
      allowPickup: next.allowPickup,
      allowDelivery: next.allowDelivery,
      configurationStatus: next.configurationStatus,
      customerLabel: next.customerLabel,
      customerDescription: next.customerDescription,
    })
    .onConflictDoUpdate({
      target: paymentMethodConfigsTable.code,
      set: {
        enabled: next.enabled,
        sortOrder: next.sortOrder,
        allowPickup: next.allowPickup,
        allowDelivery: next.allowDelivery,
        customerLabel: next.customerLabel,
        customerDescription: next.customerDescription,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json(UpdateAdminPaymentMethodResponse.parse({
    code: row.code,
    name: row.name,
    provider: row.provider,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    allowPickup: row.allowPickup,
    allowDelivery: row.allowDelivery,
    configurationStatus: row.configurationStatus === "configured" ? "configured" : "not_configured",
    customerLabel: row.customerLabel,
    customerDescription: row.customerDescription ?? null,
  }));
});

const ONLINE_PROVIDERS = new Set(["MERCADO_PAGO", "PAYPAL"]);

async function paymentProviderPayload(provider: string) {
  const [row] = await db
    .select()
    .from(paymentProviderSettingsTable)
    .where(eq(paymentProviderSettingsTable.provider, provider));
  const configured = gatewayCredentialsReady(await loadGatewayCredentials(provider));
  return {
    provider,
    sandbox: row?.sandbox ?? true,
    configured,
    publicKeyMasked: maskSecret(row?.publicKey ?? null),
    accessTokenConfigured: Boolean(row?.accessTokenEncrypted),
    webhookSecretConfigured: Boolean(row?.webhookSecretEncrypted),
  };
}

router.get("/admin/payment-providers/:provider", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || !hasGlobalBranchAccess(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const p = GetAdminPaymentProviderParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: "Invalid provider" }); return; }
  const provider = p.data.provider.toUpperCase();
  if (!ONLINE_PROVIDERS.has(provider)) { res.status(404).json({ error: "Unknown provider" }); return; }
  res.json(GetAdminPaymentProviderResponse.parse(await paymentProviderPayload(provider)));
});

router.put("/admin/payment-providers/:provider", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || !hasGlobalBranchAccess(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const p = UpdateAdminPaymentProviderParams.safeParse(req.params);
  const b = UpdateAdminPaymentProviderBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Invalid provider settings" }); return; }
  const provider = p.data.provider.toUpperCase();
  if (!ONLINE_PROVIDERS.has(provider)) { res.status(404).json({ error: "Unknown provider" }); return; }
  const [existing] = await db
    .select()
    .from(paymentProviderSettingsTable)
    .where(eq(paymentProviderSettingsTable.provider, provider));
  const accessTokenEncrypted = b.data.accessToken
    ? encryptSecret(b.data.accessToken)
    : existing?.accessTokenEncrypted ?? null;
  const webhookSecretEncrypted = b.data.webhookSecret
    ? encryptSecret(b.data.webhookSecret)
    : existing?.webhookSecretEncrypted ?? null;
  const publicKey = b.data.publicKey === undefined ? existing?.publicKey ?? null : (b.data.publicKey || null);
  await db
    .insert(paymentProviderSettingsTable)
    .values({
      provider,
      sandbox: b.data.sandbox ?? existing?.sandbox ?? true,
      publicKey,
      accessTokenEncrypted,
      webhookSecretEncrypted,
    })
    .onConflictDoUpdate({
      target: paymentProviderSettingsTable.provider,
      set: {
        sandbox: b.data.sandbox ?? existing?.sandbox ?? true,
        publicKey,
        accessTokenEncrypted,
        webhookSecretEncrypted,
        updatedAt: new Date(),
      },
    });
  const configured = gatewayCredentialsReady(await loadGatewayCredentials(provider))
    || (provider === "PAYPAL"
      ? Boolean(publicKey && accessTokenEncrypted)
      : Boolean(accessTokenEncrypted));
  setOnlineProviderConfigured(provider, configured);
  if (configured) {
    await db
      .update(paymentMethodConfigsTable)
      .set({ configurationStatus: "configured", updatedAt: new Date() })
      .where(eq(paymentMethodConfigsTable.provider, provider));
  }
  res.json(UpdateAdminPaymentProviderResponse.parse(await paymentProviderPayload(provider)));
});

router.get("/admin/orders/:id", async (req, res): Promise<void> => {
  const p = GetAdminOrderParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: "Invalid order id" }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, p.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!(await canAccessBranch(req, order.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const full = await loadAdminOrder(order.id);
  res.json(GetAdminOrderResponse.parse(full));
});

router.post("/admin/orders/:id/payment", async (req, res): Promise<void> => {
  const p = RecordAdminOrderPaymentParams.safeParse(req.params);
  const b = RecordAdminOrderPaymentBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Invalid payment" }); return; }
  const user = await getRequestUser(req);
  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, p.data.id)).for("update");
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (!(await canAccessBranch(req, order.branchId))) throw new Error("FORBIDDEN_BRANCH");
      const decision = decideRecordPayment({
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        total: order.total,
        amountPaid: order.amountPaid ?? 0,
        markPaid: b.data.markPaid,
        recordedAmount: b.data.amountPaid,
      });
      if (!decision.ok) throw Object.assign(new Error(decision.code), { httpStatus: decision.status, publicMessage: decision.error, code: decision.code });
      if (decision.commitInventory) {
        await commitOrderReservations(tx, order.id, user?.id);
      }
      const now = new Date();
      const [o] = await tx.update(ordersTable).set({
        paymentMethod: b.data.paymentMethod,
        paymentReference: b.data.paymentReference ?? null,
        paymentNote: b.data.paymentNote ?? null,
        amountPaid: decision.amountPaid,
        paymentStatus: decision.paymentStatus,
        status: decision.orderStatus as typeof order.status,
        paidAt: decision.paidAt ? now : order.paidAt,
        paidByUserId: decision.paidAt ? user?.id ?? null : order.paidByUserId,
        inventoryCommittedAt: decision.commitInventory ? now : order.inventoryCommittedAt,
      }).where(eq(ordersTable.id, order.id)).returning();
      await tx.insert(orderPaymentsTable).values({
        orderId: order.id,
        method: b.data.paymentMethod,
        provider: b.data.paymentMethod === "CASH_ON_PICKUP" || b.data.paymentMethod === "CASH" ? "CASH_ON_PICKUP" : "MANUAL",
        amount: decision.amountPaid,
        currency: "MXN",
        status: decision.paymentStatus === "paid" ? "paid" : "partially_paid",
        recordedByUserId: user?.id ?? null,
        note: b.data.paymentNote ?? null,
        paidAt: decision.paidAt ? now : null,
      });
      await writeOrderAudit({
        tx,
        orderId: order.id,
        actorUserId: user?.id,
        action: "PAYMENT_RECORDED",
        reason: b.data.paymentNote,
        payload: b.data,
      });
      return o;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") { res.status(404).json({ error: "Order not found" }); return; }
    if (error instanceof Error && error.message === "FORBIDDEN_BRANCH") { res.status(403).json({ error: "Branch access denied" }); return; }
    const coded = error as Error & { httpStatus?: number; publicMessage?: string; code?: string };
    if (coded.httpStatus) {
      res.status(coded.httpStatus).json({ error: coded.publicMessage ?? coded.message, code: coded.code });
      return;
    }
    throw error;
  }
  res.json(RecordAdminOrderPaymentResponse.parse(await loadAdminOrder(updated.id)));
});

router.post("/admin/orders/:id/payment-link", async (req, res): Promise<void> => {
  const p = CreateAdminOrderPaymentLinkParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: "Invalid order id" }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, p.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!(await canAccessBranch(req, order.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }

  const base = process.env.STOREFRONT_PUBLIC_URL?.replace(/\/$/, "") || "http://localhost:5173";
  const url = `${base}/pedido/${order.id}/${order.guestAccessToken}?pay=1`;
  const [updated] = await db.update(ordersTable).set({
    paymentMethod: "PAYMENT_LINK",
    paymentLinkUrl: url,
  }).where(eq(ordersTable.id, order.id)).returning();
  const user = await getRequestUser(req);
  await writeOrderAudit({
    orderId: order.id,
    actorUserId: user?.id,
    action: "PAYMENT_LINK_CREATED",
    payload: { url },
  });
  res.json(CreateAdminOrderPaymentLinkResponse.parse({ url: updated.paymentLinkUrl!, orderId: order.id }));
});

router.post("/admin/orders/:id/duplicate", async (req, res): Promise<void> => {
  const p = DuplicateAdminOrderParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: "Invalid order id" }); return; }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, p.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!(await canAccessBranch(req, order.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  res.json(DuplicateAdminOrderResponse.parse({
    branchId: order.branchId,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    userId: order.userId,
    fulfillmentMethod: order.fulfillmentMethod,
    deliveryAddress: order.deliveryAddress,
    deliveryAddressSnapshot: order.deliveryAddressSnapshot ?? null,
    deliveryLatitude: order.deliveryLatitude,
    deliveryLongitude: order.deliveryLongitude,
    customerNotes: order.customerNotes,
    productionNotes: order.productionNotes,
    internalNotes: order.internalNotes,
    lines: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      manualLineItem: item.manualLineItem,
      description: item.manualLineItem ? item.name : undefined,
      unitPrice: item.manualLineItem ? item.unitPrice : undefined,
    })),
  }));
});

router.patch("/admin/orders/:id", async (req, res): Promise<void> => {
  const p = UpdateAdminOrderParams.safeParse(req.params), b = UpdateAdminOrderBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Invalid order update" }); return; }
  const user = await getRequestUser(req);
  let updated;
  try {
    updated = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, p.data.id)).for("update");
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (!(await canAccessBranch(req, order.branchId))) throw new Error("FORBIDDEN_BRANCH");

    const editable = order.status === "pending_payment" || order.status === "confirmed" || order.status === "paid";
    const patch: Partial<typeof ordersTable.$inferInsert> = {};

    if (b.data.customerEmail != null) patch.customerEmail = b.data.customerEmail;
    if (b.data.customerName != null) patch.customerName = b.data.customerName;
    if (b.data.customerPhone != null) patch.customerPhone = b.data.customerPhone;
    if (b.data.customerNotes !== undefined) patch.customerNotes = b.data.customerNotes;
    if (b.data.productionNotes !== undefined) patch.productionNotes = b.data.productionNotes;
    if (b.data.internalNotes !== undefined) patch.internalNotes = b.data.internalNotes;
    const notesChanged =
      (b.data.customerNotes !== undefined && (b.data.customerNotes ?? null) !== (order.customerNotes ?? null)) ||
      (b.data.productionNotes !== undefined && (b.data.productionNotes ?? null) !== (order.productionNotes ?? null)) ||
      (b.data.internalNotes !== undefined && (b.data.internalNotes ?? null) !== (order.internalNotes ?? null));
    if (notesChanged) {
      await writeOrderAudit({
        tx,
        orderId: order.id,
        actorUserId: user?.id,
        action: "NOTE_UPDATED",
      });
    }

    if (b.data.scheduledStart && editable) {
      const [branch] = await tx.select().from(branchesTable).where(eq(branchesTable.id, order.branchId));
      if (branch) {
        const scheduled = new Date(b.data.scheduledStart);
        const schedule = fulfillmentSchedule(branch, mexicoDate(scheduled), order.fulfillmentMethod, branch.preparationTimeMinutes);
        if (!schedule || !isValidSlotTime(schedule, scheduled)) throw new Error("INVALID_SLOT");
        patch.scheduledStart = scheduled;
        patch.scheduledEnd = new Date(scheduled.getTime() + schedule.intervalMs);
      }
    }

    if ((b.data.customerEmail || b.data.customerName || b.data.customerPhone || b.data.scheduledStart || b.data.lines) && !editable && order.status === "preparing") {
      throw new Error("EDIT_RESTRICTED");
    }

    if (b.data.lines && editable) {
      // Release existing reservations then recreate via createOrder is too heavy;
      // for MVP edit of lines: cancel-style release + re-reserve priced lines.
      const oldReservations = await tx
        .select()
        .from(inventoryReservationsTable)
        .where(eq(inventoryReservationsTable.orderId, order.id));
      await releaseOrderReservations(tx, order.id, "Order lines edited");
      if (oldReservations.length) {
        await tx.delete(inventoryReservationsTable).where(
          and(
            eq(inventoryReservationsTable.orderId, order.id),
            eq(inventoryReservationsTable.status, "released"),
          ),
        );
      }
      await tx.delete(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

      const priced = await createOrder({
        orderSource: order.orderSource,
        branchId: order.branchId,
        fulfillmentMethod: order.fulfillmentMethod,
        scheduledStart: (patch.scheduledStart as Date | undefined) ?? order.scheduledStart,
        customerEmail: (patch.customerEmail as string | undefined) ?? order.customerEmail,
        customerName: (patch.customerName as string | undefined) ?? order.customerName,
        customerPhone: (patch.customerPhone as string | undefined) ?? order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        deliveryLatitude: order.deliveryLatitude,
        deliveryLongitude: order.deliveryLongitude,
        lines: b.data.lines,
        actorRole: user?.role,
        createdByUserId: user?.id,
        previewOnly: true,
        paymentMethod: "PENDING",
        markPaid: false,
      });
      if (priced.errors.length) throw new Error(priced.errors[0] ?? "LINE_ERROR");
      patch.subtotal = priced.subtotal;
      patch.promotionDiscountTotal = priced.promotionDiscountTotal;
      patch.deliveryFee = priced.deliveryFee;
      patch.total = priced.total;
      patch.discountAmount = priced.discountAmount;
      patch.couponDiscount = priced.couponDiscount;

      for (const line of priced.lines) {
        await tx.insert(orderItemsTable).values({
          orderId: order.id,
          productId: line.productId,
          variantId: line.variantId,
          sku: line.sku,
          name: line.name,
          variantLabel: line.variantLabel,
          quantity: line.quantity,
          listUnitPrice: line.listUnitPrice,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          promotionId: line.promotionId,
          manualLineItem: line.manualLineItem,
        });
        if (line.manualLineItem || line.productId == null) continue;
        const [bp] = await tx.select().from(branchProductsTable).where(and(eq(branchProductsTable.branchId, order.branchId), eq(branchProductsTable.productId, line.productId)));
        if (!bp) throw new Error("OUT_OF_STOCK");
        await reserveBranchProduct(tx, {
          branchProduct: bp,
          quantity: line.quantity,
          orderId: order.id,
          immediatePaid: order.status === "paid",
          expiresAt: new Date(Date.now() + 15 * 60_000),
          actorUserId: user?.id,
          reason: "Order lines edited",
        });
      }
      await writeOrderAudit({
        tx,
        orderId: order.id,
        actorUserId: user?.id,
        action: "LINES_CHANGED",
        payload: { lineCount: priced.lines.length },
      });
    }

    if (b.data.status) {
      const valid = [
        "pending_payment",
        "confirmed",
        "paid",
        "preparing",
        "ready",
        "completed",
        "cancelled",
      ];
      if (!valid.includes(b.data.status)) throw new Error("INVALID_TRANSITION");
      if (b.data.status === "paid" && order.status !== "paid") {
        await commitOrderReservations(tx, order.id, user?.id);
        patch.paymentStatus = "paid";
        patch.inventoryCommittedAt = new Date();
        patch.paidAt = new Date();
        patch.paidByUserId = user?.id ?? null;
      }
      if (b.data.status === "completed") {
        const complete = decideCompleteUnpaid({
          paymentStatus: order.paymentStatus,
          confirmUnpaidComplete: b.data.confirmUnpaidComplete,
          canOverride: canOverrideAvailability(user?.role ?? "staff"),
          reason: b.data.cancelReason,
        });
        if (!complete.ok) {
          throw Object.assign(new Error(complete.code), { httpStatus: complete.status, publicMessage: complete.error, code: complete.code });
        }
      }
      if (b.data.status === "cancelled" && order.status !== "cancelled") {
        if (!b.data.cancelReason?.trim() && order.orderSource !== "STOREFRONT") {
          // require reason for manual cancels when provided path; soft require
        }
        const cancel = decideCancelPayment({
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
        });
        await releaseOrderReservations(tx, order.id, b.data.cancelReason ?? "Order cancelled");
        patch.paymentStatus = cancel.paymentStatus;
        await writeOrderAudit({
          tx,
          orderId: order.id,
          actorUserId: user?.id,
          action: "CANCELLED",
          reason: b.data.cancelReason,
        });
      }
      patch.status = b.data.status;
      await writeOrderAudit({
        tx,
        orderId: order.id,
        actorUserId: user?.id,
        action: "STATUS_CHANGED",
        payload: { from: order.status, to: b.data.status },
      });
    }

    if (b.data.scheduledStart && editable) {
      await writeOrderAudit({
        tx,
        orderId: order.id,
        actorUserId: user?.id,
        action: "SCHEDULE_CHANGED",
        payload: { scheduledStart: b.data.scheduledStart },
      });
    }

    const [o] = await tx.update(ordersTable).set(patch).where(eq(ordersTable.id, order.id)).returning();
    if (!o) throw new Error("INVALID_TRANSITION");
    return o;
    });
  } catch (error) {
    const coded = error as Error & { httpStatus?: number; publicMessage?: string; code?: string };
    if (coded.httpStatus) {
      res.status(coded.httpStatus).json({ error: coded.publicMessage ?? coded.message, code: coded.code });
      return;
    }
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") { res.status(404).json({ error: "Order not found" }); return; }
    if (error instanceof Error && error.message === "FORBIDDEN_BRANCH") { res.status(403).json({ error: "Branch access denied" }); return; }
    if (error instanceof Error && error.message === "INVALID_TRANSITION") { res.status(409).json({ error: "Invalid status transition" }); return; }
    if (error instanceof Error && error.message === "EDIT_RESTRICTED") { res.status(409).json({ error: "Order already preparing; dangerous edits blocked" }); return; }
    if (error instanceof Error && error.message === "INVALID_SLOT") { res.status(409).json({ error: "Fulfillment slot unavailable" }); return; }
    if (error instanceof Error && error.message === "OUT_OF_STOCK") { res.status(409).json({ error: "Item unavailable" }); return; }
    if (error instanceof OrderCreateError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof Error && !["ORDER_NOT_FOUND", "FORBIDDEN_BRANCH", "INVALID_TRANSITION"].includes(error.message)) {
      // LINE_ERROR messages
      if (!error.message.includes(" ")) { /* fallthrough */ }
      else { res.status(409).json({ error: error.message }); return; }
    }
    throw error;
  }
  res.json(UpdateAdminOrderResponse.parse(await loadAdminOrder(updated.id)));
});

const emailOrNull = z.union([z.string().email(), z.literal(""), z.null()]).optional().transform((v) => (v === "" ? null : v));
const branchLinkSchema = z.object({
  id: z.number().int().optional(),
  type: z.string().min(1),
  label: z.string().min(1),
  url: z.string().url(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});
const branchImageSchema = z.object({
  id: z.number().int().optional(),
  url: z.string().min(1),
  type: z.enum(["hero", "gallery", "logo", "card"]),
  alt: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});
const branchSpecialHourSchema = z.object({
  id: z.number().int().optional(),
  date: z.string().min(1),
  openTime: z.string().nullable().optional(),
  closeTime: z.string().nullable().optional(),
  closed: z.boolean(),
  label: z.string().nullable().optional(),
});

const branchUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  shortName: z.string().min(1).optional(),
  shortDescription: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  slug: z.string().min(1).optional(),
  branchCode: z.string().min(1).optional(),
  street: z.string().nullable().optional(),
  externalNumber: z.string().nullable().optional(),
  internalNumber: z.string().nullable().optional(),
  neighborhood: z.string().min(1).optional(),
  borough: z.string().nullable().optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  placeId: z.string().nullable().optional(),
  phone: z.string().min(1).optional(),
  secondaryPhone: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  whatsappDefaultMessage: z.string().nullable().optional(),
  email: z.string().email().optional(),
  ordersEmail: emailOrNull,
  reservationsEmail: emailOrNull,
  adminEmail: emailOrNull,
  managerName: z.string().nullable().optional(),
  managerEmail: emailOrNull,
  managerPhone: z.string().nullable().optional(),
  notificationPreferences: z
    .object({
      email: z.boolean().optional(),
      inApp: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
      lowStock: z.boolean().optional(),
      criticalStock: z.boolean().optional(),
      outOfStock: z.boolean().optional(),
      newOrder: z.boolean().optional(),
      cancelledOrder: z.boolean().optional(),
      incident: z.boolean().optional(),
    })
    .optional(),
  mapsUrl: z.string().url().optional(),
  openTableUrl: z.string().url().nullable().optional(),
  instagramUrl: z.string().url().nullable().optional(),
  reservationProvider: z.enum(["opentable", "external", "none"]).optional(),
  reservationUrl: z.string().url().nullable().optional(),
  reservationCta: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  gallery: z.array(z.string()).optional(),
  hours: z.array(z.object({
    day: z.string(), label: z.string(), open: z.string(), close: z.string(), closed: z.boolean(),
    date: z.string().optional(), slotOrder: z.number().int().optional(),
  })).optional(),
  specialHours: z.array(branchSpecialHourSchema).optional(),
  links: z.array(branchLinkSchema).optional(),
  images: z.array(branchImageSchema).optional(),
  pickupAvailable: z.boolean().optional(),
  deliveryAvailable: z.boolean().optional(),
  deliveryRadiusKm: z.number().nullable().optional(),
  minimumOrder: z.number().nullable().optional(),
  freeDeliveryFrom: z.number().nullable().optional(),
  preparationTimeMinutes: z.number().int().min(0).optional(),
  deliveryTimeMinutes: z.number().int().min(0).optional(),
  pickupSlotIntervalMinutes: z.number().int().min(5).optional(),
  pickupSlotCapacity: z.number().int().min(1).optional(),
  deliveryFee: z.number().optional(),
  featured: z.boolean().optional(),
  seoTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  ogImageUrl: z.string().nullable().optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  active: z.boolean().optional(),
});

const branchCreateSchema = branchUpdateSchema.extend({
  name: z.string().min(1),
  branchCode: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  shortName: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  neighborhood: z.string().default(""),
  city: z.string().default("Ciudad de México"),
  state: z.string().default("CDMX"),
  postalCode: z.string().default(""),
  country: z.string().default("México"),
  street: z.string().nullable().optional(),
  address: z.string().optional(),
  mapsUrl: z.string().url().optional(),
  status: z.enum(["active", "inactive", "archived"]).default("inactive"),
});

async function requireStructuralBranchAccess(req: Parameters<typeof getRequestUser>[0]): Promise<boolean> {
  const user = await getRequestUser(req);
  return !!user && hasGlobalBranchAccess(user);
}

async function replaceBranchLinks(branchId: number, links: z.infer<typeof branchLinkSchema>[]) {
  await db.delete(branchLinksTable).where(eq(branchLinksTable.branchId, branchId));
  if (!links.length) return;
  await db.insert(branchLinksTable).values(links.map((l, i) => ({
    branchId,
    type: l.type as typeof branchLinksTable.$inferInsert.type,
    label: l.label,
    url: l.url,
    sortOrder: l.sortOrder ?? i,
    active: l.active ?? true,
  })));
}

async function replaceBranchImages(branchId: number, images: z.infer<typeof branchImageSchema>[]) {
  await db.delete(branchImagesTable).where(eq(branchImagesTable.branchId, branchId));
  if (!images.length) return;
  await db.insert(branchImagesTable).values(images.map((img, i) => ({
    branchId,
    url: img.url,
    type: img.type,
    alt: img.alt ?? null,
    sortOrder: img.sortOrder ?? i,
    active: img.active ?? true,
  })));
}

async function replaceSpecialHours(branchId: number, rows: z.infer<typeof branchSpecialHourSchema>[]) {
  await db.delete(branchSpecialHoursTable).where(eq(branchSpecialHoursTable.branchId, branchId));
  if (!rows.length) return;
  await db.insert(branchSpecialHoursTable).values(rows.map((r) => ({
    branchId,
    date: r.date,
    openTime: r.closed ? null : (r.openTime ?? null),
    closeTime: r.closed ? null : (r.closeTime ?? null),
    closed: r.closed,
    label: r.label ?? null,
  })));
}

router.get("/admin/branches", async (req, res): Promise<void> => {
  const ids = await getAccessibleBranchIds(req);
  const rows = await db.select().from(branchesTable)
    .where(ids ? (ids.length ? inArray(branchesTable.id, ids) : sql`false`) : undefined)
    .orderBy(branchesTable.id);
  res.json(await enrichBranchesList(rows));
});

router.get("/admin/branches/export", async (req, res): Promise<void> => {
  if (!(await requireStructuralBranchAccess(req))) { res.status(403).json({ error: "Admin access required" }); return; }
  const rows = await db.select().from(branchesTable).orderBy(branchesTable.id);
  const header = ["branch_code", "name", "address", "city", "state", "zip", "phone", "email", "whatsapp", "reservation_url", "maps_url", "active", "status"];
  const lines = [header.join(",")];
  for (const b of rows) {
    const cols = [
      b.branchCode, b.name, b.address, b.city, b.state, b.postalCode, b.phone, b.email, b.whatsapp,
      b.reservationUrl ?? b.openTableUrl, b.mapsUrl, String(b.active), b.status,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`);
    lines.push(cols.join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=sucursales.csv");
  res.send(lines.join("\n"));
});

router.post("/admin/branches", async (req, res): Promise<void> => {
  if (!(await requireStructuralBranchAccess(req))) { res.status(403).json({ error: "Admin access required" }); return; }
  const body = branchCreateSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const data = body.data;
  const statusFields = syncStatusFields({ status: data.status, active: data.active });
  const shortName = data.shortName || data.name.split(" ").slice(-1)[0] || data.name;
  const slug = data.slug || slugifyBranch(shortName);
  const street = data.street ?? data.address ?? "";
  const address = resolveBranchFormattedAddress({
    street,
    externalNumber: data.externalNumber,
    internalNumber: data.internalNumber,
    neighborhood: data.neighborhood,
    borough: data.borough,
    city: data.city,
    state: data.state,
    postalCode: data.postalCode,
    country: data.country,
    address: data.address,
  });
  try {
    const [branch] = await db.insert(branchesTable).values({
      name: data.name,
      shortName,
      slug,
      branchCode: data.branchCode.toUpperCase(),
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      street,
      externalNumber: data.externalNumber ?? null,
      internalNumber: data.internalNumber ?? null,
      neighborhood: data.neighborhood || "—",
      borough: data.borough ?? null,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode || "00000",
      country: data.country,
      address,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      placeId: data.placeId ?? null,
      phone: data.phone,
      secondaryPhone: data.secondaryPhone ?? null,
      whatsapp: normalizeWhatsapp(data.whatsapp),
      whatsappDefaultMessage: data.whatsappDefaultMessage ?? `Hola, quiero información de ${data.name}.`,
      email: data.email,
      ordersEmail: data.ordersEmail ?? null,
      reservationsEmail: data.reservationsEmail ?? null,
      adminEmail: data.adminEmail ?? null,
      mapsUrl: data.mapsUrl || "https://maps.google.com",
      openTableUrl: data.openTableUrl ?? null,
      instagramUrl: data.instagramUrl ?? null,
      reservationProvider: data.reservationProvider ?? "none",
      reservationUrl: data.reservationUrl ?? null,
      reservationCta: data.reservationCta ?? "Reservar mesa",
      imageUrl: data.imageUrl ?? null,
      gallery: data.gallery ?? [],
      hours: data.hours ?? [],
      pickupAvailable: data.pickupAvailable ?? true,
      deliveryAvailable: data.deliveryAvailable ?? true,
      deliveryRadiusKm: data.deliveryRadiusKm ?? null,
      minimumOrder: data.minimumOrder ?? null,
      freeDeliveryFrom: data.freeDeliveryFrom ?? null,
      preparationTimeMinutes: data.preparationTimeMinutes ?? 30,
      deliveryTimeMinutes: data.deliveryTimeMinutes ?? 60,
      pickupSlotIntervalMinutes: data.pickupSlotIntervalMinutes ?? 30,
      pickupSlotCapacity: data.pickupSlotCapacity ?? 8,
      deliveryFee: data.deliveryFee ?? 90,
      featured: data.featured ?? false,
      seoTitle: data.seoTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      ogImageUrl: data.ogImageUrl ?? null,
      notificationPreferences: normalizeNotificationPreferences(data.notificationPreferences),
      status: statusFields.status,
      active: statusFields.active,
    }).returning();

    if (data.hours !== undefined) {
      const hoursJson = await replaceBranchHours(branch.id, data.hours);
      await db.update(branchesTable).set({ hours: hoursJson }).where(eq(branchesTable.id, branch.id));
    }
    if (data.specialHours) await replaceSpecialHours(branch.id, data.specialHours);
    if (data.links) await replaceBranchLinks(branch.id, data.links);
    if (data.images) await replaceBranchImages(branch.id, data.images);
    if (
      data.hours !== undefined ||
      data.specialHours ||
      data.links ||
      data.images
    ) {
      await syncLegacyProjections(branch.id);
    }

    const actor = await getRequestUser(req);
    await writeBranchAudit({ branchId: branch.id, actorUserId: actor?.id, action: "branch_created", after: { id: branch.id, name: branch.name, code: branch.branchCode } });
    const [fresh] = await db.select().from(branchesTable).where(eq(branchesTable.id, branch.id));
    const sat = await loadBranchSatellite(branch.id);
    res.status(201).json(serializeAdminBranch(fresh, {
      links: sat.links,
      images: sat.images,
      specialHours: sat.specialHours,
      primaryResponsible: sat.primaryResponsible,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create branch";
    if (message.includes("unique") || message.includes("duplicate")) {
      res.status(409).json({ error: "Código o slug de sucursal duplicado" });
      return;
    }
    res.status(500).json({ error: message });
  }
});

router.get("/admin/branches/:id", async (req, res): Promise<void> => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || !(await canAccessBranch(req, branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, branchId));
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const satellite = await loadBranchSatellite(branchId);
  const [products, inventory, orders, alerts, team, audit] = await Promise.all([
    db.select({ configuration: branchProductsTable, product: productsTable }).from(branchProductsTable).innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id)).where(eq(branchProductsTable.branchId, branchId)),
    db.select({ configuration: branchProductsTable, product: productsTable }).from(branchProductsTable).innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id)).where(eq(branchProductsTable.branchId, branchId)),
    db.select().from(ordersTable).where(eq(ordersTable.branchId, branchId)).orderBy(desc(ordersTable.createdAt)).limit(100),
    db.select({ alert: inventoryAlertsTable, product: productsTable }).from(inventoryAlertsTable).innerJoin(productsTable, eq(inventoryAlertsTable.productId, productsTable.id)).where(eq(inventoryAlertsTable.branchId, branchId)).orderBy(desc(inventoryAlertsTable.createdAt)),
    db.select({
      id: branchUserAssignmentsTable.id,
      role: branchUserAssignmentsTable.role,
      isPrimary: branchUserAssignmentsTable.isPrimary,
      active: branchUserAssignmentsTable.active,
      user: {
        id: usersTable.id,
        name: sql<string>`trim(concat(${usersTable.firstName}, ' ', ${usersTable.lastName}))`,
        email: usersTable.email,
        role: usersTable.role,
      },
    }).from(branchUserAssignmentsTable).innerJoin(usersTable, eq(branchUserAssignmentsTable.userId, usersTable.id)).where(eq(branchUserAssignmentsTable.branchId, branchId)),
    db.select().from(branchAuditLogsTable).where(eq(branchAuditLogsTable.branchId, branchId)).orderBy(desc(branchAuditLogsTable.createdAt)).limit(50),
  ]);

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const todayOrders = orders.filter((o) => {
    const d = new Date(o.scheduledStart ?? o.createdAt);
    return d >= start && d < end && o.status !== "cancelled";
  });
  const salesToday = todayOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const outOfStock = inventory.filter((r) => (r.configuration.inventory ?? 0) <= 0).length;
  const lowStock = inventory.filter((r) => {
    const inv = r.configuration.inventory ?? 0;
    return inv > 0 && inv <= (r.configuration.minStock ?? 0);
  });
  const serialized = serializeAdminBranch(branch, {
    links: satellite.links,
    images: satellite.images,
    specialHours: satellite.specialHours,
    primaryResponsible: satellite.primaryResponsible,
    ordersToday: todayOrders.length,
    alertsOpen: alerts.filter((a) => !a.alert.resolvedAt).length,
  });

  res.json({
    branch: serialized,
    general: serialized,
    contact: {
      phone: branch.phone,
      secondaryPhone: branch.secondaryPhone,
      whatsapp: branch.whatsapp,
      whatsappUrl: whatsappUrl(branch.whatsapp, branch.whatsappDefaultMessage),
      email: branch.email,
      ordersEmail: branch.ordersEmail,
      reservationsEmail: branch.reservationsEmail,
      adminEmail: branch.adminEmail,
    },
    hours: branch.hours,
    specialHours: satellite.specialHours,
    links: satellite.links,
    images: satellite.images,
    products,
    inventory,
    orders,
    alerts,
    notificationSettings: branch.notificationPreferences,
    team,
    audit,
    futureOrdersCount: await countFutureOrders(branchId),
    summary: {
      ordersToday: todayOrders.length,
      salesToday,
      alertsOpen: alerts.filter((a) => !a.alert.resolvedAt).length,
      outOfStock,
      lowStockProducts: lowStock.slice(0, 8).map((r) => r.product.name),
      upcoming: todayOrders
        .sort((a, b) => new Date(a.scheduledStart ?? 0).getTime() - new Date(b.scheduledStart ?? 0).getTime())
        .slice(0, 6)
        .map((o) => ({ id: o.id, scheduledStart: o.scheduledStart, status: o.status, total: o.total })),
    },
  });
});

const reportQuery = z.object({
  from: z.string().optional(), to: z.string().optional(),
});
router.get("/admin/reports/branches", async (req, res): Promise<void> => {
  const parsed = reportQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ids = await getAccessibleBranchIds(req);
  const dateFilters: ReturnType<typeof sql>[] = [];
  if (parsed.data.from) {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.from)
      ? new Date(`${parsed.data.from}T00:00:00-06:00`)
      : new Date(parsed.data.from);
    dateFilters.push(sql`${ordersTable.createdAt} >= ${from}`);
  }
  if (parsed.data.to) {
    // Accept exclusive ISO or date-only (treat date-only as start of that day exclusive upper bound already provided by clients).
    const to = /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.to)
      ? new Date(`${parsed.data.to}T00:00:00-06:00`)
      : new Date(parsed.data.to);
    dateFilters.push(sql`${ordersTable.createdAt} < ${to}`);
  }
  const branchFilter = ids ? (ids.length ? inArray(branchesTable.id, ids) : sql`false`) : undefined;
  const branches = await db.select({ id: branchesTable.id, name: branchesTable.name }).from(branchesTable).where(branchFilter).orderBy(branchesTable.id);
  const rows = await Promise.all(branches.map(async (branch) => {
    const [sales] = await db.select({ orderCount: sql<number>`count(*)::int`, revenue: sql<string>`coalesce(sum(${ordersTable.total}), 0)::numeric` })
      .from(ordersTable).where(and(eq(ordersTable.branchId, branch.id), sql`${ordersTable.status} <> 'cancelled'`, ...dateFilters));
    const [stock] = await db.select({
      inventoryCount: sql<number>`coalesce(sum(${branchProductsTable.inventory}), 0)::int`,
      inventoryValue: sql<string>`coalesce(sum(${branchProductsTable.inventory} * coalesce(${branchProductsTable.priceOverride}, ${productsTable.price})), 0)::numeric`,
      lowStockCount: sql<number>`count(*) filter (where ${branchProductsTable.inventory} > 0 and ${branchProductsTable.inventory} <= ${branchProductsTable.minStock})::int`,
      outOfStockCount: sql<number>`count(*) filter (where ${branchProductsTable.inventory} = 0)::int`,
    }).from(branchProductsTable).innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id)).where(eq(branchProductsTable.branchId, branch.id));
    return { branchId: branch.id, branchName: branch.name, ...sales, ...stock };
  }));
  res.json(rows);
});

router.patch("/admin/branches/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = branchUpdateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !body.success) { res.status(400).json({ error: body.success ? "Invalid id" : body.error.message }); return; }
  if (!(await canAccessBranch(req, id))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const actor = await getRequestUser(req);
  const isGlobal = actor && hasGlobalBranchAccess(actor);
  const [before] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!before) { res.status(404).json({ error: "Branch not found" }); return; }

  const data = { ...body.data };
  if (!isGlobal) {
    // Branch managers may edit operational fields only
    delete data.branchCode;
    delete data.slug;
    delete data.status;
    delete data.active;
    delete data.featured;
  }
  if (data.branchCode && data.branchCode !== before.branchCode && (before.branchCode)) {
    // Warn via audit; still allow global admins
    await writeBranchAudit({
      branchId: id,
      actorUserId: actor?.id,
      action: "branch_code_change_warning",
      before: { branchCode: before.branchCode },
      after: { branchCode: data.branchCode },
    });
  }

  const {
    hours, specialHours, links, images, status, active, whatsapp, address, street, externalNumber, internalNumber,
    neighborhood, borough, city, state, postalCode, country, ...rest
  } = data;

  const statusFields = status != null || active != null ? syncStatusFields({ status, active }) : null;
  // Structured fields win over a stale client `address` (list/display is derived).
  const formatted = resolveBranchFormattedAddress(
    {
      street,
      externalNumber,
      internalNumber,
      neighborhood,
      borough,
      city,
      state,
      postalCode,
      country,
      address,
    },
    before,
  );

  const patch: Record<string, unknown> = {
    ...rest,
    ...(street !== undefined ? { street } : {}),
    ...(externalNumber !== undefined ? { externalNumber } : {}),
    ...(internalNumber !== undefined ? { internalNumber } : {}),
    ...(neighborhood !== undefined ? { neighborhood } : {}),
    ...(borough !== undefined ? { borough } : {}),
    ...(city !== undefined ? { city } : {}),
    ...(state !== undefined ? { state } : {}),
    ...(postalCode !== undefined ? { postalCode } : {}),
    ...(country !== undefined ? { country } : {}),
    address: formatted,
    ...(whatsapp !== undefined ? { whatsapp: normalizeWhatsapp(whatsapp) } : {}),
    ...(statusFields ? statusFields : {}),
    ...(rest.branchCode ? { branchCode: String(rest.branchCode).toUpperCase() } : {}),
    ...(rest.notificationPreferences
      ? {
          notificationPreferences: normalizeNotificationPreferences({
            ...(before.notificationPreferences as object),
            ...rest.notificationPreferences,
          }),
        }
      : {}),
  };

  try {
    const [branch] = await db.update(branchesTable).set(patch).where(eq(branchesTable.id, id)).returning();
    if (hours !== undefined) {
      const hoursJson = await replaceBranchHours(id, hours);
      await db.update(branchesTable).set({ hours: hoursJson }).where(eq(branchesTable.id, id));
    }
    if (specialHours) await replaceSpecialHours(id, specialHours);
    if (links) await replaceBranchLinks(id, links);
    if (images) await replaceBranchImages(id, images);
    if (hours !== undefined || specialHours || links || images) await syncLegacyProjections(id);

    await writeBranchAudit({
      branchId: id,
      actorUserId: actor?.id,
      action: "branch_updated",
      before: { name: before.name, status: before.status, address: before.address },
      after: patch,
    });
    const [fresh] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
    const sat = await loadBranchSatellite(id);
    res.json(serializeAdminBranch(fresh, {
      links: sat.links,
      images: sat.images,
      specialHours: sat.specialHours,
      primaryResponsible: sat.primaryResponsible,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (message.includes("unique") || message.includes("duplicate")) {
      res.status(409).json({ error: "Código o slug duplicado" });
      return;
    }
    res.status(500).json({ error: message });
  }
});

router.post("/admin/branches/:id/deactivate", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await requireStructuralBranchAccess(req))) { res.status(403).json({ error: "Admin access required" }); return; }
  const future = await countFutureOrders(id);
  const confirm = Boolean(req.body?.confirmFutureOrders);
  if (future > 0 && !confirm) {
    res.status(409).json({ error: `Esta sucursal tiene ${future} pedidos futuros.`, futureOrdersCount: future });
    return;
  }
  const fields = syncStatusFields({ status: "inactive" });
  const [branch] = await db.update(branchesTable).set(fields).where(eq(branchesTable.id, id)).returning();
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const actor = await getRequestUser(req);
  await writeBranchAudit({ branchId: id, actorUserId: actor?.id, action: "branch_deactivated", after: fields });
  res.json((await enrichBranchesList([branch]))[0]);
});

router.post("/admin/branches/:id/archive", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await requireStructuralBranchAccess(req))) { res.status(403).json({ error: "Admin access required" }); return; }
  const fields = syncStatusFields({ status: "archived" });
  const [branch] = await db.update(branchesTable).set(fields).where(eq(branchesTable.id, id)).returning();
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const actor = await getRequestUser(req);
  await writeBranchAudit({ branchId: id, actorUserId: actor?.id, action: "branch_archived", after: fields });
  res.json((await enrichBranchesList([branch]))[0]);
});

router.delete("/admin/branches/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await requireStructuralBranchAccess(req))) { res.status(403).json({ error: "Admin access required" }); return; }
  const deps = await branchDependencyCounts(id);
  const hasHistory = deps.orders > 0 || deps.products > 0 || deps.alerts > 0 || deps.promotions > 0 || deps.users > 0;
  if (hasHistory) {
    res.status(409).json({ error: "La sucursal tiene historial operativo. Usa Archivar.", dependencies: deps });
    return;
  }
  await db.delete(branchesTable).where(eq(branchesTable.id, id));
  res.status(204).end();
});

const duplicateBody = z.object({
  name: z.string().min(1),
  branchCode: z.string().min(1),
  shortName: z.string().optional(),
  slug: z.string().optional(),
  copyHours: z.boolean().default(true),
  copyPickupDelivery: z.boolean().default(true),
  copyNotifications: z.boolean().default(true),
  copyProductAssignments: z.boolean().default(false),
  copyTeamStructure: z.boolean().default(false),
});

router.post("/admin/branches/:id/duplicate", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await requireStructuralBranchAccess(req))) { res.status(403).json({ error: "Admin access required" }); return; }
  const body = duplicateBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [source] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!source) { res.status(404).json({ error: "Branch not found" }); return; }
  const shortName = body.data.shortName || body.data.name;
  const slug = body.data.slug || slugifyBranch(shortName);
  const statusFields = syncStatusFields({ status: "inactive" });
  try {
    const {
      id: _sourceId,
      createdAt: _c,
      updatedAt: _u,
      ...sourceFields
    } = source;
    const [created] = await db.insert(branchesTable).values({
      ...sourceFields,
      name: body.data.name,
      shortName,
      slug,
      branchCode: body.data.branchCode.toUpperCase(),
      featured: false,
      status: statusFields.status,
      active: statusFields.active,
      hours: body.data.copyHours ? source.hours : [],
      pickupAvailable: body.data.copyPickupDelivery ? source.pickupAvailable : true,
      deliveryAvailable: body.data.copyPickupDelivery ? source.deliveryAvailable : true,
      deliveryRadiusKm: body.data.copyPickupDelivery ? source.deliveryRadiusKm : null,
      minimumOrder: body.data.copyPickupDelivery ? source.minimumOrder : null,
      freeDeliveryFrom: body.data.copyPickupDelivery ? source.freeDeliveryFrom : null,
      preparationTimeMinutes: body.data.copyPickupDelivery ? source.preparationTimeMinutes : 30,
      deliveryTimeMinutes: body.data.copyPickupDelivery ? source.deliveryTimeMinutes : 60,
      pickupSlotIntervalMinutes: body.data.copyPickupDelivery ? source.pickupSlotIntervalMinutes : 30,
      pickupSlotCapacity: body.data.copyPickupDelivery ? source.pickupSlotCapacity : 8,
      deliveryFee: body.data.copyPickupDelivery ? source.deliveryFee : 90,
      notificationPreferences: body.data.copyNotifications
        ? normalizeNotificationPreferences(source.notificationPreferences as any)
        : { ...DEFAULT_NOTIFICATION_PREFERENCES },
    }).returning();

    if (body.data.copyHours) {
      const hours = await db.select().from(branchHoursTable).where(eq(branchHoursTable.branchId, id));
      if (hours.length) {
        await db.insert(branchHoursTable).values(hours.map(({ id: _id, ...h }) => ({ ...h, branchId: created.id })));
      }
      const special = await db.select().from(branchSpecialHoursTable).where(eq(branchSpecialHoursTable.branchId, id));
      if (special.length) {
        await db.insert(branchSpecialHoursTable).values(special.map(({ id: _id, ...h }) => ({ ...h, branchId: created.id })));
      }
    }
    if (body.data.copyProductAssignments) {
      const products = await db.select().from(branchProductsTable).where(eq(branchProductsTable.branchId, id));
      if (products.length) {
        await db.insert(branchProductsTable).values(products.map(({ id: _id, ...p }) => ({
          ...p,
          branchId: created.id,
          inventory: 0,
          alertState: "NORMAL",
        })));
      }
    }
    if (body.data.copyTeamStructure) {
      const team = await db.select().from(branchUserAssignmentsTable).where(eq(branchUserAssignmentsTable.branchId, id));
      if (team.length) {
        await db.insert(branchUserAssignmentsTable).values(team.map(({ id: _id, ...t }) => ({
          ...t,
          branchId: created.id,
          isPrimary: false,
        })));
      }
    }

    const actor = await getRequestUser(req);
    await writeBranchAudit({
      branchId: created.id,
      actorUserId: actor?.id,
      action: "branch_duplicated",
      before: { sourceId: id },
      after: { id: created.id, name: created.name },
    });
    res.status(201).json((await enrichBranchesList([created]))[0]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Duplicate failed";
    res.status(409).json({ error: message.includes("unique") ? "Código o slug duplicado" : message });
  }
});

router.get("/admin/branches/:id/audit", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await canAccessBranch(req, id))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const rows = await db.select().from(branchAuditLogsTable).where(eq(branchAuditLogsTable.branchId, id)).orderBy(desc(branchAuditLogsTable.createdAt)).limit(100);
  res.json(rows);
});

const inventoryQuery = z.object({
  search: z.string().optional(), branchId: z.coerce.number().int().optional(),
  state: z.enum(["NORMAL", "LOW_STOCK", "CRITICAL_STOCK", "OUT_OF_STOCK"]).optional(),
  categoryId: z.coerce.number().int().optional(),
});

const alertListQuery = z.object({
  branchId: z.coerce.number().int().optional(),
  productId: z.coerce.number().int().optional(),
  type: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"]).optional(),
  source: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
  assignedUserId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const createAlertBody = z.object({
  productId: z.number().int().optional(),
  productIds: z.array(z.number().int()).optional(),
  branchId: z.number().int(),
  type: z.enum([
    "INVENTORY_REVIEW",
    "RESTOCK_REQUEST",
    "INVENTORY_MISMATCH",
    "CUSTOM",
    "LOW_STOCK",
    "CRITICAL_STOCK",
    "OUT_OF_STOCK",
  ]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  message: z.string().min(1),
  assignedUserId: z.string().nullable().optional(),
}).refine((v) => v.productId != null || (v.productIds && v.productIds.length > 0), {
  message: "productId or productIds required",
});

const patchAlertBody = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  assignedUserId: z.string().nullable().optional(),
  resolutionNote: z.string().nullable().optional(),
});

async function scopedBranchId(req: Parameters<typeof canAccessBranch>[0], branchId: number): Promise<boolean> {
  return canAccessBranch(req, branchId);
}

function enrichInventoryRow(row: {
  branchProduct: typeof branchProductsTable.$inferSelect;
  branch: typeof branchesTable.$inferSelect;
  product: typeof productsTable.$inferSelect;
  reservedStock: number;
  openAlertCount?: number;
}) {
  const reserved = Number(row.reservedStock ?? 0);
  const available = availableStock(row.branchProduct.inventory, reserved);
  return {
    ...row,
    reservedStock: reserved,
    availableStock: available,
    criticalStock: row.branchProduct.criticalStock ?? null,
    autoAlertEnabled: row.branchProduct.autoAlertEnabled !== false,
    openAlertCount: row.openAlertCount ?? 0,
    inventoryStatus: deriveInventoryStatus(
      available,
      row.branchProduct.minStock,
      row.branchProduct.criticalStock,
    ),
  };
}

router.get("/admin/inventory", async (req, res): Promise<void> => {
  const q = inventoryQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  if (q.data.branchId != null && !(await scopedBranchId(req, q.data.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const ids = await getAccessibleBranchIds(req);
  const filters = [];
  if (ids) filters.push(ids.length ? inArray(branchProductsTable.branchId, ids) : sql`false`);
  if (q.data.branchId != null) filters.push(eq(branchProductsTable.branchId, q.data.branchId));
  if (q.data.categoryId != null) filters.push(eq(productsTable.categoryId, q.data.categoryId));
  if (q.data.state) filters.push(eq(branchProductsTable.alertState, q.data.state));
  if (q.data.search) filters.push(sql`(${productsTable.sku} ilike ${`%${q.data.search}%`} or ${productsTable.name} ilike ${`%${q.data.search}%`})`);
  const rows = await db.select({ branchProduct: branchProductsTable, branch: branchesTable, product: productsTable,
    reservedStock: sql<number>`coalesce((select sum(${inventoryReservationsTable.quantity}) from ${inventoryReservationsTable} where ${inventoryReservationsTable.branchProductId} = ${branchProductsTable.id} and ${inventoryReservationsTable.status} = 'active'), 0)::int` })
    .from(branchProductsTable).innerJoin(branchesTable, eq(branchProductsTable.branchId, branchesTable.id))
    .innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id))
    .where(filters.length ? and(...filters) : undefined).orderBy(productsTable.name);

  const bpIds = rows.map((r) => r.branchProduct.id);
  const openCounts = bpIds.length
    ? await db
        .select({
          branchProductId: inventoryAlertsTable.branchProductId,
          count: sql<number>`count(*)::int`,
        })
        .from(inventoryAlertsTable)
        .where(
          and(
            inArray(inventoryAlertsTable.branchProductId, bpIds),
            inArray(inventoryAlertsTable.status, ["OPEN", "IN_PROGRESS"]),
          ),
        )
        .groupBy(inventoryAlertsTable.branchProductId)
    : [];
  const countMap = new Map(openCounts.map((c) => [c.branchProductId, Number(c.count)]));
  res.json(
    rows.map((row) =>
      enrichInventoryRow({ ...row, openAlertCount: countMap.get(row.branchProduct.id) ?? 0 }),
    ),
  );
});

router.get("/admin/inventory/matrix", async (req, res): Promise<void> => {
  const ids = await getAccessibleBranchIds(req);
  const rows = await db.select({ product: productsTable, branchProduct: branchProductsTable, branch: branchesTable,
    reservedStock: sql<number>`coalesce((select sum(${inventoryReservationsTable.quantity}) from ${inventoryReservationsTable} where ${inventoryReservationsTable.branchProductId} = ${branchProductsTable.id} and ${inventoryReservationsTable.status} = 'active'), 0)::int` })
    .from(productsTable).leftJoin(branchProductsTable, eq(branchProductsTable.productId, productsTable.id))
    .leftJoin(branchesTable, eq(branchProductsTable.branchId, branchesTable.id))
    .where(ids ? (ids.length ? inArray(branchProductsTable.branchId, ids) : sql`false`) : undefined);
  res.json(
    rows.map((row) => {
      if (!row.branchProduct || !row.branch) return row;
      return enrichInventoryRow({
        branchProduct: row.branchProduct,
        branch: row.branch,
        product: row.product,
        reservedStock: Number(row.reservedStock ?? 0),
      });
    }),
  );
});

const stockUpdateSchema = z.object({
  branchProductId: z.number().int().optional(), branchId: z.number().int().optional(), productId: z.number().int().optional(),
  quantity: z.number().int().min(0).optional(), delta: z.number().int().optional(),
  reason: z.string().min(1), reference: z.string().optional(),
}).refine((v) => v.quantity != null || v.delta != null, "quantity or delta is required");

router.post("/admin/inventory/update", async (req, res): Promise<void> => {
  const parsed = stockUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const input = parsed.data;
  try {
    const result = await db.transaction(async (tx) => {
      let bp;
      if (input.branchProductId) [bp] = await tx.select().from(branchProductsTable).where(eq(branchProductsTable.id, input.branchProductId)).for("update");
      else if (input.branchId && input.productId) [bp] = await tx.select().from(branchProductsTable).where(and(eq(branchProductsTable.branchId, input.branchId), eq(branchProductsTable.productId, input.productId))).for("update");
      if (!bp) throw new Error("INVENTORY_NOT_FOUND");
      if (!(await canAccessBranch(req, bp.branchId))) throw new Error("FORBIDDEN_BRANCH");
      const next = input.quantity != null ? input.quantity : bp.inventory + input.delta!;
      if (next < 0) throw new Error("NEGATIVE_INVENTORY");
      const nextState = stockState(next, bp.minStock);
      const [updated] = await tx.update(branchProductsTable).set({ inventory: next, alertState: nextState }).where(eq(branchProductsTable.id, bp.id)).returning();
      const [ledger] = await tx.insert(inventoryLedgerTable).values({
        branchProductId: bp.id, movement: "adjustment", category: "manual", quantityDelta: next - bp.inventory,
        balanceAfter: next, previousBalance: bp.inventory, newBalance: next, actorUserId: req.localUser?.id,
        reference: input.reference, reason: input.reason,
      }).returning();
      await applyInventoryAlert(tx, bp, next);
      return { inventory: updated, ledger };
    });
    publishCatalogChange(result.inventory.productId, "inventory");
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN_BRANCH") { res.status(403).json({ error: "Branch access denied" }); return; }
    if (message === "INVENTORY_NOT_FOUND") { res.status(404).json({ error: "Inventory record not found" }); return; }
    if (message === "NEGATIVE_INVENTORY") { res.status(409).json({ error: "Inventory cannot be negative" }); return; }
    throw error;
  }
});

router.get("/admin/inventory/movements", async (req, res): Promise<void> => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId != null && !(await canAccessBranch(req, branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const ids = await getAccessibleBranchIds(req);
  const rows = await db.select().from(inventoryLedgerTable).innerJoin(branchProductsTable, eq(inventoryLedgerTable.branchProductId, branchProductsTable.id))
    .where(ids ? (ids.length ? inArray(branchProductsTable.branchId, ids) : sql`false`) : branchId ? eq(branchProductsTable.branchId, branchId) : undefined)
    .orderBy(desc(inventoryLedgerTable.createdAt));
  res.json(rows);
});

router.get("/admin/inventory/alerts", async (req, res): Promise<void> => {
  const q = alertListQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  if (q.data.branchId != null && !(await canAccessBranch(req, q.data.branchId))) {
    res.status(403).json({ error: "Branch access denied" });
    return;
  }
  const ids = await getAccessibleBranchIds(req);
  const filters = [];
  if (ids) filters.push(ids.length ? inArray(inventoryAlertsTable.branchId, ids) : sql`false`);
  if (q.data.branchId != null) filters.push(eq(inventoryAlertsTable.branchId, q.data.branchId));
  if (q.data.productId != null) filters.push(eq(inventoryAlertsTable.productId, q.data.productId));
  if (q.data.type) filters.push(eq(inventoryAlertsTable.type, q.data.type as any));
  if (q.data.priority) filters.push(eq(inventoryAlertsTable.priority, q.data.priority));
  if (q.data.status) filters.push(eq(inventoryAlertsTable.status, q.data.status));
  if (q.data.source) filters.push(eq(inventoryAlertsTable.source, q.data.source));
  if (q.data.assignedUserId) {
    filters.push(eq(inventoryAlertsTable.responsibleUserId, q.data.assignedUserId));
  }
  if (q.data.from) filters.push(gte(inventoryAlertsTable.createdAt, new Date(q.data.from)));
  if (q.data.to) filters.push(lt(inventoryAlertsTable.createdAt, new Date(q.data.to)));

  const rows = await db
    .select({ alert: inventoryAlertsTable, branch: branchesTable, product: productsTable })
    .from(inventoryAlertsTable)
    .innerJoin(branchesTable, eq(inventoryAlertsTable.branchId, branchesTable.id))
    .innerJoin(productsTable, eq(inventoryAlertsTable.productId, productsTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(inventoryAlertsTable.createdAt));
  res.json(rows);
});

router.post("/admin/inventory/alerts", async (req, res): Promise<void> => {
  const parsed = createAlertBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!(await canAccessBranch(req, parsed.data.branchId))) {
    res.status(403).json({ error: "Branch access denied" });
    return;
  }
  const actor = await getRequestUser(req);
  try {
    if (parsed.data.productIds?.length) {
      const result = await createManualAlertsBulk(parsed.data.productIds, {
        branchId: parsed.data.branchId,
        type: parsed.data.type,
        priority: parsed.data.priority,
        message: parsed.data.message,
        assignedUserId: parsed.data.assignedUserId,
        createdByUserId: actor?.id ?? null,
      });
      res.status(201).json(result);
      return;
    }
    const alert = await createManualAlert({
      productId: parsed.data.productId!,
      branchId: parsed.data.branchId,
      type: parsed.data.type,
      priority: parsed.data.priority,
      message: parsed.data.message,
      assignedUserId: parsed.data.assignedUserId,
      createdByUserId: actor?.id ?? null,
    });
    res.status(201).json({ alert });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "BRANCH_PRODUCT_NOT_FOUND") {
      res.status(404).json({ error: "Product not configured for branch" });
      return;
    }
    throw error;
  }
});

router.patch("/admin/inventory/alerts/:id", async (req, res): Promise<void> => {
  const alertId = Number(req.params.id);
  if (!Number.isInteger(alertId)) { res.status(400).json({ error: "Invalid alert id" }); return; }
  const parsed = patchAlertBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db
    .select()
    .from(inventoryAlertsTable)
    .where(eq(inventoryAlertsTable.id, alertId));
  if (!existing) { res.status(404).json({ error: "Alert not found" }); return; }
  if (!(await canAccessBranch(req, existing.branchId))) {
    res.status(403).json({ error: "Branch access denied" });
    return;
  }
  const actor = await getRequestUser(req);
  const nextStatus = parsed.data.status ?? (existing.status as any);
  const isResolution =
    nextStatus === "RESOLVED" ||
    nextStatus === "DISMISSED" ||
    parsed.data.assignedUserId !== undefined ||
    parsed.data.priority !== undefined;
  if (
    isResolution &&
    actor &&
    actor.role === "staff" &&
    !hasGlobalBranchAccess(actor)
  ) {
    // Staff may only mark IN_PROGRESS / reopen; managers+ resolve/assign.
    if (nextStatus !== "IN_PROGRESS" && nextStatus !== "OPEN") {
      res.status(403).json({ error: "Staff can only mark alerts as in progress" });
      return;
    }
    if (parsed.data.assignedUserId !== undefined || parsed.data.priority !== undefined) {
      res.status(403).json({ error: "Staff cannot assign or change priority" });
      return;
    }
  }
  try {
    const updated = await updateAlertStatus({
      alertId,
      status: nextStatus,
      priority: parsed.data.priority,
      assignedUserId: parsed.data.assignedUserId,
      resolutionNote: parsed.data.resolutionNote,
      userId: actor?.id ?? null,
    });
    res.json({ alert: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ALERT_NOT_FOUND") { res.status(404).json({ error: "Alert not found" }); return; }
    throw error;
  }
});

router.get("/admin/inventory/alerts/:id/events", async (req, res): Promise<void> => {
  const alertId = Number(req.params.id);
  if (!Number.isInteger(alertId)) { res.status(400).json({ error: "Invalid alert id" }); return; }
  const [existing] = await db
    .select()
    .from(inventoryAlertsTable)
    .where(eq(inventoryAlertsTable.id, alertId));
  if (!existing) { res.status(404).json({ error: "Alert not found" }); return; }
  if (!(await canAccessBranch(req, existing.branchId))) {
    res.status(403).json({ error: "Branch access denied" });
    return;
  }
  const events = await db
    .select()
    .from(inventoryAlertEventsTable)
    .where(eq(inventoryAlertEventsTable.alertId, alertId))
    .orderBy(desc(inventoryAlertEventsTable.createdAt));
  res.json({ events });
});

router.post("/admin/inventory/import/preview", async (req, res): Promise<void> => {
  const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
  const result = validateInventoryCsv(csv);
  const ids = await getAccessibleBranchIds(req);
  const allowed = ids === null ? null : new Set(ids);
  const branches = await db.select({ id: branchesTable.id, code: branchesTable.branchCode }).from(branchesTable);
  const byCode = new Map(branches.map((b) => [b.code, b.id]));
  const products = await db.select({ id: productsTable.id, sku: productsTable.sku }).from(productsTable);
  const skuMap = new Map(products.map((p) => [p.sku, p.id]));
  const errors = result.errors.map((e) => ({ ...e, message: translateImportMessage(e.message) }));
  const previewRows = [];
  for (const [i, row] of result.rows.entries()) {
    const branchId = byCode.get(row.branchCode);
    const productId = skuMap.get(row.sku);
    if (!branchId) errors.push({ row: i + 2, message: translateImportMessage("Unknown branchCode") });
    else if (allowed && !allowed.has(branchId)) {
      errors.push({ row: i + 2, message: translateImportMessage("Branch access denied") });
    }
    if (!productId) errors.push({ row: i + 2, message: translateImportMessage("Unknown SKU") });

    let willTriggerAlert = false;
    let alertType: string | null = null;
    let nextStatus: string | null = null;
    if (branchId && productId) {
      const [bp] = await db
        .select()
        .from(branchProductsTable)
        .where(
          and(
            eq(branchProductsTable.branchId, branchId),
            eq(branchProductsTable.productId, productId),
          ),
        );
      if (bp) {
        const [reservedRow] = await db
          .select({
            reserved: sql<number>`coalesce(sum(${inventoryReservationsTable.quantity}), 0)`,
          })
          .from(inventoryReservationsTable)
          .where(
            and(
              eq(inventoryReservationsTable.branchProductId, bp.id),
              eq(inventoryReservationsTable.status, "active"),
            ),
          );
        const reserved = Number(reservedRow?.reserved ?? 0);
        const minStock = row.minStock ?? bp.minStock;
        const criticalStock =
          row.criticalStock !== undefined ? row.criticalStock : bp.criticalStock;
        const autoAlertEnabled =
          row.autoAlertEnabled !== undefined ? row.autoAlertEnabled : bp.autoAlertEnabled;
        const prediction = predictAlertOnStockChange({
          previousAvailable: availableStock(bp.inventory, reserved),
          nextAvailable: availableStock(row.quantity, reserved),
          minStock,
          criticalStock,
          autoAlertEnabled,
        });
        willTriggerAlert = prediction.willTriggerAlert;
        alertType = prediction.type;
        nextStatus = prediction.nextStatus;
      }
    }
    previewRows.push({ ...row, willTriggerAlert, alertType, nextStatus });
  }
  res.json({ rows: previewRows, errors, valid: errors.length === 0 });
});

router.post("/admin/inventory/import", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  const parsed = validateInventoryCsv(typeof req.body?.csv === "string" ? req.body.csv : "");
  const branches = await db.select({ id: branchesTable.id, code: branchesTable.branchCode }).from(branchesTable);
  const products = await db.select({ id: productsTable.id, sku: productsTable.sku }).from(productsTable);
  const branchMap = new Map(branches.map((b) => [b.code, b.id])), productMap = new Map(products.map((p) => [p.sku, p.id]));
  const ids = await getAccessibleBranchIds(req);
  const errors = parsed.errors.map((e) => ({ ...e, message: translateImportMessage(e.message) }));
  const existing = await db.select({ branchId: branchProductsTable.branchId, productId: branchProductsTable.productId }).from(branchProductsTable);
  const existingPairs = new Set(existing.map((row) => `${row.branchId}:${row.productId}`));
  for (const [i, row] of parsed.rows.entries()) {
    const branchId = branchMap.get(row.branchCode), productId = productMap.get(row.sku);
    if (!branchId || (ids && !ids.includes(branchId))) errors.push({ row: i + 2, message: translateImportMessage("Invalid branch_code or access") });
    if (!productId) errors.push({ row: i + 2, message: translateImportMessage("Unknown SKU") });
    else if (branchId && !existingPairs.has(`${branchId}:${productId}`)) errors.push({ row: i + 2, message: translateImportMessage("SKU is not configured for branch") });
  }
  if (errors.length) { res.status(400).json({ imported: 0, errors }); return; }

  const { job, reused } = await createImportJob({
    userId: actor?.id,
    type: "inventory",
    filename: typeof req.body?.filename === "string" ? req.body.filename : null,
    idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : null,
  });
  if (reused && job.status === "completed") {
    res.json({ imported: job.updatedCount, errors: [], jobId: job.id });
    return;
  }

  const importedProductIds = new Set<number>();
  const imported = await db.transaction(async (tx) => {
    for (const row of parsed.rows) {
      const branchId = branchMap.get(row.branchCode)!, productId = productMap.get(row.sku)!;
      importedProductIds.add(productId);
      const [bp] = await tx.select().from(branchProductsTable).where(and(eq(branchProductsTable.branchId, branchId), eq(branchProductsTable.productId, productId))).for("update");
      if (!bp) throw new Error(`Missing branch product for ${row.sku}/${row.branchCode}`);
      const minStock = row.minStock ?? bp.minStock;
      const criticalStock =
        row.criticalStock !== undefined ? row.criticalStock : bp.criticalStock;
      const autoAlertEnabled =
        row.autoAlertEnabled !== undefined ? row.autoAlertEnabled : bp.autoAlertEnabled;
      const state = deriveInventoryStatus(row.quantity, minStock, criticalStock);
      await tx.update(branchProductsTable).set({
        inventory: row.quantity,
        minStock,
        criticalStock,
        autoAlertEnabled,
        alertState: state,
      }).where(eq(branchProductsTable.id, bp.id));
      await tx.insert(inventoryLedgerTable).values({ branchProductId: bp.id, movement: "adjustment", category: "import", quantityDelta: row.quantity - bp.inventory, balanceAfter: row.quantity, previousBalance: bp.inventory, newBalance: row.quantity, actorUserId: req.localUser?.id, reason: "Inventory CSV import" });
      await applyInventoryAlert(
        tx,
        { ...bp, minStock, criticalStock, autoAlertEnabled },
        row.quantity,
      );
    }
    return parsed.rows.length;
  });
  for (const productId of importedProductIds) {
    publishCatalogChange(productId, "inventory");
  }
  await completeImportJob(job.id, {
    status: "completed",
    updatedCount: imported,
    createdCount: 0,
    errorCount: 0,
    errorLog: [],
  });
  res.json({ imported, errors: [], jobId: job.id });
});

router.get("/admin/summary", async (_req, res): Promise<void> => {
  const branchIds = await getAccessibleBranchIds(_req);
  const branchScope = branchIds
    ? (branchIds.length ? inArray(branchProductsTable.branchId, branchIds) : sql`false`)
    : undefined;
  const orderBranchScope = branchIds
    ? (branchIds.length ? sql`${ordersTable.branchId} = ANY(${branchIds})` : sql`false`)
    : undefined;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

  const [productCounts] = await db
    .select({
      totalProducts: branchIds
        ? sql<number>`count(distinct ${productsTable.id})::int`
        : sql<number>`count(*)::int`,
      activeProducts:
        branchIds
          ? sql<number>`count(distinct ${productsTable.id}) filter (where ${productsTable.status} = 'active')::int`
          : sql<number>`count(*) filter (where ${productsTable.status} = 'active')::int`,
    })
    .from(productsTable)
    .leftJoin(branchProductsTable, branchIds ? eq(branchProductsTable.productId, productsTable.id) : sql`false`)
    .where(branchIds ? (branchIds.length ? inArray(branchProductsTable.branchId, branchIds) : sql`false`) : undefined);

  const [branchCount] = await db
    .select({ totalBranches: sql<number>`count(*)::int` })
    .from(branchesTable)
    .where(and(
      eq(branchesTable.active, true),
      branchIds ? (branchIds.length ? inArray(branchesTable.id, branchIds) : sql`false`) : undefined,
    ));

  const [stockCounts] = await db
    .select({
      lowStockProducts: sql<number>`count(*) filter (where ${branchProductsTable.alertState} = 'LOW_STOCK')::int`,
      criticalStockProducts: sql<number>`count(*) filter (where ${branchProductsTable.alertState} = 'CRITICAL_STOCK')::int`,
      outOfStockProducts: sql<number>`count(*) filter (where ${branchProductsTable.alertState} = 'OUT_OF_STOCK')::int`,
    })
    .from(branchProductsTable)
    .where(and(eq(branchProductsTable.available, true), branchScope));

  const [orderCounts] = await db
    .select({
      ordersToday: sql<number>`count(*) filter (where ${ordersTable.scheduledStart} >= ${startOfToday} and ${ordersTable.scheduledStart} < ${startOfTomorrow} and ${ordersTable.status} <> 'cancelled')::int`,
      ordersPending: sql<number>`count(*) filter (where ${ordersTable.status} in ('pending_payment','confirmed','paid','preparing','ready'))::int`,
      ordersNextHour: sql<number>`count(*) filter (where ${ordersTable.scheduledStart} >= ${now} and ${ordersTable.scheduledStart} < ${inOneHour} and ${ordersTable.status} <> 'cancelled' and ${ordersTable.status} <> 'completed')::int`,
      salesToday: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.scheduledStart} >= ${startOfToday} and ${ordersTable.scheduledStart} < ${startOfTomorrow} and ${ordersTable.status} <> 'cancelled'), 0)::numeric`,
    })
    .from(ordersTable)
    .where(orderBranchScope);

  const [alertCount] = await db
    .select({ alertsCount: sql<number>`count(*)::int` })
    .from(inventoryAlertsTable)
    .where(and(
      inArray(inventoryAlertsTable.status, ["OPEN", "IN_PROGRESS"]),
      branchIds ? (branchIds.length ? inArray(inventoryAlertsTable.branchId, branchIds) : sql`false`) : undefined,
    ));

  const branchSummaries = await db
    .select({
      branchId: branchesTable.id,
      branchName: branchesTable.name,
      activeProducts:
        sql<number>`count(${branchProductsTable.id}) filter (where ${branchProductsTable.available} = true)::int`,
      lowStockProducts:
        sql<number>`count(${branchProductsTable.id}) filter (where ${branchProductsTable.available} = true and ${branchProductsTable.inventory} > 0 and ${branchProductsTable.inventory} <= ${branchProductsTable.minStock})::int`,
    })
    .from(branchesTable)
    .leftJoin(
      branchProductsTable,
      eq(branchProductsTable.branchId, branchesTable.id),
    )
    .where(and(
      eq(branchesTable.active, true),
      branchIds ? (branchIds.length ? inArray(branchesTable.id, branchIds) : sql`false`) : undefined,
    ))
    .groupBy(branchesTable.id)
    .orderBy(branchesTable.id);

  res.json(
    GetAdminSummaryResponse.parse({
      totalProducts: productCounts?.totalProducts ?? 0,
      activeProducts: productCounts?.activeProducts ?? 0,
      totalBranches: branchCount?.totalBranches ?? 0,
      lowStockProducts: stockCounts?.lowStockProducts ?? 0,
      criticalStockProducts: stockCounts?.criticalStockProducts ?? 0,
      outOfStockProducts: stockCounts?.outOfStockProducts ?? 0,
      ordersToday: orderCounts?.ordersToday ?? 0,
      ordersPending: orderCounts?.ordersPending ?? 0,
      ordersNextHour: orderCounts?.ordersNextHour ?? 0,
      alertsCount: alertCount?.alertsCount ?? 0,
      salesToday: Number(orderCounts?.salesToday ?? 0),
      branchSummaries,
    }),
  );
});

router.get("/admin/products", async (req, res): Promise<void> => {
  const query = ListAdminProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const branchIds = await getAccessibleBranchIds(req);
  const products = await listProductCards({
    search: query.data.search,
    status: query.data.status,
    branchIds: branchIds ?? undefined,
  });
  res.json(ListAdminProductsResponse.parse(products));
});

const productImportInput = z.object({
  csv: z.string(),
  mapping: z.record(z.string(), z.string()).optional(),
  updateExisting: z.boolean().optional().default(true),
  updateFields: z.array(z.string()).optional(),
  relationMode: z.enum(["add", "replace"]).optional().default("add"),
  idempotencyKey: z.string().optional(),
  filename: z.string().optional(),
});

function importFieldAllowed(
  updateFields: Set<string> | null,
  field: string,
  groups: string[],
): boolean {
  if (!updateFields) return true;
  if (updateFields.has(field)) return true;
  return groups.some((group) => updateFields.has(group));
}

router.post("/admin/products/import/preview", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  if (!actor || !hasGlobalBranchAccess(actor)) {
    res.status(403).json({ error: "Global product access required" });
    return;
  }
  const body = productImportInput.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const plan = await makeProductImportPlan(req, body.data.csv, body.data.mapping as ProductImportMapping | undefined ?? {});
  const updateExisting = body.data.updateExisting !== false;
  const rows = [];
  const errors = plan.errors.map((error) => ({
    row: error.row,
    message: translateImportMessage(error.message),
  }));
  for (const { record, action } of plan.rows) {
    if (action === "update" && !updateExisting) {
      errors.push({
        row: record.row,
        message: translateImportMessage("Existing SKU skipped (updateExisting=false)"),
      });
      continue;
    }
    rows.push({
      row: record.row,
      sku: record.sku,
      name: record.name ?? "",
      branchCode: record.branchCode ?? "",
      action,
    });
  }
  res.json({
    rows,
    errors,
    valid: rows.length > 0,
  });
});

router.post("/admin/products/import", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  if (!actor || !hasGlobalBranchAccess(actor)) {
    res.status(403).json({ error: "Global product access required" });
    return;
  }
  const body = productImportInput.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { job, reused } = await createImportJob({
    userId: actor.id,
    type: "product",
    filename: body.data.filename ?? null,
    idempotencyKey: body.data.idempotencyKey ?? null,
  });
  if (reused && job.status === "completed") {
    res.json({
      imported: job.createdCount + job.updatedCount,
      created: job.createdCount,
      updated: job.updatedCount,
      errors: (job.errorLog as Array<{ row: number; message: string }>) ?? [],
      jobId: job.id,
    });
    return;
  }

  const plan = await makeProductImportPlan(req, body.data.csv, body.data.mapping as ProductImportMapping | undefined ?? {});
  const updateExisting = body.data.updateExisting !== false;
  const updateFields = body.data.updateFields?.length ? new Set(body.data.updateFields) : null;
  const relationMode = body.data.relationMode === "replace" ? "replace" : "add";
  const errors = plan.errors.map((error) => ({
    row: error.row,
    message: translateImportMessage(error.message),
  }));
  const validGroups = new Map<string, ProductImportRecord[]>();
  for (const { record, action } of plan.rows) {
    if (action === "update" && !updateExisting) {
      errors.push({
        row: record.row,
        message: translateImportMessage("Existing SKU skipped (updateExisting=false)"),
      });
      continue;
    }
    const records = validGroups.get(record.sku) ?? [];
    records.push(record);
    validGroups.set(record.sku, records);
  }
  const allGroups = new Map<string, ProductImportRecord[]>();
  for (const record of plan.allRows) {
    const records = allGroups.get(record.sku) ?? [];
    records.push(record);
    allGroups.set(record.sku, records);
  }
  const branchMap = new Map(
    plan.branches
      .filter((branch): branch is { id: number; code: string } => !!branch.code)
      .map((branch) => [branch.code.toLowerCase(), branch.id]),
  );
  const allCategories = await db
    .select({ id: categoriesTable.id, name: categoriesTable.name })
    .from(categoriesTable);
  const categoryByName = new Map(
    allCategories.map((category) => [category.name.trim().toLowerCase(), category.id]),
  );
  const allSkus = await db.select({ id: productsTable.id, sku: productsTable.sku }).from(productsTable);
  const idBySku = new Map(allSkus.map((row) => [row.sku, row.id]));
  let created = 0;
  let updated = 0;

  for (const [sku, records] of validGroups) {
    try {
      const allProductRecords = allGroups.get(sku) ?? records;
      const existing = plan.existing.get(sku);
      const first = allProductRecords.find((item) => item.name) ?? allProductRecords[0];
      const categoriesNames =
        allProductRecords.find((item) => item.categories?.length)?.categories;
      const primaryName =
        allProductRecords.find((item) => item.primaryCategory)?.primaryCategory;
      let categoryIds: number[] | undefined;
      let primaryCategoryId: number | undefined;
      if (categoriesNames?.length) {
        categoryIds = categoriesNames
          .map((name) => categoryByName.get(name.trim().toLowerCase()))
          .filter((id): id is number => id != null);
        primaryCategoryId = primaryName
          ? categoryByName.get(primaryName.trim().toLowerCase())
          : categoryIds[0];
      }
      const categoryId =
        allProductRecords.find((item) => item.categoryId != null)?.categoryId ??
        primaryCategoryId;

      const tags = allProductRecords.find((item) => item.tags)?.tags;
      const crossSellSkus = allProductRecords.find((item) => item.crossSellSkus)?.crossSellSkus;
      const crossSellProductIds = crossSellSkus
        ?.map((crossSku) => idBySku.get(crossSku))
        .filter((id): id is number => id != null);
      for (const crossSku of crossSellSkus ?? []) {
        if (!idBySku.has(crossSku)) {
          errors.push({
            row: first.row,
            message: translateImportMessage("Unknown cross-sell SKU") + `: ${crossSku}`,
          });
        }
      }

      const allowGeneral = !existing || importFieldAllowed(updateFields, "name", ["general"]);
      const allowPrice = !existing || importFieldAllowed(updateFields, "price", ["price", "general"]);
      const allowImage =
        !existing || importFieldAllowed(updateFields, "imageUrl", ["images", "general"]);
      const allowCategories =
        !existing ||
        importFieldAllowed(updateFields, "categoryId", ["categories"]) ||
        importFieldAllowed(updateFields, "categories", ["categories"]);
      const allowTags = !existing || importFieldAllowed(updateFields, "tags", ["tags"]);
      const allowInventory =
        !existing ||
        importFieldAllowed(updateFields, "inventory", ["inventory", "branches"]);
      const allowPromo =
        !existing ||
        importFieldAllowed(updateFields, "discountType", ["promotions"]);
      const allowCross =
        !existing ||
        importFieldAllowed(updateFields, "crossSellSkus", ["cross-sell", "cross_sell"]);

      const fields: Record<string, unknown> = {};
      if (!existing || allowGeneral) {
        if (first.name != null) fields.name = first.name;
        if (first.slug != null) fields.slug = first.slug;
        if (first.shortDescription != null) fields.shortDescription = first.shortDescription;
        if (first.description != null) fields.description = first.description;
        if (first.featured != null) fields.featured = first.featured;
        if (first.seasonal != null) fields.seasonal = first.seasonal;
        if (first.status != null) fields.status = first.status;
        if (first.minimumLeadTimeHours != null) {
          fields.minimumLeadTimeHours = first.minimumLeadTimeHours;
        }
      }
      if (allowPrice) {
        if (first.price != null) fields.price = first.price;
        if (first.salePrice !== undefined) fields.salePrice = first.salePrice;
      }
      if (allowImage && first.imageUrl !== undefined) fields.imageUrl = first.imageUrl;

      if (!existing) {
        fields.sku = sku;
        fields.name = fields.name ?? first.name ?? sku;
        fields.slug = fields.slug ?? importSlug(String(fields.name));
        fields.shortDescription =
          fields.shortDescription ?? String(fields.name);
        fields.description = fields.description ?? fields.shortDescription;
        fields.price = fields.price ?? first.price ?? 0;
        fields.status = fields.status ?? "draft";
        fields.featured = fields.featured ?? false;
        fields.seasonal = fields.seasonal ?? false;
        fields.minimumLeadTimeHours = fields.minimumLeadTimeHours ?? 0;
        fields.salePrice = fields.salePrice ?? null;
        fields.imageUrl = fields.imageUrl ?? null;
      }

      const branchConfigurations = allowInventory
        ? records
            .filter((record) => record.branchCode)
            .map((record) => ({
              branchId: branchMap.get(record.branchCode!.toLowerCase())!,
              available: record.available,
              inventory: record.inventory,
              minStock: record.minStock,
              criticalStock: record.criticalStock,
              autoAlertEnabled: record.autoAlertEnabled,
              priceOverride: record.priceOverride,
              salePriceOverride: record.salePriceOverride,
              preparationTimeMinutes: record.preparationTimeMinutes,
              pickupAvailable: record.pickupAvailable,
              deliveryAvailable: record.deliveryAvailable,
            }))
        : undefined;

      const promoRecord = allProductRecords.find(
        (item) => item.discountType && item.discountValue != null,
      );
      const promotions =
        allowPromo && promoRecord
          ? [
              {
                name: `Import ${sku}`,
                type: mapImportDiscountType(promoRecord.discountType)!,
                value: promoRecord.discountValue!,
                startsAt: new Date(promoRecord.discountStart ?? Date.now()),
                endsAt: new Date(
                  promoRecord.discountEnd ?? Date.now() + 7 * 24 * 60 * 60 * 1000,
                ),
                branchIds: (promoRecord.discountBranches ?? [])
                  .map((code) => branchMap.get(code.toLowerCase()))
                  .filter((id): id is number => id != null),
              },
            ]
          : undefined;

      const product = await upsertProductAggregate({
        productId: existing?.id,
        fields: fields as any,
        categoryId: allowCategories ? categoryId : undefined,
        categoryIds: allowCategories ? categoryIds : undefined,
        primaryCategoryId: allowCategories ? primaryCategoryId : undefined,
        categoryMode: existing ? relationMode : "replace",
        tags: allowTags ? tags : undefined,
        tagMode: existing ? relationMode : "replace",
        crossSellProductIds: allowCross ? crossSellProductIds : undefined,
        crossSellMode: existing ? relationMode : "replace",
        branchConfigurations,
        promotions,
        seedAllBranches: !existing,
        actorUserId: actor.id,
        inventoryReason: "Importación de productos",
      });
      if (existing) updated += 1;
      else {
        created += 1;
        idBySku.set(sku, product.id);
      }
      publishCatalogChange(product.id, "product");
    } catch (error) {
      const row = records[0]?.row ?? 0;
      errors.push({
        row,
        message: translateImportMessage(
          error instanceof Error ? error.message : "Could not import SKU",
        ),
      });
    }
  }

  await completeImportJob(job.id, {
    status: errors.length && created + updated === 0 ? "failed" : "completed",
    createdCount: created,
    updatedCount: updated,
    errorCount: errors.length,
    errorLog: errors,
  });

  res.json({
    imported: created + updated,
    created,
    updated,
    errors,
    jobId: job.id,
  });
});

router.post("/admin/products/export", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  if (!actor || !hasGlobalBranchAccess(actor)) {
    res.status(403).json({ error: "Global product access required" });
    return;
  }
  const body = ExportProductsBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const content = await buildProductExportCsv({
    search: body.data.search,
    status: body.data.status,
    ids: body.data.ids,
    reimportable: body.data.reimportable,
    columns: body.data.columns,
  });
  res.json(
    ExportProductsResponse.parse({
      filename: "productos-mallorca.csv",
      contentType: "text/csv; charset=utf-8",
      content,
    }),
  );
});

router.post("/admin/products/bulk", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  if (!actor || !hasGlobalBranchAccess(actor)) {
    res.status(403).json({ error: "Global product access required" });
    return;
  }
  const body = BulkUpdateProductsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = await bulkUpdateProducts({
    ids: body.data.ids,
    action: body.data.action,
    status: body.data.status,
    categoryId: body.data.categoryId,
    categoryIds: (body.data as any).categoryIds,
    tagNames: (body.data as any).tagNames,
    branchId: body.data.branchId,
    minStock: (body.data as any).minStock,
    price: body.data.price,
    featured: body.data.featured,
    crossSellProductIds: (body.data as any).crossSellProductIds,
    promotion: body.data.promotion as any,
    actorUserId: actor.id,
  });
  for (const id of body.data.ids) publishCatalogChange(id, "product");
  res.json(BulkUpdateProductsResponse.parse(result));
});

router.post("/admin/products/:id/duplicate", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  if (!actor || !hasGlobalBranchAccess(actor)) {
    res.status(403).json({ error: "Global product access required" });
    return;
  }
  const params = DuplicateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const created = await duplicateProductById(params.data.id);
  if (!created) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const detail = await getAdminProductDetail(created.id);
  publishCatalogChange(created.id, "product");
  res.status(201).json(DuplicateProductResponse.parse(detail));
});

router.get("/admin/import-jobs", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  if (!actor || !hasGlobalBranchAccess(actor)) {
    res.status(403).json({ error: "Global product access required" });
    return;
  }
  const query = ListImportJobsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(importJobsTable)
    .where(query.data.type ? eq(importJobsTable.type, query.data.type) : undefined)
    .orderBy(desc(importJobsTable.createdAt))
    .limit(50);
  res.json(
    ListImportJobsResponse.parse(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        filename: row.filename,
        status: row.status,
        createdCount: row.createdCount,
        updatedCount: row.updatedCount,
        errorCount: row.errorCount,
        errorLog: row.errorLog ?? [],
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        userId: row.userId,
      })),
    ),
  );
});

router.get("/admin/import-jobs/:id", async (req, res): Promise<void> => {
  const actor = await getRequestUser(req);
  if (!actor || !hasGlobalBranchAccess(actor)) {
    res.status(403).json({ error: "Global product access required" });
    return;
  }
  const params = GetImportJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(importJobsTable).where(eq(importJobsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Import job not found" });
    return;
  }
  res.json(
    GetImportJobResponse.parse({
      id: row.id,
      type: row.type,
      filename: row.filename,
      status: row.status,
      createdCount: row.createdCount,
      updatedCount: row.updatedCount,
      errorCount: row.errorCount,
      errorLog: row.errorLog ?? [],
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      userId: row.userId,
    }),
  );
});

router.get("/admin/products/:id/promotions", async (req, res): Promise<void> => {
  const params = ListProductPromotionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [product] = await db
    .select({ id: productsTable.id, price: productsTable.price })
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const accessibleBranchIds = await getAccessibleBranchIds(req);
  const rows = await db
    .select({
      promotion: promotionsTable,
      branchId: promotionBranchesTable.branchId,
    })
    .from(promotionsTable)
    .leftJoin(
      promotionBranchesTable,
      eq(promotionBranchesTable.promotionId, promotionsTable.id),
    )
    .where(eq(promotionsTable.productId, product.id))
    .orderBy(desc(promotionsTable.createdAt), desc(promotionsTable.id));
  const grouped = new Map<number, { promotion: typeof promotionsTable.$inferSelect; branchIds: number[] }>();
  for (const row of rows) {
    if (
      accessibleBranchIds !== null &&
      row.branchId !== null &&
      !accessibleBranchIds.includes(row.branchId)
    ) {
      continue;
    }
    const current = grouped.get(row.promotion.id);
    if (current) {
      if (row.branchId !== null) current.branchIds.push(row.branchId);
    } else {
      grouped.set(row.promotion.id, {
        promotion: row.promotion,
        branchIds: row.branchId === null ? [] : [row.branchId],
      });
    }
  }
  res.json(
    ListProductPromotionsResponse.parse(
      [...grouped.values()].map(({ promotion, branchIds }) =>
        promotionHistoryShape(promotion, branchIds, product.price),
      ),
    ),
  );
});

router.post("/admin/products/:id/promotions", async (req, res): Promise<void> => {
  const params = CreateProductPromotionParams.safeParse(req.params);
  const body = CreateProductPromotionBody.safeParse(req.body);
  const promotion = promotionInputSchema.safeParse(req.body);
  if (!params.success || !body.success || !promotion.success) {
    const error = !promotion.success
      ? promotionValidationError(promotion.error)
      : "Invalid promotion";
    res.status(400).json({ error });
    return;
  }
  try {
    const created = await createPromotionsForProduct(req, params.data.id, [promotion.data]);
    const product = await db
      .select({ price: productsTable.price })
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id));
    const item = created[0];
    if (!item || !product[0]) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    publishCatalogChange(params.data.id, "promotion");
    res.status(201).json(
      CreateProductPromotionResponse.parse(
        promotionHistoryShape(item.promotion, item.branchIds, product[0].price),
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PRODUCT_NOT_FOUND") {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (message === "FORBIDDEN_BRANCH" || message === "GLOBAL_PROMOTION_ACCESS_REQUIRED") {
      res.status(403).json({ error: "Branch access denied" });
      return;
    }
    if (message === "UNKNOWN_BRANCH") {
      res.status(400).json({ error: "Unknown branch" });
      return;
    }
    throw error;
  }
});

router.patch("/admin/products/:id/promotions/:promotionId", async (req, res): Promise<void> => {
  const params = UpdateProductPromotionParams.safeParse(req.params);
  const body = UpdateProductPromotionBody.safeParse(req.body);
  const promotion = promotionInputSchema.safeParse(req.body);
  if (!params.success || !body.success || !promotion.success) {
    res.status(400).json({ error: "Invalid promotion" });
    return;
  }
  const productId = params.data.id;
  const promotionId = params.data.promotionId;

  const [current] = await db
    .select({
      promotion: promotionsTable,
      productPrice: productsTable.price,
    })
    .from(promotionsTable)
    .innerJoin(productsTable, eq(productsTable.id, promotionsTable.productId))
    .where(and(eq(promotionsTable.id, promotionId), eq(promotionsTable.productId, productId)));
  if (!current) {
    res.status(404).json({ error: "Promotion not found" });
    return;
  }

  const currentStatus = promotionStatus(current.promotion);
  if (currentStatus !== "scheduled") {
    res.status(409).json({ error: "Only scheduled promotions can be edited" });
    return;
  }
  if (body.data.startsAt <= new Date()) {
    res.status(400).json({ error: "Edited promotions must start in the future" });
    return;
  }
  try {
    await validatePromotionScope(req, [body.data]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN_BRANCH" || message === "GLOBAL_PROMOTION_ACCESS_REQUIRED") {
      res.status(403).json({ error: "Branch access denied" });
      return;
    }
    if (message === "UNKNOWN_BRANCH") {
      res.status(400).json({ error: "Unknown branch" });
      return;
    }
    throw error;
  }

  const accessibleBranchIds = await getAccessibleBranchIds(req);
  const existingBranches = await db
    .select({ branchId: promotionBranchesTable.branchId })
    .from(promotionBranchesTable)
    .where(eq(promotionBranchesTable.promotionId, promotionId));
  if (
    accessibleBranchIds !== null &&
    (
      existingBranches.length === 0 ||
      existingBranches.some(({ branchId }) => !accessibleBranchIds.includes(branchId))
    )
  ) {
    res.status(403).json({ error: "Branch access denied" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [promotion] = await tx
      .update(promotionsTable)
      .set({
        name: body.data.name,
        type: body.data.type,
        value: body.data.value,
        startsAt: body.data.startsAt,
        endsAt: body.data.endsAt,
      })
      .where(
        and(
          eq(promotionsTable.id, promotionId),
          eq(promotionsTable.productId, productId),
          gt(promotionsTable.startsAt, new Date()),
          isNull(promotionsTable.cancelledAt),
        ),
      )
      .returning();
    if (!promotion) return null;

    await tx
      .delete(promotionBranchesTable)
      .where(eq(promotionBranchesTable.promotionId, promotionId));
    if (body.data.branchIds.length) {
      await tx.insert(promotionBranchesTable).values(
        body.data.branchIds.map((branchId) => ({ promotionId, branchId })),
      );
    }
    return promotion;
  });

  if (!updated) {
    res.status(409).json({ error: "Only scheduled promotions can be edited" });
    return;
  }
  publishCatalogChange(productId, "promotion");
  res.json(
    UpdateProductPromotionResponse.parse(
      promotionHistoryShape(updated, body.data.branchIds, current.productPrice),
    ),
  );
});

router.post("/admin/products/:id/promotions/:promotionId/cancel", async (req, res): Promise<void> => {
  const params = CancelProductPromotionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid promotion" });
    return;
  }
  const productId = params.data.id;
  const promotionId = params.data.promotionId;

  const [current] = await db
    .select({
      promotion: promotionsTable,
      productPrice: productsTable.price,
    })
    .from(promotionsTable)
    .innerJoin(productsTable, eq(productsTable.id, promotionsTable.productId))
    .where(and(eq(promotionsTable.id, promotionId), eq(promotionsTable.productId, productId)));
  if (!current) {
    res.status(404).json({ error: "Promotion not found" });
    return;
  }
  if (promotionStatus(current.promotion) !== "scheduled") {
    res.status(409).json({ error: "Only scheduled promotions can be cancelled" });
    return;
  }

  const accessibleBranchIds = await getAccessibleBranchIds(req);
  const existingBranches = await db
    .select({ branchId: promotionBranchesTable.branchId })
    .from(promotionBranchesTable)
    .where(eq(promotionBranchesTable.promotionId, promotionId));
  if (
    accessibleBranchIds !== null &&
    (
      existingBranches.length === 0 ||
      existingBranches.some(({ branchId }) => !accessibleBranchIds.includes(branchId))
    )
  ) {
    res.status(403).json({ error: "Branch access denied" });
    return;
  }

  const actor = await getRequestUser(req);
  const [cancelled] = await db
    .update(promotionsTable)
    .set({
      cancelledAt: new Date(),
      cancelledBy: actor?.id ?? null,
    })
    .where(
      and(
        eq(promotionsTable.id, promotionId),
        eq(promotionsTable.productId, productId),
        gt(promotionsTable.startsAt, new Date()),
        isNull(promotionsTable.cancelledAt),
      ),
    )
    .returning();
  if (!cancelled) {
    res.status(409).json({ error: "Only scheduled promotions can be cancelled" });
    return;
  }

  publishCatalogChange(productId, "promotion");
  res.json(
    CancelProductPromotionResponse.parse(
      promotionHistoryShape(cancelled, existingBranches.map(({ branchId }) => branchId), current.productPrice),
    ),
  );
});

router.post("/admin/products", async (req, res): Promise<void> => {
  const body = CreateProductBody.safeParse(req.body);
  const configurations = branchConfigurationsSchema.safeParse(req.body?.branchConfigurations);
  const promotions = promotionsInputSchema.safeParse(req.body?.promotions);
  if (!body.success || !configurations.success || !promotions.success) {
    const message = !body.success
      ? body.error.message
      : !configurations.success
        ? configurations.error.message
        : promotions.error
          ? promotionValidationError(promotions.error)
          : "Invalid branch configuration";
    req.log.warn({ errors: message }, "Invalid product");
    res.status(400).json({ error: message });
    return;
  }
  const actor = await getRequestUser(req);
  if (!actor || !hasGlobalBranchAccess(actor)) {
    res.status(403).json({ error: "Global product access required" });
    return;
  }
  for (const config of configurations.data ?? []) {
    if (!(await canAccessBranch(req, config.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  }
  try {
    await validatePromotionScope(req, promotions.data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN_BRANCH" || message === "GLOBAL_PROMOTION_ACCESS_REQUIRED") {
      res.status(403).json({ error: "Branch access denied" });
      return;
    }
    if (message === "UNKNOWN_BRANCH") {
      res.status(400).json({ error: "Unknown branch" });
      return;
    }
    throw error;
  }

  const {
    branchConfigurations: _branchConfigurations,
    promotions: _promotions,
    categoryIds,
    primaryCategoryId,
    tags,
    crossSellProductIds,
    ...productData
  } = body.data as typeof body.data & {
    categoryIds?: number[];
    primaryCategoryId?: number;
    tags?: string[];
    crossSellProductIds?: number[];
  };

  let product;
  try {
    product = await upsertProductAggregate({
      fields: {
        sku: productData.sku,
        name: productData.name,
        slug: productData.slug,
        shortDescription: productData.shortDescription,
        description: productData.description,
        price: productData.price,
        salePrice: productData.salePrice,
        imageUrl: productData.imageUrl,
        gallery: productData.gallery ?? [],
        featured: productData.featured,
        seasonal: productData.seasonal,
        status: productData.status,
        minimumLeadTimeHours: productData.minimumLeadTimeHours,
      },
      categoryId: productData.categoryId,
      categoryIds,
      primaryCategoryId,
      tags,
      crossSellProductIds,
      branchConfigurations: configurations.data ?? [],
      promotions: (promotions.data ?? []).map((promo) => ({
        ...promo,
        startsAt: new Date(promo.startsAt),
        endsAt: new Date(promo.endsAt),
      })),
      actorUserId: req.localUser?.id ?? null,
      inventoryReason: "Alta de producto",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message === "PRIMARY_CATEGORY_REQUIRED" ||
      message === "CATEGORIES_REQUIRED" ||
      message === "PRIMARY_NOT_IN_CATEGORIES" ||
      message === "UNKNOWN_CATEGORY" ||
      message === "PRODUCT_FIELDS_REQUIRED"
    ) {
      res.status(400).json({ error: message });
      return;
    }
    if (message === "FORBIDDEN_BRANCH" || message === "GLOBAL_PROMOTION_ACCESS_REQUIRED") {
      res.status(403).json({ error: "Branch access denied" });
      return;
    }
    throw error;
  }

  const detail = await getAdminProductDetail(product.id);
  publishCatalogChange(product.id, "product");
  res.status(201).json(CreateProductResponse.parse(detail));
});

router.get("/admin/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  const detail = await getAdminProductDetail(row.id);
  if (!detail) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  res.json(GetAdminProductResponse.parse(detail));
});

router.patch("/admin/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  const body = UpdateProductBody.safeParse(req.body);
  const configurations = branchConfigurationsSchema.safeParse(req.body?.branchConfigurations);
  const promotions = promotionsInputSchema.safeParse(req.body?.promotions);

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!body.success || !configurations.success || !promotions.success) {
    const error = !body.success
      ? body.error.message
      : !configurations.success
        ? configurations.error.message
        : promotions.error
          ? promotionValidationError(promotions.error)
          : "Invalid branch configuration";
    res.status(400).json({ error });
    return;
  }

  const actor = await getRequestUser(req);
  if (Object.keys(body.data).length > 0 && (!actor || !hasGlobalBranchAccess(actor))) {
    res.status(403).json({ error: "Global product access required" });
    return;
  }
  for (const config of configurations.data ?? []) {
    if (!(await canAccessBranch(req, config.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  }
  try {
    await validatePromotionScope(req, promotions.data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN_BRANCH" || message === "GLOBAL_PROMOTION_ACCESS_REQUIRED") {
      res.status(403).json({ error: "Branch access denied" });
      return;
    }
    if (message === "UNKNOWN_BRANCH") {
      res.status(400).json({ error: "Unknown branch" });
      return;
    }
    throw error;
  }

  const {
    branchConfigurations: _branchConfigurations,
    promotions: _promotions,
    categoryIds,
    primaryCategoryId,
    tags,
    crossSellProductIds,
    ...productData
  } = body.data as typeof body.data & {
    categoryIds?: number[];
    primaryCategoryId?: number;
    tags?: string[];
    crossSellProductIds?: number[];
  };

  let product;
  try {
    product = await upsertProductAggregate({
      productId: params.data.id,
      fields: { ...productData },
      categoryId: productData.categoryId,
      categoryIds,
      primaryCategoryId,
      tags,
      crossSellProductIds,
      crossSellMode: crossSellProductIds !== undefined ? "replace" : undefined,
      branchConfigurations: configurations.data,
      promotions: (promotions.data ?? []).map((promo) => ({
        ...promo,
        startsAt: new Date(promo.startsAt),
        endsAt: new Date(promo.endsAt),
      })),
      actorUserId: req.localUser?.id ?? null,
      inventoryReason: "Ajuste desde ficha de producto",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PRODUCT_NOT_FOUND") {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }
    if (
      message === "PRIMARY_CATEGORY_REQUIRED" ||
      message === "CATEGORIES_REQUIRED" ||
      message === "PRIMARY_NOT_IN_CATEGORIES" ||
      message === "UNKNOWN_CATEGORY"
    ) {
      res.status(400).json({ error: message });
      return;
    }
    if (message === "FORBIDDEN_BRANCH" || message === "GLOBAL_PROMOTION_ACCESS_REQUIRED") {
      res.status(403).json({ error: "Branch access denied" });
      return;
    }
    throw error;
  }

  const detail = await getAdminProductDetail(product.id);
  publishCatalogChange(product.id, "product");
  res.json(UpdateProductResponse.parse(detail));
});

export default router;