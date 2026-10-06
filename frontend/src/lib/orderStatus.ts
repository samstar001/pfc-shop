// Friendly wording of order statuses for customers (the admin sees the raw statuses)
const labels: Record<string, string> = {
  NEW: "Received",
  CONTACTED: "PFC has contacted you",
  CONFIRMED: "Confirmed",
  IN_PRODUCTION: "In production",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function customerStatusLabel(status: string): string {
  return labels[status] ?? status;
}
