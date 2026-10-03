"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function AccountPage() {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading...</p>;

  // Not signed in: send them to the login page, then back here
  if (!user) {
    return (
      <p>
        Please{" "}
        <Link href="/login?next=/account" className="underline">
          sign in
        </Link>{" "}
        to view your account.
      </p>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">My account</h1>
      <p className="mt-3">{user.name}</p>
      <p className="text-gray-600">{user.email}</p>
      {/* Order history arrives in Phase 7 */}
      <p className="mt-6 text-sm text-gray-500">
        Your order history will appear here.
      </p>
    </div>
  );
}
