"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

// Admin sections
const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
];

// UI guard only: the real protection is on the server (requireAdmin)
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return <p className="text-gray-600">Loading...</p>;

  // Signed out
  if (!user) {
    return (
      <p>
        Please{" "}
        <Link href="/login?next=/admin" className="underline">
          sign in
        </Link>{" "}
        as an admin.
      </p>
    );
  }

  // Signed in but not an admin
  if (user.role !== "ADMIN")
    return <p>You don&apos;t have access to this page.</p>;

  return (
    <div>
      {/* Admin menu */}
      <nav className="mb-6 flex flex-wrap gap-2 border-b pb-3 text-sm">
        {nav.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-1 ${active ? "bg-black text-white" : "border hover:bg-gray-50"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
