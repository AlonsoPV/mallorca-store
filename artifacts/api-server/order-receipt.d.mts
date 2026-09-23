export function receiptFilename(order: any): string;
export function buildReceiptPdf(order: any): Promise<Buffer>;
export function buildOrderEmail(
  order: any,
  audience: string,
  orderUrl: string,
): Promise<{
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; content: string; content_type: string }[];
}>;
