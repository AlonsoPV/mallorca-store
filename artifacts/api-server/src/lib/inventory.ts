import { mapImportDiscountType, splitPipeList } from "./product-aggregate-pure.ts";
import {
  stockState,
  enteredAlertState,
  deriveInventoryStatus,
  availableStock,
  predictAlertOnStockChange,
  type InventoryStatus,
} from "./inventory-status.ts";

export type StockState = InventoryStatus;

export {
  mapImportDiscountType,
  splitPipeList,
  stockState,
  enteredAlertState,
  deriveInventoryStatus,
  availableStock,
  predictAlertOnStockChange,
};

/** Computes the persisted alert state from an absolute inventory balance. */
// stockState re-exported from inventory-status (available-aware callers should use deriveInventoryStatus)

/** Alerts are emitted only when entering either alert state. */
// enteredAlertState re-exported

export type ImportRow = { sku: string; branchCode: string; quantity: number };
export type ImportRowError = { row: number; message: string };

export const productImportFields = [
  "sku",
  "name",
  "slug",
  "shortDescription",
  "description",
  "price",
  "salePrice",
  "categoryId",
  "categories",
  "primaryCategory",
  "tags",
  "imageUrl",
  "featured",
  "seasonal",
  "status",
  "minimumLeadTimeHours",
  "branchCode",
  "available",
  "inventory",
  "minStock",
  "criticalStock",
  "autoAlertEnabled",
  "priceOverride",
  "salePriceOverride",
  "preparationTimeMinutes",
  "pickupAvailable",
  "deliveryAvailable",
  "discountType",
  "discountValue",
  "discountStart",
  "discountEnd",
  "discountBranches",
  "crossSellSkus",
] as const;

export type ProductImportField = (typeof productImportFields)[number];
export type ProductImportMapping = Partial<Record<ProductImportField, string>>;

export type ProductImportRecord = {
  row: number;
  sku: string;
  name?: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  price?: number;
  salePrice?: number;
  categoryId?: number;
  categories?: string[];
  primaryCategory?: string;
  tags?: string[];
  imageUrl?: string;
  featured?: boolean;
  seasonal?: boolean;
  status?: "draft" | "active" | "inactive";
  minimumLeadTimeHours?: number;
  branchCode?: string;
  available?: boolean;
  inventory?: number;
  minStock?: number;
  criticalStock?: number;
  autoAlertEnabled?: boolean;
  priceOverride?: number;
  salePriceOverride?: number;
  preparationTimeMinutes?: number;
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
  discountType?: "percentage" | "fixed_amount" | "fixed_price";
  discountValue?: number;
  discountStart?: string;
  discountEnd?: string;
  discountBranches?: string[];
  crossSellSkus?: string[];
};

export type ProductImportIssue = ImportRowError;

type CsvCell = { value: string };

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function normalizeImportHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const importHeaderAliases: Partial<Record<ProductImportField, string[]>> = {
  shortDescription: ["short_description", "descripcion_corta", "descripción_corta"],
  categoryId: ["category_id", "categoria_id", "categoría_id"],
  categories: ["category_names", "categorias"],
  primaryCategory: ["primary_category", "categoria_principal"],
  tags: ["etiquetas"],
  imageUrl: ["image_url", "imagen", "imagen_url"],
  branchCode: ["branch_code", "sucursal", "codigo_sucursal", "código_sucursal"],
  inventory: ["quantity", "cantidad", "stock"],
  salePrice: ["sale_price", "precio_oferta"],
  minimumLeadTimeHours: ["minimum_lead_time_hours", "horas_preparacion"],
  minStock: ["min_stock", "stock_minimo", "stock_mínimo"],
  criticalStock: ["critical_stock"],
  autoAlertEnabled: ["auto_alert", "auto_alert_enabled"],
  priceOverride: ["price_override", "precio_sucursal"],
  salePriceOverride: ["sale_price_override", "precio_oferta_sucursal"],
  preparationTimeMinutes: ["preparation_time_minutes", "minutos_preparacion"],
  pickupAvailable: ["pickup_available", "recogida_disponible"],
  deliveryAvailable: ["delivery_available", "entrega_disponible"],
  discountType: ["discount_type"],
  discountValue: ["discount_value"],
  discountStart: ["discount_start"],
  discountEnd: ["discount_end"],
  discountBranches: ["discount_branches"],
  crossSellSkus: ["cross_sell_skus", "cross_sell"],
};

function fieldIndex(
  headers: string[],
  field: ProductImportField,
  mapping: ProductImportMapping,
): number {
  const mapped = mapping[field];
  if (mapped === "") return -1;
  if (mapped) {
    const mappedIndex = headers.findIndex((header) => header === mapped);
    if (mappedIndex >= 0) return mappedIndex;
  }
  const candidates = [field, ...(importHeaderAliases[field] ?? [])].map(normalizeImportHeader);
  return headers.findIndex((header) => candidates.includes(normalizeImportHeader(header)));
}

function readText(
  values: string[],
  index: number,
): string | undefined {
  const value = index >= 0 ? values[index]?.trim() : "";
  return value ? value : undefined;
}

function readNumber(
  values: string[],
  index: number,
  row: number,
  field: string,
  errors: ProductImportIssue[],
): number | undefined {
  const value = readText(values, index);
  if (value == null) return undefined;
  const numberValue = Number(value.replace(",", "."));
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    errors.push({ row, message: `${field} must be a non-negative number` });
    return undefined;
  }
  return numberValue;
}

function readBoolean(
  values: string[],
  index: number,
  row: number,
  field: string,
  errors: ProductImportIssue[],
): boolean | undefined {
  const value = readText(values, index)?.toLowerCase();
  if (value == null) return undefined;
  if (["true", "1", "yes", "si", "sí"].includes(value)) return true;
  if (["false", "0", "no"].includes(value)) return false;
  errors.push({ row, message: `${field} must be true/false` });
  return undefined;
}

function productCsvLines(csv: string): string[] {
  const lines: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { value += '""'; i++; continue; }
      quoted = !quoted;
    }
    if (char === "\n" && !quoted) {
      if (value.trim()) lines.push(value.replace(/\r$/, ""));
      value = "";
    } else value += char;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (value.trim()) lines.push(value);
  return lines;
}

/**
 * Parses the complete product import contract. The parser only validates
 * cell types; database-backed validation (categories, branches and access)
 * belongs to the route so preview and import use the same source of truth.
 */
export function parseProductImportCsv(
  csv: string,
  mapping: ProductImportMapping = {},
): { rows: ProductImportRecord[]; errors: ProductImportIssue[]; headers: string[] } {
  let lines: string[];
  try { lines = productCsvLines(csv.replace(/^\uFEFF/, "")); }
  catch { return { rows: [], errors: [{ row: 1, message: "Unclosed CSV quote" }], headers: [] }; }
  if (!lines.length) return { rows: [], errors: [{ row: 1, message: "CSV is empty" }], headers: [] };
  const headers = parseCsvLine(lines[0]);
  if (!mapping.sku && !headers.some((header) => normalizeImportHeader(header) === "sku")) {
    return { rows: [], errors: [{ row: 1, message: "A SKU column is required" }], headers };
  }

  const indices = Object.fromEntries(
    productImportFields.map((field) => [field, fieldIndex(headers, field, mapping)]),
  ) as Record<ProductImportField, number>;
  const rows: ProductImportRecord[] = [];
  const errors: ProductImportIssue[] = [];
  const seenBranchRows = new Set<string>();

  lines.slice(1).forEach((line, index) => {
    const row = index + 2;
    const values = parseCsvLine(line);
    const sku = readText(values, indices.sku);
    if (!sku) {
      errors.push({ row, message: "SKU is required" });
      return;
    }

    const branchCode = readText(values, indices.branchCode);
    const branchKey = `${sku}\u0000${branchCode ?? ""}`;
    if (seenBranchRows.has(branchKey)) {
      errors.push({ row, message: "Duplicate SKU + branch_code row" });
      return;
    }
    seenBranchRows.add(branchKey);

    const rowErrorsBefore = errors.length;
    const statusValue = readText(values, indices.status);
    const status = statusValue as ProductImportRecord["status"];
    if (statusValue && !["draft", "active", "inactive"].includes(statusValue)) {
      errors.push({ row, message: "status must be draft, active or inactive" });
    }

    const discountTypeRaw = readText(values, indices.discountType);
    const mappedDiscount = mapImportDiscountType(discountTypeRaw);
    if (discountTypeRaw && !mappedDiscount) {
      errors.push({
        row,
        message: "discount_type must be percentage, fixed_amount or fixed_price",
      });
    }

    const record: ProductImportRecord = {
      row,
      sku,
      name: readText(values, indices.name),
      slug: readText(values, indices.slug),
      shortDescription: readText(values, indices.shortDescription),
      description: readText(values, indices.description),
      price: readNumber(values, indices.price, row, "price", errors),
      salePrice: readNumber(values, indices.salePrice, row, "salePrice", errors),
      categoryId: readNumber(values, indices.categoryId, row, "categoryId", errors),
      categories: splitPipeList(readText(values, indices.categories)),
      primaryCategory: readText(values, indices.primaryCategory),
      tags: splitPipeList(readText(values, indices.tags)),
      imageUrl: readText(values, indices.imageUrl),
      featured: readBoolean(values, indices.featured, row, "featured", errors),
      seasonal: readBoolean(values, indices.seasonal, row, "seasonal", errors),
      status: statusValue ? status : undefined,
      minimumLeadTimeHours: readNumber(values, indices.minimumLeadTimeHours, row, "minimumLeadTimeHours", errors),
      branchCode,
      available: readBoolean(values, indices.available, row, "available", errors),
      inventory: readNumber(values, indices.inventory, row, "inventory", errors),
      minStock: readNumber(values, indices.minStock, row, "minStock", errors),
      criticalStock: readNumber(values, indices.criticalStock, row, "criticalStock", errors),
      autoAlertEnabled: readBoolean(values, indices.autoAlertEnabled, row, "autoAlertEnabled", errors),
      priceOverride: readNumber(values, indices.priceOverride, row, "priceOverride", errors),
      salePriceOverride: readNumber(values, indices.salePriceOverride, row, "salePriceOverride", errors),
      preparationTimeMinutes: readNumber(values, indices.preparationTimeMinutes, row, "preparationTimeMinutes", errors),
      pickupAvailable: readBoolean(values, indices.pickupAvailable, row, "pickupAvailable", errors),
      deliveryAvailable: readBoolean(values, indices.deliveryAvailable, row, "deliveryAvailable", errors),
      discountType: mappedDiscount
        ? (discountTypeRaw!.trim().toLowerCase() as ProductImportRecord["discountType"])
        : undefined,
      discountValue: readNumber(values, indices.discountValue, row, "discountValue", errors),
      discountStart: readText(values, indices.discountStart),
      discountEnd: readText(values, indices.discountEnd),
      discountBranches: splitPipeList(readText(values, indices.discountBranches)),
      crossSellSkus: splitPipeList(readText(values, indices.crossSellSkus)),
    };
    for (const field of ["inventory", "minStock", "criticalStock", "preparationTimeMinutes"] as const) {
      if (record[field] != null && !Number.isSafeInteger(record[field])) errors.push({ row, message: `${field} must be an integer` });
    }
    if (record.criticalStock != null && record.minStock != null && record.criticalStock > record.minStock) errors.push({ row, message: "criticalStock must not exceed minStock" });
    if (!branchCode && [record.inventory, record.minStock, record.criticalStock, record.autoAlertEnabled].some(value => value !== undefined)) errors.push({ row, message: "branchCode is required for inventory" });
    if (errors.length === rowErrorsBefore) rows.push(record);
  });
  return { rows, errors, headers };
}

export type InventoryImportRow = ImportRow & {
  minStock?: number;
  criticalStock?: number | null;
  autoAlertEnabled?: boolean;
};

/**
 * CSV parser for inventory import.
 * Required: sku, branch_code, quantity.
 * Optional: min_stock, critical_stock, auto_alert.
 */
export function validateInventoryCsv(csv: string): {
  rows: InventoryImportRow[];
  errors: ImportRowError[];
} {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows: [], errors: [{ row: 1, message: "CSV is empty" }] };
  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const col = {
    sku: header.indexOf("sku"),
    branchCode: header.indexOf("branch_code"),
    quantity: header.indexOf("quantity"),
    minStock: header.indexOf("min_stock"),
    criticalStock: header.indexOf("critical_stock"),
    autoAlert: header.indexOf("auto_alert"),
  };
  if (col.sku < 0 || col.branchCode < 0 || col.quantity < 0) {
    return {
      rows: [],
      errors: [{ row: 1, message: "Header must include sku,branch_code,quantity" }],
    };
  }
  const rows: InventoryImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const values = line.split(",").map((value) => value.trim());
    const sku = values[col.sku];
    const branchCode = values[col.branchCode];
    const quantityRaw = values[col.quantity];
    if (!sku || !branchCode || quantityRaw === undefined || quantityRaw === "") {
      errors.push({ row: rowNumber, message: "Expected non-empty sku, branch_code and quantity" });
      return;
    }
    const quantity = Number(quantityRaw);
    const minRaw = col.minStock >= 0 ? values[col.minStock] : undefined;
    const criticalRaw = col.criticalStock >= 0 ? values[col.criticalStock] : undefined;
    const autoRaw = col.autoAlert >= 0 ? values[col.autoAlert] : undefined;
    const minStock = minRaw !== undefined && minRaw !== "" ? Number(minRaw) : undefined;
    const criticalStock =
      criticalRaw !== undefined && criticalRaw !== "" ? Number(criticalRaw) : undefined;
    let autoAlertEnabled: boolean | undefined;
    if (autoRaw !== undefined && autoRaw !== "") {
      const normalized = autoRaw.toLowerCase();
      if (["1", "true", "yes", "si", "sí"].includes(normalized)) autoAlertEnabled = true;
      else if (["0", "false", "no"].includes(normalized)) autoAlertEnabled = false;
      else errors.push({ row: rowNumber, message: "auto_alert must be true/false" });
    }
    const key = `${sku}\u0000${branchCode}`;
    if (!Number.isInteger(quantity) || quantity < 0) {
      errors.push({ row: rowNumber, message: "Quantity must be a non-negative integer" });
    }
    if (minStock != null && (!Number.isInteger(minStock) || minStock < 0)) {
      errors.push({ row: rowNumber, message: "min_stock must be a non-negative integer" });
    }
    if (criticalStock != null && (!Number.isInteger(criticalStock) || criticalStock < 0)) {
      errors.push({ row: rowNumber, message: "critical_stock must be a non-negative integer" });
    }
    if (seen.has(key)) errors.push({ row: rowNumber, message: "Duplicate SKU + branch_code row" });
    seen.add(key);
    if (
      Number.isInteger(quantity) &&
      quantity >= 0 &&
      !errors.some((error) => error.row === rowNumber)
    ) {
      rows.push({
        sku,
        branchCode,
        quantity,
        ...(minStock != null ? { minStock } : {}),
        ...(criticalStock != null ? { criticalStock } : {}),
        ...(autoAlertEnabled != null ? { autoAlertEnabled } : {}),
      });
    }
  });
  return { rows, errors };
}