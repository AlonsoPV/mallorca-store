import {
  parseProductImportCsv,
  productImportFields,
} from "./src/lib/inventory.ts";

const escape = (value) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
export function exportLocalProducts(products, branches, options = {}) {
  const rows = [productImportFields.join(",")];
  for (const product of products) {
    if (options.ids && !options.ids.includes(product.id)) continue;
    if (options.status && (product.status ?? "active") !== options.status)
      continue;
    if (
      options.search &&
      !`${product.name} ${product.sku}`
        .toLowerCase()
        .includes(options.search.toLowerCase())
    )
      continue;
    for (const config of product.availability?.length
      ? product.availability
      : [{}]) {
      const branch = branches.find((b) => b.id === config.branchId);
      const data = {
        ...product,
        ...config,
        price: product.price,
        salePrice: product.salePrice,
        status: product.status ?? "active",
        branchCode: branch?.branchCode ?? "",
        categories: (product.categories ?? []).map((c) => c.name).join("|"),
        tags: (product.tags ?? []).join("|"),
        primaryCategory: product.categories?.find((c) => c.isPrimary)?.name,
        crossSellSkus: (product.crossSellProductIds ?? [])
          .map((id) => products.find((p) => p.id === id)?.sku)
          .filter(Boolean)
          .join("|"),
      };
      rows.push(productImportFields.map((key) => escape(data[key])).join(","));
    }
  }
  return rows.join("\n");
}
export function previewLocalProducts(body, products, branches, categories) {
  const parsed = parseProductImportCsv(body.csv ?? "", body.mapping);
  const errors = [...parsed.errors];
  const rows = [];
  for (const row of parsed.rows) {
    const product = products.find((p) => p.sku === row.sku);
    const first = parsed.rows.find((r) => r.sku === row.sku);
    let message;
    if (
      row.branchCode &&
      !branches.some(
        (b) => b.branchCode.toLowerCase() === row.branchCode.toLowerCase(),
      )
    )
      message = "Sucursal desconocida";
    if (
      row.categoryId != null &&
      !categories.some((c) => c.id === row.categoryId)
    )
      message = "Categoría desconocida";
    if (!product && (!first.name || first.price == null || !first.categoryId))
      message = "Nuevo SKU requiere nombre, precio y categoría";
    if (product && body.updateExisting === false) message = "El SKU ya existe";
    if (message) errors.push({ row: row.row, message });
    else rows.push({ ...row, action: product ? "update" : "new" });
  }
  return { rows, errors, valid: errors.length === 0 && rows.length > 0 };
}
export function importLocalProducts(
  body,
  products,
  branches,
  categories,
  applyConfigurations,
  setStock,
) {
  const preview = previewLocalProducts(body, products, branches, categories);
  if (preview.errors.length)
    return { created: 0, updated: 0, imported: 0, errors: preview.errors };
  const groups = new Map();
  for (const row of preview.rows) {
    if (!groups.has(row.sku)) groups.set(row.sku, []);
    groups.get(row.sku).push(row);
  }
  let created = 0,
    updated = 0;
  for (const [sku, rows] of groups) {
    let product = products.find((p) => p.sku === sku);
    const exists = Boolean(product);
    const allowed = (group) =>
      !exists ||
      !body.updateFields?.length ||
      body.updateFields.includes(group);
    if (!product) {
      product = {
        id: Math.max(0, ...products.map((p) => p.id)) + 1,
        sku,
        availability: [],
        status: "draft",
        slug: sku.toLowerCase(),
      };
      products.push(product);
      created++;
    } else updated++;
    const first = rows[0];
    const fields = {
      general: [
        "name",
        "slug",
        "description",
        "shortDescription",
        "featured",
        "seasonal",
        "status",
        "minimumLeadTimeHours",
      ],
      price: ["price", "salePrice"],
      images: ["imageUrl"],
      categories: ["categoryId"],
      tags: ["tags"],
    };
    for (const [group, keys] of Object.entries(fields))
      if (allowed(group))
        for (const key of keys)
          if (
            first[key] !== undefined &&
            (!Array.isArray(first[key]) || first[key].length)
          )
            product[key] = first[key];
    if (allowed("categories") && first.categoryId) {
      const category = categories.find((c) => c.id === first.categoryId);
      product.categorySlug = category.slug;
      product.categories = [{ ...category, isPrimary: true }];
    }
    if (allowed("inventory") || allowed("branches")) {
      const configs = rows
        .filter((r) => r.branchCode)
        .map((r) => ({
          ...r,
          branchId: branches.find(
            (b) => b.branchCode.toLowerCase() === r.branchCode.toLowerCase(),
          ).id,
        }));
      product.availability = applyConfigurations(product, configs);
      for (const config of configs)
        if (config.inventory !== undefined)
          setStock(config.branchId, product.id, config.inventory);
    }
  }
  return { created, updated, imported: created + updated, errors: [] };
}
