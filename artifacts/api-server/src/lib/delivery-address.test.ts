import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeliveryAddress,
  resolveDeliveryAddress,
} from "./delivery-address.ts";

test("builds structured delivery snapshot into a formatted address", () => {
  assert.equal(
    buildDeliveryAddress({
      street: "Av. Reforma",
      externalNumber: "350",
      neighborhood: "Juárez",
      postalCode: "06600",
    }),
    "Av. Reforma 350, Juárez, C.P. 06600",
  );
});

test("pickup never stores a delivery address", () => {
  const resolved = resolveDeliveryAddress({
    fulfillmentMethod: "pickup",
    snapshot: { street: "Av. Reforma", externalNumber: "1" },
    deliveryAddress: "should not persist",
  });
  assert.equal(resolved.snapshot, null);
  assert.equal(resolved.formatted, null);
});

test("delivery keeps structured snapshot and derives formatted text", () => {
  const resolved = resolveDeliveryAddress({
    fulfillmentMethod: "delivery",
    snapshot: {
      street: "Calle del Pan",
      externalNumber: "12",
      neighborhood: "Roma Norte",
      postalCode: "06700",
    },
  });
  assert.equal(resolved.snapshot?.street, "Calle del Pan");
  assert.equal(resolved.formatted, "Calle del Pan 12, Roma Norte, C.P. 06700");
});
