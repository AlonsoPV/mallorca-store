export type Policy = Record<string, Record<string, boolean>>;
export const roles: { id: string; label: string }[];
export const modules: { id: string; label: string; description: string }[];
export function defaultPolicy(): Policy;
export function validatePolicy(value: unknown): value is Policy;
export function canAccess(policy: Policy | undefined, role: string, module: string | null): boolean;
export function pageModule(path: string): string | null;
export function apiModules(path: string, method?: string): string[];
