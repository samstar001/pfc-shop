"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading...</p>;

  // Signed out
  if (!user) {
    return (
      <p>
        Please{" "}
        <Link href="/login?next=/admin/products" className="underline">
          sign in
        </Link>{" "}
        as an admin.
      </p>
    );
  }

  // Signed in but not an admin
  if (user.role !== "ADMIN")
    return <p>You don&apos;t have access to this page.</p>;

  return <>{children}</>;
}
