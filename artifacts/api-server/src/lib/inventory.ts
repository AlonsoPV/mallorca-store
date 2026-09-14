export type StockState = "NORMAL" | "LOW_STOCK" | "OUT_OF_STOCK";

/** Computes the persisted alert state from an absolute inventory balance. */
export function stockState(inventory: number, minStock: number): StockState {
  if (inventory <= 0) return "OUT_OF_STOCK";
  if (inventory <= minStock) return "LOW_STOCK";
  return "NORMAL";
}

/** Alerts are emitted only when entering either alert state. */
export function enteredAlertState(previous: StockState, next: StockState): boolean {
  return next !== previous && (next === "LOW_STOCK" || next === "OUT_OF_STOCK");
}

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
  "imageUrl",
  "featured",
  "seasonal",
  "status",
  "minimumLeadTimeHours",
  "branchCode",
  "available",
  "inventory",
  "minStock",
  "priceOverride",
  "salePriceOverride",
  "preparationTimeMinutes",
  "pickupAvailable",
  "deliveryAvailable",
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
  imageUrl?: string;
  featured?: boolean;
  seasonal?: boolean;
  status?: "draft" | "active" | "inactive";
  minimumLeadTimeHours?: number;
  branchCode?: string;
  available?: boolean;
  inventory?: number;
  minStock?: number;
  priceOverride?: number;
  salePriceOverride?: number;
  preparationTimeMinutes?: number;
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
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
  imageUrl: ["image_url", "imagen", "imagen_url"],
  branchCode: ["branch_code", "sucursal", "codigo_sucursal", "código_sucursal"],
  inventory: ["quantity", "cantidad", "stock"],
  salePrice: ["sale_price", "precio_oferta"],
  minimumLeadTimeHours: ["minimum_lead_time_hours", "horas_preparacion"],
  minStock: ["min_stock", "stock_minimo", "stock_mínimo"],
  priceOverride: ["price_override", "precio_sucursal"],
  salePriceOverride: ["sale_price_override", "precio_oferta_sucursal"],
  preparationTimeMinutes: ["preparation_time_minutes", "minutos_preparacion"],
  pickupAvailable: ["pickup_available", "recogida_disponible"],
  deliveryAvailable: ["delivery_available", "entrega_disponible"],
};

function fieldIndex(
  headers: string[],
  field: ProductImportField,
  mapping: ProductImportMapping,
): number {
  const mapped = mapping[field];
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

/**
 * Parses the complete product import contract. The parser only validates
 * cell types; database-backed validation (categories, branches and access)
 * belongs to the route so preview and import use the same source of truth.
 */
export function parseProductImportCsv(
  csv: string,
  mapping: ProductImportMapping = {},
): { rows: ProductImportRecord[]; errors: ProductImportIssue[]; headers: string[] } {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
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
      imageUrl: readText(values, indices.imageUrl),
      featured: readBoolean(values, indices.featured, row, "featured", errors),
      seasonal: readBoolean(values, indices.seasonal, row, "seasonal", errors),
      status: statusValue ? status : undefined,
      minimumLeadTimeHours: readNumber(values, indices.minimumLeadTimeHours, row, "minimumLeadTimeHours", errors),
      branchCode,
      available: readBoolean(values, indices.available, row, "available", errors),
      inventory: readNumber(values, indices.inventory, row, "inventory", errors),
      minStock: readNumber(values, indices.minStock, row, "minStock", errors),
      priceOverride: readNumber(values, indices.priceOverride, row, "priceOverride", errors),
      salePriceOverride: readNumber(values, indices.salePriceOverride, row, "salePriceOverride", errors),
      preparationTimeMinutes: readNumber(values, indices.preparationTimeMinutes, row, "preparationTimeMinutes", errors),
      pickupAvailable: readBoolean(values, indices.pickupAvailable, row, "pickupAvailable", errors),
      deliveryAvailable: readBoolean(values, indices.deliveryAvailable, row, "deliveryAvailable", errors),
    };
    if (errors.length === rowErrorsBefore) rows.push(record);
  });
  return { rows, errors, headers };
}

/**
 * Strict CSV parser for the inventory import contract. It intentionally accepts
 * only SKU, branch_code and quantity and rejects duplicate SKU/branch pairs.
 */
export function validateInventoryCsv(csv: string): {
  rows: ImportRow[];
  errors: ImportRowError[];
} {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows: [], errors: [{ row: 1, message: "CSV is empty" }] };
  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
  if (header.length !== 3 || header.join(",") !== "sku,branch_code,quantity") {
    return { rows: [], errors: [{ row: 1, message: "Header must be sku,branch_code,quantity" }] };
  }
  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const values = line.split(",").map((value) => value.trim());
    if (values.length !== 3 || values.some((value) => !value)) {
      errors.push({ row: rowNumber, message: "Expected non-empty sku, branch_code and quantity" });
      return;
    }
    const quantity = Number(values[2]);
    const key = `${values[0]}\u0000${values[1]}`;
    if (!Number.isInteger(quantity) || quantity < 0) errors.push({ row: rowNumber, message: "Quantity must be a non-negative integer" });
    if (seen.has(key)) errors.push({ row: rowNumber, message: "Duplicate SKU + branch_code row" });
    seen.add(key);
    if (Number.isInteger(quantity) && quantity >= 0 && !errors.some((error) => error.row === rowNumber)) {
      rows.push({ sku: values[0], branchCode: values[1], quantity });
    }
  });
  return { rows, errors };
}