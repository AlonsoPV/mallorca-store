export async function sendReceiptEmail(
  payload,
  jobId,
  { apiKey, fetcher = fetch } = {},
) {
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
