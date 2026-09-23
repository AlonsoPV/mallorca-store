import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { defaultPolicy, validatePolicy, apiModules, canAccess } from "../../lib/access-policy.mjs";

const file = process.env.LOCAL_ROLE_POLICY_FILE || fileURLToPath(new URL("../../.local/role-access.json", import.meta.url));
function load() {
  if (!existsSync(file)) return { policy: defaultPolicy(), version: 0, updatedAt: null, updatedBy: null, audit: [] };
  const value = JSON.parse(readFileSync(file, "utf8"));
  if (!validatePolicy(value.policy)) throw new Error("Invalid stored role policy");
  return value;
}
function publicValue(value) { const { audit, ...result } = value; return result; }
export async function handleRoleAccess(req, res, path, user, send, readJson) {
  try {
    const value = load();
    if (path === "/api/admin/access/me" && req.method === "GET") {
      send(res, 200, { modules: value.policy[user.role] ?? {}, manageRoles: user.role === "admin" }); return true;
    }
    if (path === "/api/admin/access/roles") {
      if (user.role !== "admin") { send(res, 403, { error: "Solo Admin puede configurar accesos." }); return true; }
      if (req.method === "GET") { send(res, 200, publicValue(value)); return true; }
      if (req.method !== "PUT") { send(res, 405, { error: "Método no permitido" }); return true; }
      const body = await readJson(req);
      if (!validatePolicy(body.policy) || !Number.isInteger(body.version) || body.version < 0) { send(res, 400, { error: "Configuración inválida. Admin debe conservar todos sus accesos." }); return true; }
      const latest = load();
      if (body.version !== latest.version) { send(res, 409, { error: "Otra persona actualizó los accesos. Descarta los cambios y vuelve a intentarlo." }); return true; }
      const next = { policy: body.policy, version: latest.version + 1, updatedAt: new Date().toISOString(), updatedBy: user.id, audit: [...latest.audit, { actor: user.id, at: new Date().toISOString(), before: latest.policy, after: body.policy }] };
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file + ".tmp", JSON.stringify(next, null, 2));
      renameSync(file + ".tmp", file);
      send(res, 200, publicValue(next)); return true;
    }
    if (!apiModules(path, req.method).some(module => canAccess(value.policy, user.role, module))) { send(res, 403, { error: "Tu rol no tiene acceso a este módulo." }); return true; }
    return false;
  } catch {
    send(res, 500, { error: "No se pudo leer o guardar la configuración de accesos." }); return true;
  }
}
