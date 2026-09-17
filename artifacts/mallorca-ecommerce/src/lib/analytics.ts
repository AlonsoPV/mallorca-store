export type BranchAnalyticsEvent = "branch_selected" | "branch_changed";

export function track(event: string, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("mallorca:analytics", {
      detail: {
        event,
        ...properties,
        timestamp: new Date().toISOString(),
      },
    }),
  );
}

export function trackBranchEvent(
  event: BranchAnalyticsEvent,
  properties: { branchId: number; branchSlug?: string; source: "campaign" | "selector" | "header" },
) {
  track(event, properties);
}
