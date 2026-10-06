import { statusLabel } from "@/lib/admin/constants";

// Colors for each order and payment status
const styles: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-purple-100 text-purple-800",
  CONFIRMED: "bg-indigo-100 text-indigo-800",
  IN_PRODUCTION: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-200 text-gray-700",
  UNPAID: "bg-red-100 text-red-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  PAID: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  NOT_APPLICABLE: "bg-gray-100 text-gray-600",
};

// Small colored pill used in the admin tables
export default function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[value] ?? "bg-gray-100 text-gray-700"}`}
    >
      {statusLabel(value)}
    </span>
  );
}
