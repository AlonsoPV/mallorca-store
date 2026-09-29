import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  new URL("../components/layout/store-layout.tsx", import.meta.url),
  "utf8",
);
const adminSource = readFileSync(
  new URL("../pages/admin/products-list.tsx", import.meta.url),
  "utf8",
);
const productDetailSource = readFileSync(
  new URL("../pages/product-detail.tsx", import.meta.url),
  "utf8",
);
const generatedApiSource = readFileSync(
  new URL("../../node_modules/@workspace/api-client-react/src/generated/api.ts", import.meta.url),
  "utf8",
);

test("catalog updates target the generated cart key and matching cart product IDs", () => {
  assert.match(
    generatedApiSource,
    /export const getGetCartQueryKey[\s\S]{0,140}return \[\s*`\/api\/cart\/\$\{id\}`\s*\]/,
  );
  assert.match(layoutSource, /queryKey:\s*getGetCartQueryKey\(activeCartId\),\s*exact:\s*true/);
  assert.match(
    layoutSource,
    /items\?\.some\(\(item\) => typeof item\.productId === "number" && productIds\.has\(item\.productId\)\)/,
  );
});

test("storefront and admin SSE listeners resync after reconnect and tab return", () => {
  for (const source of [layoutSource, adminSource]) {
    assert.match(source, /addEventListener\("error", onError\)/);
    assert.match(source, /addEventListener\("open", onOpen\)/);
    assert.match(source, /visibilityState === "hidden"[\s\S]{0,500}events\?\.close\(\)/);
    assert.match(source, /visibilityState === "visible"[\s\S]{0,180}flushChanges\(true\)/);
  }
});

test("inventory events refresh collection membership even when the product is absent", () => {
  for (const source of [layoutSource, adminSource]) {
    assert.match(
      source,
      /changes\.some\(\(change\) => change\.reason === "product" \|\| change\.reason === "inventory"\)/,
    );
  }
  assert.match(layoutSource, /if \(isProductCollection && refreshProductLists\) return true/);
});

test("public product collections have a visible-only 60-second fallback; detail freshness remains", () => {
  assert.match(layoutSource, /PUBLIC_CATALOG_FALLBACK_INTERVAL_MS = 60_000/);
  assert.match(layoutSource, /if \(document\.visibilityState !== "visible"\) return/);
  assert.match(layoutSource, /type: "active",\s*predicate: \(query\) => query\.queryKey\[0\] === "\/api\/products"/);
  assert.match(layoutSource, /if \(catalogFallbackTimer\) clearInterval\(catalogFallbackTimer\)/);
  assert.match(productDetailSource, /PRODUCT_PRICE_REFRESH_INTERVAL_MS = 30_000/);
});