import assert from "node:assert/strict";
import test from "node:test";
import { projectLegacyFromSatellites } from "./branch-legacy.ts";

test("projectLegacyFromSatellites does not null imageUrl when images empty", () => {
  const projection = projectLegacyFromSatellites([], [], []);
  assert.equal(projection.imageUrl, undefined);
  assert.equal(projection.gallery, undefined);
  assert.equal(projection.openTableUrl, undefined);
  assert.equal(projection.instagramUrl, undefined);
  assert.equal(projection.mapsUrl, undefined);
  assert.ok(Array.isArray(projection.hours));
});

test("projectLegacyFromSatellites projects active link and hero image", () => {
  const projection = projectLegacyFromSatellites(
    [
      { type: "opentable", url: "https://www.opentable.com/r/qa", active: true },
      { type: "instagram", url: "https://instagram.com/mallorca", active: true },
      { type: "maps", url: "https://maps.google.com/?q=1", active: true },
    ],
    [
      { type: "hero", url: "/images/hero.jpg", sortOrder: 0 },
      { type: "gallery", url: "/images/g1.jpg", sortOrder: 1 },
    ],
    [
      {
        weekday: 1,
        openTime: "10:00",
        closeTime: "19:00",
        closed: false,
        slotOrder: 0,
      },
    ],
  );
  assert.equal(projection.openTableUrl, "https://www.opentable.com/r/qa");
  assert.equal(projection.instagramUrl, "https://instagram.com/mallorca");
  assert.equal(projection.mapsUrl, "https://maps.google.com/?q=1");
  assert.equal(projection.imageUrl, "/images/hero.jpg");
  assert.deepEqual(projection.gallery, ["/images/g1.jpg"]);
  assert.equal(projection.hours.length, 1);
  assert.equal(projection.hours[0].open, "10:00");
});

test("projectLegacyFromSatellites ignores inactive links", () => {
  const projection = projectLegacyFromSatellites(
    [{ type: "opentable", url: "https://www.opentable.com/r/old", active: false }],
    [],
    [],
  );
  assert.equal(projection.openTableUrl, undefined);
});
