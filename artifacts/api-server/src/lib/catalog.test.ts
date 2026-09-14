import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePromotionPrice,
  promotionStatus,
  resolveCatalogPrice,
  selectPromotionForBranch,
} from "./catalog-promotions.ts";

const date = (value: string) => new Date(value);

const promotion = (
  overrides: Partial<{
    id: number;
    type: "fixed" | "percentage" | "amount";
    value: number;
    startsAt: Date;
    endsAt: Date;
    createdAt: Date;
    cancelledAt?: Date | null;
  }> = {},
) => ({
  id: 1,
  productId: 10,
  name: "Promoción de prueba",
  type: "percentage" as const,
  value: 20,
  startsAt: date("2026-09-14T10:00:00.000Z"),
  endsAt: date("2026-09-14T14:00:00.000Z"),
  createdAt: date("2026-09-14T09:00:00.000Z"),
  ...overrides,
});

const candidate = (
  promotionOverrides: Parameters<typeof promotion>[0] = {},
  branchIds: number[] = [],
) => ({
  promotion: promotion(promotionOverrides),
  branchIds,
});

test("calculates fixed-price, percentage and amount promotions", () => {
  assert.deepEqual(calculatePromotionPrice(100, { type: "fixed", value: 65 }), {
    finalPrice: 65,
    savings: 35,
  });
  assert.deepEqual(
    calculatePromotionPrice(100, { type: "percentage", value: 25 }),
    { finalPrice: 75, savings: 25 },
  );
  assert.deepEqual(calculatePromotionPrice(100, { type: "amount", value: 30 }), {
    finalPrice: 70,
    savings: 30,
  });
});

test("reports scheduled, active, finished and cancelled promotion states", () => {
  const now = date("2026-09-14T12:00:00.000Z");

  assert.equal(
    promotionStatus(
      promotion({
        startsAt: date("2026-09-14T12:01:00.000Z"),
        endsAt: date("2026-09-14T14:00:00.000Z"),
      }),
      now,
    ),
    "scheduled",
  );
  assert.equal(promotionStatus(promotion(), now), "active");
  assert.equal(
    promotionStatus(
      promotion({ endsAt: date("2026-09-14T12:00:00.000Z") }),
      now,
    ),
    "finished",
  );
  assert.equal(
    promotionStatus(
      promotion({ cancelledAt: date("2026-09-14T09:30:00.000Z") }),
      now,
    ),
    "cancelled",
  );
});

test("prioritizes a branch-specific promotion over a global promotion", () => {
  const globalPromotion = candidate(
    {
      id: 20,
      createdAt: date("2026-09-14T11:00:00.000Z"),
      value: 10,
    },
    [],
  );
  const branchPromotion = candidate(
    {
      id: 10,
      createdAt: date("2026-09-14T09:00:00.000Z"),
      value: 30,
    },
    [7],
  );

  assert.equal(
    selectPromotionForBranch([globalPromotion, branchPromotion], 7)?.promotion.id,
    10,
  );
  assert.equal(
    selectPromotionForBranch([globalPromotion, branchPromotion], 8)?.promotion.id,
    20,
  );
});

test("uses the most recently created promotion as the date tie-breaker", () => {
  const older = candidate(
    {
      id: 20,
      createdAt: date("2026-09-14T09:00:00.000Z"),
      value: 10,
    },
    [7],
  );
  const newer = candidate(
    {
      id: 10,
      createdAt: date("2026-09-14T11:00:00.000Z"),
      value: 30,
    },
    [7],
  );

  assert.equal(
    selectPromotionForBranch([older, newer], 7)?.promotion.id,
    10,
  );
});

test("keeps variant detail and cart prices aligned for a branch promotion", () => {
  const branchId = 7;
  const variant = {
    id: 501,
    productId: 10,
    price: 125,
    salePrice: null,
  };
  const activePromotion = selectPromotionForBranch(
    [
      candidate(
        {
          type: "percentage",
          value: 20,
        },
        [branchId],
      ),
    ],
    branchId,
  );

  const detailPrice = resolveCatalogPrice(
    variant.price,
    variant.salePrice,
    activePromotion?.promotion,
  );
  const cartPrice = resolveCatalogPrice(
    variant.price,
    variant.salePrice,
    activePromotion?.promotion,
  );

  assert.deepEqual(detailPrice, { finalPrice: 100, savings: 25 });
  assert.deepEqual(cartPrice, detailPrice);
});

test("keeps variant detail and cart prices aligned without promotion or inherited sale price", () => {
  const variant = {
    id: 502,
    productId: 10,
    price: 125,
    salePrice: null,
  };
  const promotionForOtherBranch = selectPromotionForBranch(
    [candidate({}, [7])],
    8,
  );

  const detailPrice = resolveCatalogPrice(
    variant.price,
    variant.salePrice,
    promotionForOtherBranch?.promotion,
  );
  const cartPrice = resolveCatalogPrice(
    variant.price,
    variant.salePrice,
    promotionForOtherBranch?.promotion,
  );

  assert.deepEqual(detailPrice, { finalPrice: 125, savings: 0 });
  assert.deepEqual(cartPrice, detailPrice);
});

test("inherits the product sale price equally when a variant has no sale price", () => {
  const variant = {
    id: 503,
    productId: 10,
    price: 125,
    salePrice: null,
  };
  const inheritedSalePrice = 110;

  const detailPrice = resolveCatalogPrice(
    variant.price,
    variant.salePrice ?? inheritedSalePrice,
  );
  const cartPrice = resolveCatalogPrice(
    variant.price,
    variant.salePrice ?? inheritedSalePrice,
  );

  assert.deepEqual(detailPrice, { finalPrice: 110, savings: 15 });
  assert.deepEqual(cartPrice, detailPrice);
});