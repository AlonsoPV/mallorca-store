export const MAX_MENU_BYTES = 8 * 1024 * 1024;

export function parseMenuKey(raw) {
  const key = String(raw || "").trim();
  if (key === "global") return { key, scope: "global", branchId: null };
  const match = /^branch-(\d+)$/.exec(key);
  if (!match) return null;
  const branchId = Number(match[1]);
  if (!Number.isInteger(branchId) || branchId <= 0) return null;
  return { key, scope: "branch", branchId };
}

export function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length > 5
    && buffer.length <= MAX_MENU_BYTES
    && buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

export function safePdfName(name) {
  const base = String(name || "menu.pdf").split(/[/\\]/).pop() || "menu.pdf";
  const cleaned = base.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/g, "").slice(0, 120).trim();
  const withExt = cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "menu"}.pdf`;
  return withExt || "menu.pdf";
}

export function pdfContentDisposition(fileName) {
  const safe = safePdfName(fileName).replace(/"/g, "");
  return `inline; filename="${safe}"`;
}
