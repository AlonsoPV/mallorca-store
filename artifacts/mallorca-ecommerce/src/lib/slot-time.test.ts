import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSlotTime,
  mexicoToday,
  sameSlot,
  slotToIso,
  slotTimestamp,
} from "./slot-time.ts";

test("treats ISO, Date, and equivalent offsets as the same slot", () => {
  const iso = "2026-09-21T18:00:00.000-06:00";
  const utc = "2026-09-22T00:00:00.000Z";
  assert.equal(sameSlot(iso, utc), true);
  assert.equal(sameSlot(iso, new Date(utc)), true);
  assert.equal(sameSlot(iso, "2026-09-22T00:00:00Z"), true);
  assert.equal(sameSlot(iso, "2026-09-21T16:00:00.000Z"), false);
});

test("formats evening Mexico slots without following UTC", () => {
  const evening = formatSlotTime("2026-09-22T00:00:00.000Z").replace(/\s/g, "");
  const morning = formatSlotTime("2026-09-21T16:00:00.000Z").replace(/\s/g, "");
  assert.match(evening, /6:00/);
  assert.match(morning, /10:00/);
  assert.notEqual(evening, morning);
});

test("normalizes slot values to ISO for persistence", () => {
  assert.equal(slotToIso("2026-09-21T18:00:00.000-06:00"), "2026-09-22T00:00:00.000Z");
  assert.equal(slotTimestamp(""), null);
  assert.match(mexicoToday(new Date("2026-09-22T04:30:00.000Z")), /^2026-09-21$/);
});
