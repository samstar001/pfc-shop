// Format whole naira for emails, e.g. 8500 → "₦8,500"
export function formatNgn(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}
