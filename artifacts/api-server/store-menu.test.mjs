import test from "node:test";
import assert from "node:assert/strict";
import { isPdfBuffer, parseMenuKey, safePdfName } from "./store-menu.mjs";

test("menu keys are global or a branch id", () => {
  assert.deepEqual(parseMenuKey("global"), { key: "global", scope: "global", branchId: null });
  assert.deepEqual(parseMenuKey("branch-2"), { key: "branch-2", scope: "branch", branchId: 2 });
  assert.equal(parseMenuKey("branch-0"), null);
  assert.equal(parseMenuKey("../global"), null);
});

test("only a real PDF within the size limit is accepted", () => {
  assert.equal(isPdfBuffer(Buffer.from("%PDF-1.7\n")), true);
  assert.equal(isPdfBuffer(Buffer.from("not a pdf")), false);
});

test("pdf names stay as a single file name", () => {
  assert.equal(safePdfName("C:\\temp\\carta.pdf"), "carta.pdf");
  assert.equal(safePdfName("menu"), "menu.pdf");
});
