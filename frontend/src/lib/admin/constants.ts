// Status values (must match the backend enums)
export const ORDER_STATUSES = [
  "NEW",
  "CONTACTED",
  "CONFIRMED",
  "IN_PRODUCTION",
  "COMPLETED",
  "CANCELLED",
] as const;
export const PAYMENT_STATUSES = [
  "UNPAID",
  "PENDING",
  "PAID",
  "FAILED",
  "NOT_APPLICABLE",
] as const;

// "IN_PRODUCTION" → "In production"
export function statusLabel(value: string): string {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
