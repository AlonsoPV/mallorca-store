import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { parseProductImportCsv } from "./src/lib/inventory.ts";
const require = createRequire(
  new URL("../mallorca-ecommerce/package.json", import.meta.url),
);
const XLSX = require("xlsx");

test("HTTP export → Excel → preview → import → export preserves SKU and branch stock", async () => {
  const child = spawn(process.execPath, ["local-mock-server.mjs"], {
    cwd: import.meta.dirname,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Server startup timeout")),
        10000,
      );
      child.stdout.on("data", (chunk) => {
        const match = chunk.toString().match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Server exited ${code}`));
      });
      child.once("error", reject);
    });
    const post = async (route, data) => {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/admin/products/${route}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer local-dev",
          },
          body: JSON.stringify(data),
        },
      );
      assert.equal(response.status, 200);
      return response.json();
    };
    const exported = await post("export", { reimportable: true });
    const parsed = parseProductImportCsv(exported.content);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.rows.length, 6);
    assert.equal(new Set(parsed.rows.map((r) => r.sku)).size, 3);
    const book = XLSX.read(exported.content, { type: "string", raw: true });
    const sheet = book.Sheets[book.SheetNames[0]];
    const table = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const stockColumn = table[0].indexOf("inventory");
    const alertColumn = table[0].indexOf("autoAlertEnabled");
    const priceColumn = table[0].indexOf("price");
    table[1][stockColumn] = 17;
    table[1][alertColumn] = false;
    table[1][priceColumn] = 725;
    table[2][priceColumn] = 725;
    book.Sheets[book.SheetNames[0]] = XLSX.utils.aoa_to_sheet(table);
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
    const reopened = XLSX.read(buffer, { type: "buffer", raw: true });
    const csv = XLSX.utils.sheet_to_csv(
      reopened.Sheets[reopened.SheetNames[0]],
    );
    const preview = await post("import/preview", { csv, updateExisting: true });
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.rows.length, 6);
    const result = await post("import", { csv, updateExisting: true });
    assert.equal(result.created, 0);
    assert.equal(result.updated, 3);
    const after = parseProductImportCsv((await post("export", {})).content);
    assert.equal(after.rows.length, 6);
    assert.equal(after.rows[0].inventory, 17);
    assert.equal(after.rows[1].inventory, parsed.rows[1].inventory);
    assert.equal(after.rows[0].autoAlertEnabled, false);
    assert.equal(after.rows[0].price, 725);
    const bad = await post("import/preview", {
      csv: "sku,branchCode,inventory\nPSK-001,LOM,-1",
    });
    assert.ok(bad.errors.length);
    const filtered = parseProductImportCsv(
      (await post("export", { ids: [1] })).content,
    );
    assert.equal(filtered.rows.length, 2);
  } finally {
    child.kill();
    await new Promise((resolve) =>
      child.exitCode !== null ? resolve() : child.once("exit", resolve),
    );
  }
});
