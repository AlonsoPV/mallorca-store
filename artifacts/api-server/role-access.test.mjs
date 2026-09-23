import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultPolicy, validatePolicy, canAccess, apiModules, pageModule, modules } from "../../lib/access-policy.mjs";

const directory = mkdtempSync(join(tmpdir(), "mallorca-role-test-"));
process.env.LOCAL_ROLE_POLICY_FILE = join(directory, "policy.json");
const { handleRoleAccess } = await import("./local-role-access.mjs");
const admin = { id: "test-admin", role: "admin" };
async function request(path, method, user, body) {
  let response;
  const handled = await handleRoleAccess({ method }, {}, path, user, (_res, status, data) => { response = { status, data }; }, async () => body);
  return { handled, ...response };
}
test.after(() => rmSync(directory, { recursive: true, force: true }));

test("policy validates every role and module, protects admin, and denies unknown roles", () => {
  const policy = defaultPolicy();
  assert.equal(validatePolicy(policy), true);
  policy.admin.users = false;
  assert.equal(validatePolicy(policy), false);
  assert.equal(validatePolicy({ staff: {} }), false);
  assert.equal(canAccess(defaultPolicy(), "customer", "products"), false);
  assert.equal(canAccess(defaultPolicy(), "staff", "roles"), false);
  assert.equal(canAccess(defaultPolicy(), "admin", "roles"), true);
});
test("page and API permissions cover imports, assignments and payment operations", () => {
  assert.equal(pageModule("/admin/productos/3"), "products");
  assert.equal(pageModule("/admin/agenda"), "orders");
  assert.deepEqual(apiModules("/api/admin/products/import", "POST"), ["products"]);
  assert.deepEqual(apiModules("/api/admin/branches/1/assignments", "PUT"), ["users"]);
  assert.deepEqual(apiModules("/api/admin/payment-providers/mp", "PUT"), ["payments"]);
  assert.deepEqual(apiModules("/api/admin/new-unknown-module", "GET"), []);
});
test("persisted edits enforce denials, prevent escalation and reject stale saves", async () => {
  const initial = await request("/api/admin/access/roles", "GET", admin);
  assert.equal(initial.status, 200);
  const policy = defaultPolicy();
  for (const module of modules) policy.staff[module.id] = false;
  assert.equal((await request("/api/admin/access/roles", "PUT", { id: "staff", role: "staff" }, { policy, version: 0 })).status, 403);
  assert.equal((await request("/api/admin/access/roles", "PUT", admin, { policy: {}, version: 0 })).status, 400);
  const saved = await request("/api/admin/access/roles", "PUT", admin, { policy, version: 0 });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.version, 1);
  assert.equal(JSON.parse(readFileSync(process.env.LOCAL_ROLE_POLICY_FILE)).audit.length, 1);
  assert.equal((await request("/api/admin/access/roles", "PUT", admin, { policy, version: 0 })).status, 409);
  const staff = { id: "staff", role: "staff" };
  assert.equal((await request("/api/admin/products", "GET", staff)).status, 403);
  assert.equal((await request("/api/admin/inventory/update", "POST", staff)).status, 403);
  assert.equal((await request("/api/admin/access/me", "GET", staff)).data.modules.products, false);
  assert.equal((await request("/api/admin/products", "GET", admin)).handled, false);
  assert.equal((await request("/api/admin/access/roles", "GET", admin)).data.policy.staff.products, false);
});
