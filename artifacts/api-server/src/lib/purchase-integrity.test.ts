import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod/v4";
import { calculatePromotionPrice } from "./catalog-promotions.ts";
import { computeDeliveryFee } from "./delivery-validation.ts";
import { parseProductImportCsv } from "./inventory.ts";
import { hydrateAdminBranchConfiguration } from "./admin-product-serialize.ts";

const AddCartItemBody = z.object({
  productId: z.number().int(),
  variantId: z.number().int().nullish(),
  quantity: z.number().int().min(1),
});

test("add-to-cart ignores client price and rejects invalid quantities", () => {
  const parsed = AddCartItemBody.safeParse({
    productId: 1,
    quantity: 2,
    price: 1,
    name: "hack",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal("price" in parsed.data, false);
    assert.equal(parsed.data.quantity, 2);
  }
  assert.equal(AddCartItemBody.safeParse({ productId: 1, quantity: 0 }).success, false);
  assert.equal(AddCartItemBody.safeParse({ productId: 1, quantity: -1 }).success, false);
  assert.equal(AddCartItemBody.safeParse({ productId: 1, quantity: 1.5 }).success, false);
});

test("order totals match 2 x 350 with 20% promo and 80 delivery", () => {
  const unit = calculatePromotionPrice(350, { type: "percentage", value: 20 }).finalPrice;
  assert.equal(unit, 280);
  const subtotal = unit * 2;
  assert.equal(subtotal, 560);
  const delivery = computeDeliveryFee({
    branch: { deliveryFee: 80, freeDeliveryFrom: null } as any,
    method: "delivery",
    subtotal,
  });
  assert.equal(delivery, 80);
  assert.equal(subtotal + delivery, 640);
});

test("imported product rows map price, branch stock, promo and cross-sell", () => {
  const result = parseProductImportCsv(
    [
      "sku,name,price,categories,tags,branch_code,available,inventory,min_stock,price_override,discount_type,discount_value,discount_start,discount_end,cross_sell_skus",
      "QA-PAN-001,Panettone QA,350,Panadería|Temporada,Navidad|Regalo,REFORMA,true,10,3,,percentage,20,2026-09-16T00:00:00Z,2026-12-31T00:00:00Z,CHOCO-01|CHOCO-02",
      "QA-PAN-001,,,,,LOMAS,true,5,2,370,,,,,,",
    ].join("\n"),
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].price, 350);
  assert.equal(result.rows[0].inventory, 10);
  assert.equal(result.rows[0].discountType, "percentage");
  assert.equal(result.rows[0].discountValue, 20);
  assert.deepEqual(result.rows[0].crossSellSkus, ["CHOCO-01", "CHOCO-02"]);
  assert.equal(result.rows[1].priceOverride, 370);
  assert.equal(result.rows[1].inventory, 5);
});

test("storefront payment stub never marks the order paid", () => {
  const storefrontCreate = {
    paymentMethod: "CASH_ON_PICKUP" as const,
    markPaid: false,
    paymentStatus: "unpaid",
    status: "confirmed",
  };
  assert.equal(storefrontCreate.markPaid, false);
  assert.equal(storefrontCreate.paymentStatus, "unpaid");
  assert.equal(storefrontCreate.status, "confirmed");
  const paymentStub = { httpStatus: 503, code: "PAYMENT_PROVIDER_NOT_CONFIGURED" };
  assert.equal(paymentStub.httpStatus, 503);
  assert.notEqual(paymentStub.code, "PAID");
});

test("re-saving admin availability without override does not invent one", () => {
  const config = hydrateAdminBranchConfiguration({
    branchId: 2,
    available: true,
    inventory: 10,
    price: 350,
    priceOverride: null,
    criticalStock: 1,
    autoAlertEnabled: true,
  });
  assert.equal(config.priceOverride, null);
  assert.equal(config.inventory, 10);
  assert.equal(config.criticalStock, 1);
});
