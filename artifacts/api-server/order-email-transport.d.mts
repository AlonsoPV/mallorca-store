export function sendReceiptEmail(
  payload: unknown,
  jobId: string,
  options: { apiKey?: string; fetcher?: typeof fetch },
): Promise<string>;
