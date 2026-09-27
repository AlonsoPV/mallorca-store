import assert from "node:assert/strict";
import test from "node:test";
import {
  cartLeadMinutes,
  fulfillmentSchedule,
  isReadyForLead,
  isValidSlotTime,
  itemLeadMinutes,
  leadRequirementReason,
  type FulfillmentBranch,
} from "./fulfillment-schedule.ts";

const hours = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
].map((day, index) => ({
  day,
  label: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][index],
  open: "08:00",
  close: "21:00",
  closed: false,
}));

const branch = (overrides: Partial<FulfillmentBranch> = {}): FulfillmentBranch => ({
  hours,
  pickupSlotIntervalMinutes: 30,
  preparationTimeMinutes: 60,
  deliveryTimeMinutes: 90,
  pickupSlotCapacity: 8,
  ...overrides,
});

test("item lead uses the greater of product hours and kitchen minutes", () => {
  assert.equal(
    itemLeadMinutes({
      minimumLeadTimeHours: 4,
      itemPreparationTimeMinutes: 60,
      branchPreparationTimeMinutes: 60,
    }),
    240,
  );
  assert.equal(
    itemLeadMinutes({
      minimumLeadTimeHours: 0,
      itemPreparationTimeMinutes: null,
      branchPreparationTimeMinutes: 60,
    }),
    60,
  );
  assert.equal(
    itemLeadMinutes({
      minimumLeadTimeHours: 0,
      itemPreparationTimeMinutes: 0,
      branchPreparationTimeMinutes: 60,
    }),
    0,
  );
});

test("cart lead floors on branch prep even with an empty bag", () => {
  assert.equal(cartLeadMinutes([], 60), 60);
  assert.equal(
    cartLeadMinutes(
      [{ minimumLeadTimeHours: 6, itemPreparationTimeMinutes: 60 }],
      60,
    ),
    360,
  );
});

test("same-day slots start from order time plus item notice, not from opening plus notice", () => {
  // Saturday 26 Sep 2026 10:00 Mexico (−06:00).
  const now = Date.parse("2026-09-26T16:00:00.000Z");
  const schedule = fulfillmentSchedule(branch(), "2026-09-26", "pickup", 360, now);
  assert.ok(schedule);
  assert.equal(schedule.first, Date.parse("2026-09-26T22:00:00.000Z"));
  assert.equal(isValidSlotTime(schedule, new Date(schedule.first)), true);
  assert.equal(isValidSlotTime(schedule, new Date("2026-09-26T16:00:00.000Z")), false);
});

test("long item notice does not push every future day's first slot past closing", () => {
  const now = Date.parse("2026-09-26T16:00:00.000Z");
  const schedule = fulfillmentSchedule(branch(), "2026-09-27", "pickup", 24 * 60, now);
  assert.ok(schedule);
  assert.equal(schedule.first, Date.parse("2026-09-27T16:00:00.000Z"));
  assert.ok(schedule.first < schedule.close);
});

test("delivery adds travel time on top of kitchen lead", () => {
  const now = Date.parse("2026-09-26T16:00:00.000Z");
  const schedule = fulfillmentSchedule(branch(), "2026-09-26", "delivery", 60, now);
  assert.ok(schedule);
  // 10:00 + max(60, 60) + 90 = 12:30 Mexico.
  assert.equal(schedule.first, Date.parse("2026-09-26T18:30:00.000Z"));
});

test("isReadyForLead compares the slot against now plus notice", () => {
  const now = Date.parse("2026-09-26T16:00:00.000Z");
  assert.equal(isReadyForLead(Date.parse("2026-09-26T19:00:00.000Z"), 240, now), false);
  assert.equal(isReadyForLead(Date.parse("2026-09-26T22:00:00.000Z"), 240, now), true);
  assert.equal(leadRequirementReason(45), "Requiere 45 min de preparación.");
  assert.equal(leadRequirementReason(240), "Requiere 4 h de preparación.");
});
