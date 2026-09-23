import { pool } from "@workspace/db";
import { defaultPolicy, validatePolicy, type Policy } from "../../../../lib/access-policy.mjs";

export async function readRolePolicy() {
  const result = await pool.query("SELECT policy, version, updated_at, updated_by FROM role_access_policy WHERE id = 1");
  const row = result.rows[0];
  if (row && !validatePolicy(row.policy)) throw new Error("Invalid stored role policy");
  return { policy: row?.policy as Policy ?? defaultPolicy(), version: row?.version ?? 0, updatedAt: row?.updated_at ?? null, updatedBy: row?.updated_by ?? null };
}
export async function saveRolePolicy(policy: Policy, version: number, actor: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO role_access_policy(id, policy) VALUES (1, $1) ON CONFLICT DO NOTHING", [JSON.stringify(defaultPolicy())]);
    const { rows } = await client.query("SELECT policy, version FROM role_access_policy WHERE id = 1 FOR UPDATE");
    if (rows[0].version !== version) { await client.query("ROLLBACK"); return false; }
    await client.query("UPDATE role_access_policy SET policy = $1, version = version + 1, updated_by = $2, updated_at = now() WHERE id = 1", [JSON.stringify(policy), actor]);
    await client.query("INSERT INTO role_access_audit(actor_id, before_policy, after_policy) VALUES ($1, $2, $3)", [actor, JSON.stringify(rows[0].policy), JSON.stringify(policy)]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
