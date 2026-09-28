export const HOSTINGER_SMTP_HOST: string;

export function extractEmailAddress(value?: string | null): string;

export function emailFromAddress(
  audience?: "customer" | "branch" | string,
  env?: NodeJS.ProcessEnv,
): string;

export function emailReplyTo(
  audience?: "customer" | "branch" | string,
  env?: NodeJS.ProcessEnv,
): string;

export function mailboxAuth(
  audience?: "customer" | "branch" | string,
  env?: NodeJS.ProcessEnv,
): { user: string; pass: string };

export function resolveMailbox(
  audience?: "customer" | "branch" | string,
  env?: NodeJS.ProcessEnv,
): {
  role: "customer" | "branch";
  from: string;
  replyTo?: string;
  user: string;
  pass: string;
} | null;

export function smtpConfigured(env?: NodeJS.ProcessEnv): boolean;

export type SmtpMailboxOverride = {
  from?: string;
  user: string;
  pass: string;
  host?: string;
  port?: number;
  secure?: boolean;
  replyTo?: string;
};

export function smtpTransportOptions(
  env?: NodeJS.ProcessEnv,
  audience?: "customer" | "branch" | string,
  override?: SmtpMailboxOverride | null,
): {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};

export function sendReceiptEmail(
  payload: unknown,
  jobId: string,
  options?: {
    apiKey?: string;
    fetcher?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    audience?: "customer" | "branch" | string;
    mailbox?: SmtpMailboxOverride | null;
    transporter?: { sendMail: (message: unknown) => Promise<{ messageId?: string; response?: string }> };
  },
): Promise<string>;
