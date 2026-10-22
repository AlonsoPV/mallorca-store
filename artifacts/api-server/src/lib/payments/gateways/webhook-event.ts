import type { GatewayCode, GatewayWebhookRequest } from "./types.ts";

function header(request: GatewayWebhookRequest, name: string): string {
  return request.headers[name]?.trim() ?? "";
}

function dataId(request: GatewayWebhookRequest): string {
  const queryId = request.query["data.id"] ?? request.query.id ?? "";
  const body = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : null;
  const nested = body?.data && typeof body.data === "object" ? (body.data as Record<string, unknown>).id : null;
  const fromBody = body?.id;
  return String(queryId || nested || fromBody || "").trim();
}

export function webhookEventKey(
  provider: GatewayCode,
  request: GatewayWebhookRequest,
): string | null {
  if (provider === "PAYPAL") {
    const transmissionId = header(request, "paypal-transmission-id");
    return transmissionId ? `paypal:${transmissionId}` : null;
  }
  const requestId = header(request, "x-request-id");
  const id = dataId(request);
  if (!requestId && !id) return null;
  return `mp:${requestId}:${id}`;
}

export function webhookEventInsertResult(insertedCount: number): "applied" | "duplicate_event" {
  return insertedCount === 0 ? "duplicate_event" : "applied";
}
