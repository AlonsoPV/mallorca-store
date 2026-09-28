import nodemailer from "nodemailer";

export const HOSTINGER_SMTP_HOST = "smtp.hostinger.com";

function pick(env, ...keys) {
  for (const key of keys) {
    const value = String(env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

export function extractEmailAddress(value) {
  const raw = String(value || "").trim();
  const angled = /<([^>]+)>/.exec(raw);
  const email = (angled ? angled[1] : raw).trim().toLowerCase();
  return email.includes("@") ? email : "";
}

export function emailFromAddress(audience = "customer", env = process.env) {
  if (audience === "branch") {
    return pick(env, "ORDER_EMAIL_FROM_BRANCH");
  }
  return pick(env, "ORDER_EMAIL_FROM_CUSTOMER", "ORDER_EMAIL_FROM");
}

export function emailReplyTo(audience = "customer", env = process.env) {
  if (audience === "branch") {
    return pick(env, "ORDER_EMAIL_REPLY_TO_BRANCH", "ORDER_EMAIL_REPLY_TO");
  }
  return pick(env, "ORDER_EMAIL_REPLY_TO");
}

export function mailboxAuth(audience = "customer", env = process.env) {
  if (audience === "branch") {
    return {
      user: pick(env, "SMTP_SUCURSAL_USER", "SMTP_BRANCH_USER"),
      pass: pick(env, "SMTP_SUCURSAL_PASS", "SMTP_BRANCH_PASS"),
    };
  }
  return {
    user: pick(env, "SMTP_PEDIDOS_USER", "SMTP_CUSTOMER_USER", "SMTP_USER"),
    pass: pick(env, "SMTP_PEDIDOS_PASS", "SMTP_CUSTOMER_PASS", "SMTP_PASS"),
  };
}

export function resolveMailbox(audience = "customer", env = process.env) {
  const role = audience === "branch" ? "branch" : "customer";
  const from = emailFromAddress(role, env);
  const auth = mailboxAuth(role, env);
  if (!from || !auth.user || !auth.pass) return null;
  return {
    role,
    from,
    replyTo: emailReplyTo(role, env) || undefined,
    user: auth.user,
    pass: auth.pass,
  };
}

export function smtpConfigured(env = process.env) {
  const customer = resolveMailbox("customer", env);
  const branch = resolveMailbox("branch", env);
  if (!customer || !branch) return false;
  return extractEmailAddress(customer.from) !== extractEmailAddress(branch.from);
}

export function smtpTransportOptions(env = process.env, audience = "customer", override = null) {
  const mailbox = override || resolveMailbox(audience, env);
  const port = Number(override?.port || env.SMTP_PORT || 465);
  const secure =
    override?.secure != null
      ? Boolean(override.secure)
      : env.SMTP_SECURE == null
        ? port === 465
        : !["0", "false", "no"].includes(String(env.SMTP_SECURE).toLowerCase());
  return {
    host: String(override?.host || env.SMTP_HOST || HOSTINGER_SMTP_HOST).trim() || HOSTINGER_SMTP_HOST,
    port: Number.isFinite(port) && port > 0 ? port : 465,
    secure,
    auth: {
      user: mailbox?.user || "",
      pass: mailbox?.pass || "",
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  };
}

function toMailOptions(payload, jobId) {
  return {
    from: payload.from,
    to: payload.to,
    replyTo: payload.reply_to || payload.replyTo,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    messageId: `<order-receipt.${jobId}@hostinger>`,
    headers: {
      "X-Mallorca-Email-Job": String(jobId),
    },
    attachments: (payload.attachments || []).map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      encoding:
        attachment.encoding ||
        (typeof attachment.content === "string" ? "base64" : undefined),
      contentType: attachment.contentType || attachment.content_type,
    })),
  };
}

async function sendViaSmtp(
  payload,
  jobId,
  { env = process.env, transporter, audience, mailbox: override } = {},
) {
  const role = audience === "branch" ? "branch" : "customer";
  const mailbox = override || resolveMailbox(role, env);
  if (!transporter && !mailbox) throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  const mailer = transporter || nodemailer.createTransport(smtpTransportOptions(env, role, override || undefined));
  const message = toMailOptions(
    {
      ...payload,
      from: payload.from || mailbox?.from,
      replyTo: payload.reply_to || payload.replyTo || mailbox?.replyTo,
    },
    jobId,
  );
  try {
    const info = await mailer.sendMail(message);
    const id = info.messageId || info.response;
    if (!id) throw new Error("EMAIL_PROVIDER_NO_ID");
    return String(id);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "EAUTH") throw new Error("EMAIL_PROVIDER_AUTH");
    if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET") {
      throw new Error("EMAIL_PROVIDER_SMTP");
    }
    if (error instanceof Error && error.message.startsWith("EMAIL_PROVIDER_")) throw error;
    throw new Error("EMAIL_PROVIDER_SMTP");
  }
}

async function sendViaResend(payload, jobId, { apiKey, fetcher = fetch } = {}) {
  if (!apiKey) throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `order-receipt/${jobId}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`EMAIL_PROVIDER_HTTP_${response.status}`);
  const result = await response.json();
  if (!result.id) throw new Error("EMAIL_PROVIDER_NO_ID");
  return result.id;
}

export async function sendReceiptEmail(
  payload,
  jobId,
  { apiKey, fetcher = fetch, env = process.env, transporter, audience, mailbox } = {},
) {
  if (transporter || mailbox || smtpConfigured(env) || resolveMailbox(audience, env)) {
    return sendViaSmtp(payload, jobId, { env, transporter, audience, mailbox });
  }
  return sendViaResend(payload, jobId, { apiKey: apiKey ?? env.RESEND_API_KEY, fetcher });
}
