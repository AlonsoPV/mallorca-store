import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canApplyManualDiscount,
  canOverrideAvailability,
  canAddManualLineItem,
  discountPercentEquivalent,
  maxManualDiscountPercent,
} from "./order-permissions.ts";
import { computeDeliveryFee, validateDeliveryCoverage } from "./delivery-validation.ts";
import {
  fulfillmentSchedule,
  isValidSlotTime,
  reservationTtlMinutesUntil,
} from "./fulfillment-schedule.ts";

describe("order-permissions", () => {
  it("blocks staff from 20% discount", () => {
    assert.equal(canApplyManualDiscount("staff", 20), false);
    assert.equal(maxManualDiscountPercent("staff"), 0);
  });

  it("allows branch_manager up to 10%", () => {
    assert.equal(canApplyManualDiscount("branch_manager", 10), true);
    assert.equal(canApplyManualDiscount("branch_manager", 11), false);
  });

  it("allows admin unlimited discount", () => {
    assert.equal(canApplyManualDiscount("admin", 100), true);
    assert.equal(maxManualDiscountPercent("admin"), null);
  });

  it("restricts override and manual lines", () => {
    assert.equal(canOverrideAvailability("staff"), false);
    assert.equal(canOverrideAvailability("branch_manager"), true);
    assert.equal(canAddManualLineItem("staff"), false);
    assert.equal(canAddManualLineItem("operations"), true);
  });

  it("computes percent equivalent from amount", () => {
    assert.equal(discountPercentEquivalent({ type: "amount", value: 100, subtotal: 1000 }), 10);
  });
});

describe("delivery-validation", () => {
  const branch = {
    id: 1,
    latitude: 19.43,
    longitude: -99.13,
    deliveryAvailable: true,
    deliveryRadiusKm: 5,
    deliveryFee: 80,
    freeDeliveryFrom: 1000,
    minimumOrder: 200,
  };

  it("rejects outside radius", () => {
    const result = validateDeliveryCoverage({
      branch,
      latitude: 20,
      longitude: -100,
      subtotal: 500,
    });
    assert.equal(result.eligible, false);
  });

  it("applies freeDeliveryFrom", () => {
    assert.equal(computeDeliveryFee({ branch, method: "delivery", subtotal: 1200 }), 0);
    assert.equal(computeDeliveryFee({ branch, method: "delivery", subtotal: 500 }), 80);
    assert.equal(computeDeliveryFee({ branch, method: "pickup", subtotal: 1200 }), 0);
  });
});

describe("fulfillment-schedule", () => {
  it("builds slots from branch hours", () => {
    const branch = {
      hours: [
        { day: "monday", label: "Monday", open: "09:00", close: "18:00", closed: false },
      ],
      pickupSlotIntervalMinutes: 30,
      preparationTimeMinutes: 60,
      deliveryTimeMinutes: 30,
      pickupSlotCapacity: 5,
    } as any;
    const date = "2026-09-14";
    const schedule = fulfillmentSchedule(
      branch,
      date,
      "pickup",
      0,
      Date.parse("2026-09-14T10:00:00-06:00"),
    );
    assert.ok(schedule);
    assert.equal(schedule!.capacity, 5);
    const slot = new Date(schedule!.first);
    assert.equal(isValidSlotTime(schedule!, slot), true);
  });

  it("parses HH:mm:ss hours and Spanish weekday labels", () => {
    const branch = {
      hours: [
        { day: "lunes", label: "Lunes", open: "09:00:00", close: "18:00:00", closed: false },
      ],
      pickupSlotIntervalMinutes: 30,
      preparationTimeMinutes: 60,
      deliveryTimeMinutes: 30,
      pickupSlotCapacity: 5,
    } as any;
    const schedule = fulfillmentSchedule(
      branch,
      "2026-09-14",
      "pickup",
      0,
      Date.parse("2026-09-14T08:00:00-06:00"),
    );
    assert.ok(schedule);
    assert.equal(new Date(schedule!.first).toISOString(), "2026-09-14T16:00:00.000Z");
    assert.equal(isValidSlotTime(schedule!, new Date(schedule!.first)), true);
  });

  it("opens delivery slots later than pickup for the same branch", () => {
    const branch = {
      hours: [
        { day: "monday", label: "Monday", open: "09:00", close: "18:00", closed: false },
      ],
      pickupSlotIntervalMinutes: 30,
      preparationTimeMinutes: 60,
      deliveryTimeMinutes: 45,
      pickupSlotCapacity: 5,
    } as any;
    const now = Date.parse("2026-09-14T08:00:00-06:00");
    const pickup = fulfillmentSchedule(branch, "2026-09-14", "pickup", 0, now);
    const delivery = fulfillmentSchedule(branch, "2026-09-14", "delivery", 0, now);
    assert.ok(pickup && delivery);
    assert.ok(delivery.first > pickup.first);
  });

  it("allows future slots when a cart item needs 24 hours of notice", () => {
    const branch = {
      hours: [
        { day: "monday", label: "Monday", open: "09:00", close: "18:00", closed: false },
        { day: "tuesday", label: "Tuesday", open: "09:00", close: "18:00", closed: false },
      ],
      pickupSlotIntervalMinutes: 30,
      preparationTimeMinutes: 60,
      deliveryTimeMinutes: 30,
      pickupSlotCapacity: 5,
    } as any;
    const now = Date.parse("2026-09-14T08:00:00-06:00");
    const today = fulfillmentSchedule(branch, "2026-09-14", "pickup", 1440, now);
    const tomorrow = fulfillmentSchedule(branch, "2026-09-15", "pickup", 1440, now);
    const delivery = fulfillmentSchedule(branch, "2026-09-15", "delivery", 1440, now);
    assert.ok(today && tomorrow && delivery);
    assert.ok(today.first + today.intervalMs > today.close);
    assert.equal(new Date(tomorrow.first).toISOString(), "2026-09-15T16:00:00.000Z");
    assert.ok(isValidSlotTime(tomorrow, new Date(tomorrow.first)));
    assert.equal(new Date(delivery.first).toISOString(), "2026-09-15T16:30:00.000Z");
  });
});

describe("reservation TTL", () => {
  it("holds stock until the slot and at least 15 minutes", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    assert.equal(
      reservationTtlMinutesUntil(new Date("2026-09-15T18:00:00.000Z"), now),
      360,
    );
    assert.equal(
      reservationTtlMinutesUntil(new Date("2026-09-15T12:05:00.000Z"), now),
      15,
    );
  });
});
