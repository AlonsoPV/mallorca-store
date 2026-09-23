import { db, orderAuditLogsTable } from "@workspace/db";

export type OrderAuditAction =
  | "CREATED_MANUAL"
  | "CREATED_STOREFRONT"
  | "MANUAL_DISCOUNT"
  | "AVAILABILITY_OVERRIDE"
  | "PAYMENT_RECORDED"
  | "PAYMENT_LINK_CREATED"
  | "CANCELLED"
  | "LINES_CHANGED"
  | "SCHEDULE_CHANGED"
  | "DUPLICATED"
  | "STATUS_CHANGED"
  | "NOTE_UPDATED";

export async function writeOrderAudit(params: {
  orderId: string;
  actorUserId?: string | null;
  action: OrderAuditAction;
  reason?: string | null;
  payload?: unknown;
  tx?: any;
}): Promise<void> {
  const executor = params.tx ?? db;
  await executor.insert(orderAuditLogsTable).values({
    orderId: params.orderId,
    actorUserId: params.actorUserId ?? null,
    action: params.action,
    reason: params.reason ?? null,
    payload: params.payload == null ? null : JSON.stringify(params.payload),
  });
}
