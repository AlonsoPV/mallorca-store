export const MAILBOX_ROLES: readonly ["customer", "branch", "contact"];
export const DEFAULT_SMTP_HOST: string;
export const DEFAULT_SMTP_PORT: number;

export type MailboxRole = (typeof MAILBOX_ROLES)[number];

export type PublicMailbox = {
  role: MailboxRole;
  address: string;
  displayName: string;
  smtpUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  passwordConfigured: boolean;
  configured: boolean;
};

export type MailboxCatalog = {
  ready: boolean;
  source: "app" | "env" | "none";
  mailboxes: PublicMailbox[];
};

export type MailboxUpdateInput = {
  address: string;
  displayName: string;
  smtpUser: string;
  password: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
};

export function isMailboxRole(value: unknown): value is MailboxRole;
export function formatMailboxFrom(address?: string | null, displayName?: string | null): string;
export function parseFromDisplayName(value?: string | null): string;
export function mailboxConfigured(
  role: string,
  address?: string | null,
  passwordConfigured?: boolean,
): boolean;
export function publicMailbox(row?: Record<string, unknown>): PublicMailbox;
export function listPublicMailboxes(rows?: unknown[]): {
  ready: boolean;
  mailboxes: PublicMailbox[];
};
export function mailboxesReady(mailboxes?: PublicMailbox[]): boolean;
export function catalogMailboxes(
  storedRows?: unknown[],
  envSeeds?: unknown[],
): MailboxCatalog;
export function parseMailboxUpdate(
  body: unknown,
): { ok: true; data: MailboxUpdateInput } | { ok: false; error: string };
