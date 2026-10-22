import type { GatewayHttp, GatewayHttpResponse } from "./types.ts";
import { PaymentGatewayError } from "./types.ts";

export const defaultGatewayHttp: GatewayHttp = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(15_000),
  });
  return {
    status: response.status,
    body: await response.text(),
  };
};

export function readJson(body: string): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function providerErrorSummary(payload: unknown): string {
  const record = asRecord(payload);
  if (!record) return "";
  const details = Array.isArray(record.details) ? record.details : [];
  const issues = details
    .map((row) => asString(asRecord(row)?.issue))
    .filter((issue): issue is string => Boolean(issue))
    .slice(0, 4);
  const debugId = asString(record.debug_id);
  const parts = [...issues, debugId ? `debug_id=${debugId}` : null].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

export function assertProviderOk(response: GatewayHttpResponse, action: string): unknown {
  const payload = readJson(response.body);
  if (response.status < 200 || response.status >= 300) {
    const status = response.status === 401 || response.status === 403 ? response.status : 502;
    throw new PaymentGatewayError(
      "PAYMENT_PROVIDER_REJECTED",
      `Payment provider rejected ${action}${providerErrorSummary(payload)}`,
      status,
    );
  }
  if (payload == null || typeof payload !== "object") {
    throw new PaymentGatewayError(
      "PAYMENT_PROVIDER_REJECTED",
      `Payment provider returned an invalid ${action} response`,
      502,
    );
  }
  return payload;
}

export function assertRedirectUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PaymentGatewayError(
      "PAYMENT_PROVIDER_REJECTED",
      "Payment provider returned an invalid redirect",
      502,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new PaymentGatewayError(
      "PAYMENT_PROVIDER_REJECTED",
      "Payment provider returned an invalid redirect",
      502,
    );
  }
  return url;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function toMoneyNumber(amount: number): number {
  return toCents(amount) / 100;
}

export function toMoneyString(amount: number): string {
  return toMoneyNumber(amount).toFixed(2);
}

export function amountsMatch(expected: number, actual: number): boolean {
  return toCents(expected) === toCents(actual);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function asId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return asString(value);
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
