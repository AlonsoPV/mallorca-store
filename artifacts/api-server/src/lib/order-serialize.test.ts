import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeStorefrontOrderDetails } from "./order-serialize.ts";

describe("serializeStorefrontOrderDetails", () => {
  it("omits a null delivery snapshot so guest order Zod does not 500", () => {
    const payload = serializeStorefrontOrderDetails(
      {
        id: "ord_1",
        orderNumber: "M-TEST",
        guestAccessToken: "tok",
        orderSource: "STOREFRONT",
        status: "pending_payment",
        paymentStatus: "unpaid",
        paymentMethod: "PAYPAL",
        fulfillmentMethod: "pickup",
        scheduledStart: new Date("2026-10-23T18:00:00.000Z"),
        scheduledEnd: new Date("2026-10-23T18:30:00.000Z"),
        customerEmail: "a@b.c",
        customerName: "Ana",
        customerPhone: "555",
        deliveryAddress: null,
        deliveryAddressSnapshot: null,
        subtotal: "250" as unknown as number,
        deliveryFee: 0,
        total: "250" as unknown as number,
        amountPaid: 0,
        branchId: 1,
      },
      [
        {
          id: 1,
          productId: 6,
          variantId: null,
          sku: "PAN",
          name: "Panettone",
          variantLabel: undefined as unknown as null,
          quantity: 1,
          listUnitPrice: "355" as unknown as number,
          unitPrice: "250" as unknown as number,
          lineTotal: "250" as unknown as number,
          promotionId: null,
          manualLineItem: false,
        },
      ],
      "Lomas",
    );
    assert.equal(payload.deliveryAddressSnapshot, undefined);
    assert.equal(payload.total, 250);
    assert.equal(payload.items[0].unitPrice, 250);
    assert.equal(payload.items[0].variantLabel, null);
  });
});
