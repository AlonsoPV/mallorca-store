import { extractEmailAddress } from "./order-email-transport.mjs";

export const MAILBOX_ROLES = ["system", "customer", "branch", "contact"];
export const DEFAULT_SMTP_HOST = "smtp.hostinger.com";
export const DEFAULT_SMTP_PORT = 465;
/** Correo de desarrollo / sistema de la tienda (Hostinger). */
export const DEV_SYSTEM_EMAIL = "ecomm@pasteleria-mallorca.mx";
export const DEV_SYSTEM_DISPLAY_NAME = "Mallorca Ecommerce";

export function isMailboxRole(value) {
  return MAILBOX_ROLES.includes(String(value || ""));
}

export function formatMailboxFrom(address, displayName) {
  const addr = String(address || "").trim();
  const name = String(displayName || "").trim();
  if (!addr) return "";
  return name ? `${name} <${addr}>` : addr;
}

export function parseFromDisplayName(value) {
  const raw = String(value || "").trim();
  const angled = /^(.*?)\s*<[^>]+>\s*$/.exec(raw);
  return angled ? angled[1].trim().replace(/^["']|["']$/g, "") : "";
}

export function mailboxConfigured(role, address, passwordConfigured) {
  if (!extractEmailAddress(address)) return false;
  if (role === "contact") return true;
  return Boolean(passwordConfigured);
}

export function publicMailbox(row = {}) {
  const role = isMailboxRole(row.role) ? row.role : "customer";
  const address = String(row.address || "").trim();
  const passwordConfigured = Boolean(row.passwordEncrypted || row.passwordConfigured);
  return {
    role,
    address,
    displayName: String(row.displayName || "").trim(),
    smtpUser: String(row.smtpUser || address).trim(),
    smtpHost: String(row.smtpHost || DEFAULT_SMTP_HOST).trim() || DEFAULT_SMTP_HOST,
    smtpPort: Number(row.smtpPort) > 0 ? Number(row.smtpPort) : DEFAULT_SMTP_PORT,
    smtpSecure: row.smtpSecure !== false,
    passwordConfigured,
    configured: mailboxConfigured(role, address, passwordConfigured),
  };
}

export function listPublicMailboxes(rows = []) {
  const byRole = Object.fromEntries(
    (Array.isArray(rows) ? rows : [])
      .filter((row) => isMailboxRole(row?.role))
      .map((row) => [row.role, row]),
  );
  const mailboxes = MAILBOX_ROLES.map((role) => publicMailbox(byRole[role] || { role }));
  return { ready: mailboxesReady(mailboxes), mailboxes };
}

export function mailboxesReady(mailboxes = []) {
  const byRole = Object.fromEntries(mailboxes.map((row) => [row.role, row]));
  const customer = byRole.customer;
  const branch = byRole.branch;
  const contact = byRole.contact;
  if (!customer?.configured || !branch?.configured || !contact?.configured) return false;
  return extractEmailAddress(customer.address) !== extractEmailAddress(branch.address);
}

export function catalogMailboxes(storedRows = [], envSeeds = []) {
  const stored = listPublicMailboxes(storedRows);
  const fromEnv = listPublicMailboxes(envSeeds);
  const byEnv = Object.fromEntries(fromEnv.mailboxes.map((row) => [row.role, row]));
  const mailboxes = stored.mailboxes.map((row) => {
    if (row.address || row.passwordConfigured) return row;
    return byEnv[row.role] || row;
  });
  const appReady = mailboxesReady(stored.mailboxes);
  const ready = mailboxesReady(mailboxes);
  return {
    ready,
    source: appReady ? "app" : ready ? "env" : "none",
    mailboxes,
  };
}

export function parseMailboxUpdate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid mailbox" };
  }
  const address = String(body.address || "").trim();
  if (!extractEmailAddress(address)) return { ok: false, error: "Invalid address" };
  const smtpPortRaw = body.smtpPort == null || body.smtpPort === "" ? DEFAULT_SMTP_PORT : Number(body.smtpPort);
  if (!Number.isFinite(smtpPortRaw) || smtpPortRaw < 1 || smtpPortRaw > 65535) {
    return { ok: false, error: "Invalid SMTP port" };
  }
  const smtpHost = String(body.smtpHost || DEFAULT_SMTP_HOST).trim() || DEFAULT_SMTP_HOST;
  const smtpUser = String(body.smtpUser || address).trim() || address;
  const displayName = body.displayName == null ? "" : String(body.displayName).trim();
  const smtpSecure =
    body.smtpSecure == null ? smtpPortRaw === DEFAULT_SMTP_PORT : Boolean(body.smtpSecure);
  const password =
    typeof body.password === "string" && body.password.trim() ? body.password.trim() : null;
  return {
    ok: true,
    data: {
      address,
      displayName,
      smtpUser,
      password,
      smtpHost,
      smtpPort: smtpPortRaw,
      smtpSecure,
    },
  };
}
