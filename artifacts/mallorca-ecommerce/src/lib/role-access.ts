import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
export { roles, modules, pageModule } from "../../../../lib/access-policy.mjs";
export type { Policy } from "../../../../lib/access-policy.mjs";
export type RoleAccessResponse = { policy: import("../../../../lib/access-policy.mjs").Policy; version: number; updatedAt: string | null; updatedBy: string | null };
export const accessKey = ["role-access"];
export function useRoleAccess(enabled = true) {
  return useQuery({ queryKey: [...accessKey, "me"], queryFn: () => customFetch<{ modules: Record<string, boolean>; manageRoles: boolean }>("/api/admin/access/me"), enabled, staleTime: 0, refetchInterval: 30000, retry: 1 });
}
export { customFetch };
