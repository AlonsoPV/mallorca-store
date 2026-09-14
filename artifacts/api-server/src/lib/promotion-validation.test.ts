import assert from "node:assert/strict";
import test from "node:test";
import {
  promotionInputSchema,
  promotionValidationError,
} from "./promotion-validation.ts";

const promotion = {
  name: "Early bird",
  type: "percentage" as const,
  value: 20,
  startsAt: "2026-09-20T10:00:00.000Z",
  endsAt: "2026-09-20T12:00:00.000Z",
  branchIds: [1],
};

test("rejects a promotion whose end is before its start", () => {
  const result = promotionInputSchema.safeParse({
    ...promotion,
    endsAt: "2026-09-20T09:59:00.000Z",
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      promotionValidationError(result.error),
      "Invalid promotion date range: endsAt must be after startsAt",
    );
  }
});

test("rejects a promotion whose end equals its start", () => {
  const result = promotionInputSchema.safeParse({
    ...promotion,
    endsAt: promotion.startsAt,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      promotionValidationError(result.error),
      "Invalid promotion date range: endsAt must be after startsAt",
    );
  }
});

test("accepts a promotion whose end is after its start", () => {
  const result = promotionInputSchema.safeParse(promotion);

  assert.equal(result.success, true);
});