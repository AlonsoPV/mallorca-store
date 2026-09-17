import assert from "node:assert/strict";
import test from "node:test";
import {
  hydrateAdminBranchConfiguration,
  serializeAdminBranchAvailability,
} from "./admin-product-serialize.ts";

test("admin availability exposes physical stock and nullable override, not sellable/resolved as write fields", () => {
  const availability = serializeAdminBranchAvailability({
    branchId: 1,
    branchSlug: "reforma",
    branchName: "Reforma",
    available: true,
    inventory: 10,
    reserved: 2,
    minStock: 3,
    criticalStock: 1,
    autoAlertEnabled: true,
    alertState: "NORMAL",
    priceOverride: null,
    salePriceOverride: null,
    basePrice: 350,
    baseSalePrice: null,
    preparationTimeMinutes: 60,
    pickupAvailable: true,
    deliveryAvailable: true,
  });

  assert.equal(availability.inventory, 10);
  assert.equal(availability.physicalStock, 10);
  assert.equal(availability.reservedStock, 2);
  assert.equal(availability.availableStock, 8);
  assert.equal(availability.price, 350);
  assert.equal(availability.priceOverride, null);
});

test("form hydration must not treat resolved price as a price override", () => {
  const config = hydrateAdminBranchConfiguration({
    branchId: 1,
    available: true,
    inventory: 10,
    price: 350,
    priceOverride: null,
  });
  assert.equal(config.priceOverride, null);
  assert.equal(config.inventory, 10);
});
