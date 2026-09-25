import assert from "node:assert/strict";
import test from "node:test";
import { formatBranchPostalLines } from "./availability-copy.ts";

test("legacy address stays visible when street was never split out", () => {
  const lines = formatBranchPostalLines({
    address: "Av. Paseo de la Reforma 365",
    street: null,
    neighborhood: "Cuauhtémoc",
    borough: "Cuauhtémoc",
    city: "Ciudad de México",
    state: "CDMX",
    postalCode: "06500",
  });
  assert.equal(lines[0], "Av. Paseo de la Reforma 365");
  assert.deepEqual(lines.slice(1), ["Cuauhtémoc", "Ciudad de México, CDMX 06500"]);
});

test("structured street stays the first line", () => {
  const lines = formatBranchPostalLines({
    address: "ignored when street exists",
    street: "Av. Ejemplo",
    externalNumber: "200",
    neighborhood: "Juárez",
    city: "Ciudad de México",
    state: "CDMX",
    postalCode: "11000",
  });
  assert.equal(lines[0], "Av. Ejemplo 200");
  assert.equal(lines[1], "Juárez");
});
