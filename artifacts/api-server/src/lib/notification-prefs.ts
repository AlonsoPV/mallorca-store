import type { BranchNotificationPreferences } from "@workspace/db";
import type { AutomaticAlertType } from "./inventory-status.ts";

export const DEFAULT_NOTIFICATION_PREFERENCES: Required<
  Pick<
    BranchNotificationPreferences,
    | "email"
    | "inApp"
    | "whatsapp"
    | "lowStock"
    | "criticalStock"
    | "outOfStock"
    | "newOrder"
    | "cancelledOrder"
    | "incident"
  >
> = {
  email: false,
  inApp: true,
  whatsapp: false,
  lowStock: true,
  criticalStock: true,
  outOfStock: true,
  newOrder: true,
  cancelledOrder: true,
  incident: true,
};

export function normalizeNotificationPreferences(
  prefs?: BranchNotificationPreferences | Record<string, boolean> | null,
): typeof DEFAULT_NOTIFICATION_PREFERENCES {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(prefs ?? {}),
  };
}

/** Whether automatic alerts of this type should be created for the branch. */
export function isAlertTypeEnabled(
  prefs: BranchNotificationPreferences | null | undefined,
  alertType: AutomaticAlertType | string,
): boolean {
  const p = normalizeNotificationPreferences(prefs);
  if (alertType === "LOW_STOCK") return p.lowStock;
  if (alertType === "CRITICAL_STOCK") return p.criticalStock;
  if (alertType === "OUT_OF_STOCK") return p.outOfStock;
  return true;
}

/**
 * Resolve delivery channels from branch prefs.
 * WhatsApp is queued as `whatsapp_pending` (no outbound send yet).
 */
export function resolveAlertChannels(
  prefs: BranchNotificationPreferences | null | undefined,
): { channels: string[]; notifyInApp: boolean; deliveryState: string } {
  const p = normalizeNotificationPreferences(prefs);
  const channels = [
    p.inApp ? "in_app" : null,
    p.email ? "email_pending" : null,
    p.whatsapp ? "whatsapp_pending" : null,
  ].filter(Boolean) as string[];
  const deliveryState = channels.some((c) => c.endsWith("_pending"))
    ? "pending"
    : channels.includes("in_app")
      ? "delivered"
      : "not_sent";
  return { channels, notifyInApp: p.inApp, deliveryState };
}
