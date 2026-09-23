export function money(value: number | null | undefined): string;
export const paymentLabels: Record<string, string>;
export const statusLabels: Record<string, string>;
export function purchaseResult(order: any): {
  title: string;
  message: string;
  tone: string;
  paymentStatus: string;
  amountPaid: number;
  balance: number;
};
export function scheduleLabel(value: string | Date): string;
export function escapeHtml(value: unknown): string;
export function receiptSnapshot(order: any, branch?: any): any;
export function selectBranchEmail(
  assignments: Array<{
    active: boolean;
    isPrimary: boolean;
    role: string;
    email: string;
    userId: string;
  }>,
): string | null;
