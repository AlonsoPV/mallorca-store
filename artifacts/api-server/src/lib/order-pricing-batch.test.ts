import assert from "node:assert/strict";
import test from "node:test";
import { priceCatalogLinesFromLoadedData } from "./order-pricing.ts";

const activePromotion = {
  promotion: {
    id: 31,
    productId: 12,
    name: "Branch discount",
    type: "percentage" as const,
    value: 20,
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: new Date("2027-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  branchIds: [5],
};

test("batched pricing keeps branch promotion authoritative and reserved stock accurate", () => {
  const product = {
    id: 12,
    sku: "ITEM-12",
    name: "Producto 12",
    price: 150,
    salePrice: 140,
    status: "active",
  };
  const branchProduct = {
    id: 81,
    productId: 12,
    branchId: 5,
    priceOverride: 145,
    salePriceOverride: 130,
    inventory: 5,
    available: true,
  };
  const variant = {
    id: 91,
    productId: 12,
    sku: "ITEM-12-L",
    name: "Tamaño",
    value: "Grande",
    price: 120,
    salePrice: 115,
    active: true,
  };

  const [priced] = priceCatalogLinesFromLoadedData({
    branchId: 5,
    lines: [{ productId: 12, variantId: 91, quantity: 3 }],
    products: [{ product, bp: branchProduct }] as any,
    variants: [variant] as any,
    promotionsByProduct: new Map([[12, [activePromotion]]]),
    reservedByBranchProduct: new Map([[81, 3]]),
  });

  assert.equal(priced.unitPrice, 96);
  assert.equal(priced.promotionId, 31);
  assert.equal(priced.promotionDiscount, 72);
  assert.equal(priced.inventory, 2);
  assert.equal(priced.available, false);
  assert.equal(priced.reason, "Stock insuficiente");
  assert.equal(priced.sku, "ITEM-12-L");
});

test("batched pricing rejects a variant that belongs to another product", () => {
  const product = { id: 12, sku: "ITEM-12", name: "Producto 12", status: "active" };
  const bp = { id: 81, productId: 12, branchId: 5, inventory: 4, available: true };
  const [priced] = priceCatalogLinesFromLoadedData({
    branchId: 5,
    lines: [{ productId: 12, variantId: 92, quantity: 1 }],
    products: [{ product, bp }] as any,
    variants: [{ id: 92, productId: 99, active: true }] as any,
    promotionsByProduct: new Map(),
    reservedByBranchProduct: new Map(),
  });

  assert.equal(priced.available, false);
  assert.equal(priced.reason, "Variante no disponible");
  assert.equal(priced.unitPrice, 0);
});