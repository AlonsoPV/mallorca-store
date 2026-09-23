import type { Request, Response, NextFunction } from "express";
import { apiModules, canAccess, defaultPolicy, validatePolicy } from "../../../../lib/access-policy.mjs";
import { readRolePolicy, saveRolePolicy } from "../lib/role-access";

export async function enforceRoleAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/admin/")) return next();
  const role = req.localUser?.role;
  if (!role) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.path === "/admin/access/me" && req.method === "GET") {
    const { policy } = await readRolePolicy();
    res.json({ modules: policy[role] ?? {}, manageRoles: role === "admin" }); return;
  }
  if (req.path === "/admin/access/roles") {
    if (role !== "admin") { res.status(403).json({ error: "Solo Admin puede configurar accesos." }); return; }
    if (req.method === "GET") { res.json(await readRolePolicy()); return; }
    if (req.method === "PUT") {
      const { policy, version } = req.body ?? {};
      if (!validatePolicy(policy) || !Number.isInteger(version) || version < 0) {
        res.status(400).json({ error: "Configuración inválida. Admin debe conservar todos sus accesos." }); return;
      }
      if (!await saveRolePolicy(policy, version, req.localUser!.id)) {
        res.status(409).json({ error: "Otra persona actualizó los accesos. Recarga la configuración antes de guardar." }); return;
      }
      res.json(await readRolePolicy()); return;
    }
    res.status(405).json({ error: "Método no permitido" }); return;
  }
  const policy = role === "admin" ? defaultPolicy() : (await readRolePolicy()).policy;
  if (!apiModules(req.path, req.method).some(module => canAccess(policy, role, module))) {
    res.status(403).json({ error: "Tu rol no tiene acceso a este módulo." }); return;
  }
  next();
}
