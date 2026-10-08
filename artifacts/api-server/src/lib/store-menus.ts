import { eq } from "drizzle-orm";
import { branchesTable, db, storeMenusTable } from "@workspace/db";
import {
  isPdfBuffer,
  parseMenuKey,
  pdfContentDisposition,
  safePdfName,
} from "../../store-menu.mjs";

export type StoreMenuMeta = {
  key: string;
  scope: "global" | "branch";
  branchId: number | null;
  fileName: string;
  updatedAt: string;
};

function metaFrom(row: {
  menuKey: string;
  scope: string;
  branchId: number | null;
  fileName: string;
  updatedAt: Date;
}): StoreMenuMeta {
  return {
    key: row.menuKey,
    scope: row.scope === "branch" ? "branch" : "global",
    branchId: row.branchId,
    fileName: row.fileName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listStoreMenus(): Promise<StoreMenuMeta[]> {
  const rows = await db
    .select({
      menuKey: storeMenusTable.menuKey,
      scope: storeMenusTable.scope,
      branchId: storeMenusTable.branchId,
      fileName: storeMenusTable.fileName,
      updatedAt: storeMenusTable.updatedAt,
    })
    .from(storeMenusTable);
  return rows.map(metaFrom);
}

export async function readStoreMenuFile(rawKey: string) {
  const parsed = parseMenuKey(rawKey);
  if (!parsed) return null;
  const [row] = await db
    .select({
      fileName: storeMenusTable.fileName,
      fileData: storeMenusTable.fileData,
    })
    .from(storeMenusTable)
    .where(eq(storeMenusTable.menuKey, parsed.key));
  if (!row?.fileData) return null;
  return {
    fileName: row.fileName,
    data: row.fileData,
    disposition: pdfContentDisposition(row.fileName),
  };
}

export async function saveStoreMenu(rawKey: string, fileName: string, data: Buffer) {
  const parsed = parseMenuKey(rawKey);
  if (!parsed) return { ok: false as const, status: 404, error: "Menú no válido." };
  if (!isPdfBuffer(data)) {
    return { ok: false as const, status: 400, error: "Sube un archivo PDF de hasta 8 MB." };
  }
  if (parsed.branchId != null) {
    const [branch] = await db
      .select({ id: branchesTable.id })
      .from(branchesTable)
      .where(eq(branchesTable.id, parsed.branchId));
    if (!branch) return { ok: false as const, status: 404, error: "Sucursal no encontrada." };
  }
  const safeName = safePdfName(fileName);
  const now = new Date();
  await db
    .insert(storeMenusTable)
    .values({
      menuKey: parsed.key,
      scope: parsed.scope,
      branchId: parsed.branchId,
      fileName: safeName,
      contentType: "application/pdf",
      fileData: data,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: storeMenusTable.menuKey,
      set: {
        scope: parsed.scope,
        branchId: parsed.branchId,
        fileName: safeName,
        contentType: "application/pdf",
        fileData: data,
        updatedAt: now,
      },
    });
  return { ok: true as const, menus: await listStoreMenus() };
}

export async function deleteStoreMenu(rawKey: string) {
  const parsed = parseMenuKey(rawKey);
  if (!parsed) return { ok: false as const, status: 404, error: "Menú no válido." };
  await db.delete(storeMenusTable).where(eq(storeMenusTable.menuKey, parsed.key));
  return { ok: true as const, menus: await listStoreMenus() };
}
