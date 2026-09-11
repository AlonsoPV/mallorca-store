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