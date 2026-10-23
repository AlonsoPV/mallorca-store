import { eq } from "drizzle-orm";
import { branchesTable, db, pool, storeMenusTable } from "@workspace/db";
import {
  isPdfBuffer,
  parseMenuKey,
  pdfContentDisposition,
  safePdfName,
} from "../../store-menu.mjs";
import { pgCode } from "./pg-code";

const STORE_MENUS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS store_menus (
  menu_key text PRIMARY KEY,
  scope text NOT NULL,
  branch_id integer REFERENCES branches(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/pdf',
  file_data bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_menus_scope_check CHECK (
    (scope = 'global' AND branch_id IS NULL AND menu_key = 'global')
    OR (scope = 'branch' AND branch_id IS NOT NULL AND menu_key = 'branch-' || branch_id::text)
  )
);
`;

function isMissingStoreMenusTable(error: unknown) {
  return pgCode(error) === "42P01" || (error instanceof Error && /store_menus/i.test(error.message));
}

async function ensureStoreMenusTable() {
  await pool.query(STORE_MENUS_TABLE_SQL);
}

async function queryStoreMenus(): Promise<StoreMenuMeta[]> {
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
  try {
    return await queryStoreMenus();
  } catch (error) {
    if (!isMissingStoreMenusTable(error)) throw error;
    await ensureStoreMenusTable();
    return queryStoreMenus();
  }
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
