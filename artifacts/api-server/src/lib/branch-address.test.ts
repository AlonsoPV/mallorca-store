import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFormattedAddress,
  resolveBranchFormattedAddress,
} from "./branch-address.ts";

test("buildFormattedAddress joins structured parts", () => {
  const formatted = buildFormattedAddress({
    street: "Av. Paseo de la Reforma",
    externalNumber: "365",
    neighborhood: "Cuauhtémoc",
    borough: "Cuauhtémoc",
    city: "Ciudad de México",
    state: "CDMX",
    postalCode: "06500",
    country: "México",
  });
  assert.equal(
    formatted,
    "Av. Paseo de la Reforma 365, Cuauhtémoc, Cuauhtémoc, Ciudad de México, CDMX, 06500, México",
  );
});

test("resolveBranchFormattedAddress prefers structured fields over stale address", () => {
  const formatted = resolveBranchFormattedAddress(
    {
      street: "Av. Paseo de la Reforma",
      externalNumber: "365",
      neighborhood: "Cuauhtémoc",
      postalCode: "06500",
      city: "Ciudad de México",
      state: "CDMX",
      country: "México",
      // Client still sending previous list value
      address: "Av. Ejemplo 100",
    },
    {
      street: null,
      address: "Av. Ejemplo 100",
      neighborhood: "Lomas de Chapultepec",
    },
  );
  assert.match(formatted, /Av\. Paseo de la Reforma 365/);
  assert.match(formatted, /06500/);
  assert.doesNotMatch(formatted, /Av\. Ejemplo 100/);
});

test("resolveBranchFormattedAddress falls back to flat address when no structured parts", () => {
  const formatted = resolveBranchFormattedAddress(
    { address: "Solo dirección plana" },
    { street: null, externalNumber: null, neighborhood: null },
  );
  assert.equal(formatted, "Solo dirección plana");
});

test("resolveBranchFormattedAddress merges patch with previous structured values", () => {
  const formatted = resolveBranchFormattedAddress(
    { externalNumber: "365" },
    {
      street: "Av. Paseo de la Reforma",
      externalNumber: "100",
      neighborhood: "Cuauhtémoc",
      postalCode: "06500",
      city: "Ciudad de México",
      state: "CDMX",
      address: "Av. Paseo de la Reforma 100, Cuauhtémoc, 06500",
    },
  );
  assert.match(formatted, /Av\. Paseo de la Reforma 365/);
  assert.match(formatted, /Cuauhtémoc/);
});
