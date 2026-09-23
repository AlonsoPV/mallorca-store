import { sendReceiptEmail } from "../../order-email-transport.mjs";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  pool,
  orderEmailJobsTable,
  orderItemsTable,
  branchUserAssignmentsTable,
  usersTable,
} from "@workspace/db";
import {
  receiptSnapshot,
  selectBranchEmail,
} from "../../../../lib/purchase-result.mjs";
import { buildOrderEmail } from "../../order-receipt.mjs";
import { logger } from "./logger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function emailConfigured() {
  const origin = process.env.PUBLIC_APP_URL;
  return !!(
    process.env.RESEND_API_KEY &&
    process.env.ORDER_EMAIL_FROM &&
    origin &&
    /^https?:\/\//.test(origin)
  );
}
async function branchRecipient(connection: Tx | typeof db, branchId: number) {
  const assignments = await connection
    .select({
      email: usersTable.email,
      userId: usersTable.id,
      active: branchUserAssignmentsTable.active,
      isPrimary: branchUserAssignmentsTable.isPrimary,
      role: branchUserAssignmentsTable.role,
    })
    .from(branchUserAssignmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, branchUserAssignmentsTable.userId))
    .where(
      and(
        eq(branchUserAssignmentsTable.branchId, branchId),
        eq(branchUserAssignmentsTable.active, true),
      ),
    );
  return selectBranchEmail(assignments);
}
export async function enqueueOrderEmails(tx: Tx, order: any, branch: any) {
  const items = await tx
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, order.id));
  const receipt = receiptSnapshot({ ...order, items }, branch);
  const recipient = await branchRecipient(tx, order.branchId);
  await tx
    .insert(orderEmailJobsTable)
    .values([
      {
        id: crypto.randomUUID(),
        orderId: order.id,
        audience: "customer",
        recipient: order.customerEmail.trim().toLowerCase(),
        payload: {
          receipt,
          guestAccessToken: order.guestAccessToken,
          branchId: order.branchId,
        },
      },
      {
        id: crypto.randomUUID(),
        orderId: order.id,
        audience: "branch",
        recipient,
        payload: { receipt, branchId: order.branchId },
      },
    ])
    .onConflictDoNothing();
}
export async function orderEmailStatus(orderId: string) {
  const jobs = await db
    .select({
      audience: orderEmailJobsTable.audience,
      status: orderEmailJobsTable.status,
      sentAt: orderEmailJobsTable.sentAt,
      recipient: orderEmailJobsTable.recipient,
    })
    .from(orderEmailJobsTable)
    .where(eq(orderEmailJobsTable.orderId, orderId));
  const status = (audience: string) => {
    const job = jobs.find((j) => j.audience === audience);
    if (!job) return { status: "not_scheduled", sentAt: null };
    return {
      status:
        job.status === "sent"
          ? "sent"
          : job.status === "failed"
            ? "failed"
            : !job.recipient
              ? "missing_recipient"
              : !emailConfigured()
                ? "not_configured"
                : "pending",
      sentAt: job.sentAt,
    };
  };
  return { customer: status("customer"), branch: status("branch") };
}
let running = false;
export async function processOrderEmails() {
  if (running || !emailConfigured()) return;
  running = true;
  try {
    await pool.query(
      "UPDATE order_email_jobs SET status = 'failed', last_error = 'REVIEW_UNCERTAIN_SEND' WHERE status = 'sending' AND attempts >= 6 AND next_attempt_at <= now()",
    );
    // Do not repeat uncertain sends outside the provider's 24-hour idempotency window.
    await pool.query(
      "UPDATE order_email_jobs SET status = 'failed', last_error = 'REVIEW_UNCERTAIN_SEND' WHERE status IN ('pending', 'sending') AND attempts > 0 AND first_attempt_at < now() - interval '23 hours'",
    );
    for (let count = 0; count < 10; count++) {
      const { rows } =
        await pool.query(`UPDATE order_email_jobs SET status = 'sending', next_attempt_at = now() + interval '2 minutes'
        WHERE id = (SELECT id FROM order_email_jobs WHERE status IN ('pending', 'sending') AND next_attempt_at <= now() AND attempts < 6 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
      const job = rows[0];
      if (!job) break;
      let attempted = false;
      try {
        let recipient = job.recipient;
        if (!recipient && job.audience === "branch")
          recipient = await branchRecipient(db, job.payload.branchId);
        if (!recipient) {
          await pool.query(
            "UPDATE order_email_jobs SET status = 'pending', last_error = 'BRANCH_RESPONSIBLE_MISSING', next_attempt_at = now() + interval '10 minutes' WHERE id = $1",
            [job.id],
          );
          continue;
        }
        let payload = job.send_payload;
        if (!payload) {
          const origin = process.env.PUBLIC_APP_URL!.replace(/\/$/, "");
          const orderUrl =
            job.audience === "branch"
              ? `${origin}/admin/pedidos/${encodeURIComponent(job.order_id)}`
              : `${origin}/pedido/${encodeURIComponent(job.order_id)}/${encodeURIComponent(job.payload.guestAccessToken)}`;
          payload = {
            from: process.env.ORDER_EMAIL_FROM,
            to: [recipient],
            ...(await buildOrderEmail(
              job.payload.receipt,
              job.audience,
              orderUrl,
            )),
          };
          await pool.query(
            "UPDATE order_email_jobs SET recipient = $2, send_payload = $3 WHERE id = $1",
            [job.id, recipient, JSON.stringify(payload)],
          );
        }
        await pool.query(
          "UPDATE order_email_jobs SET attempts = attempts + 1, first_attempt_at = coalesce(first_attempt_at, now()) WHERE id = $1",
          [job.id],
        );
        attempted = true;
        const providerId = await sendReceiptEmail(payload, job.id, {
          apiKey: process.env.RESEND_API_KEY,
        });
        await pool.query(
          "UPDATE order_email_jobs SET status = 'sent', sent_at = now(), provider_id = $2, last_error = NULL WHERE id = $1",
          [job.id, providerId],
        );
      } catch (error) {
        const attempts = job.attempts + (attempted ? 1 : 0);
        const code =
          error instanceof Error && error.message.startsWith("EMAIL_PROVIDER_")
            ? error.message
            : "EMAIL_SEND_FAILED";
        await pool.query(
          "UPDATE order_email_jobs SET status = $2, last_error = $3, next_attempt_at = now() + ($4 * interval '1 second') WHERE id = $1",
          [
            job.id,
            attempts >= 6 ? "failed" : "pending",
            code,
            Math.min(1800, 30 * 2 ** attempts),
          ],
        );
        logger.warn(
          { jobId: job.id, orderId: job.order_id, code },
          "Order receipt email pending retry",
        );
      }
    }
  } catch (error) {
    logger.error({ error }, "Order email worker failed");
  } finally {
    running = false;
  }
}
export function startOrderEmailWorker() {
  void processOrderEmails();
  const timer = setInterval(() => void processOrderEmails(), 30000);
  timer.unref();
  return timer;
}
