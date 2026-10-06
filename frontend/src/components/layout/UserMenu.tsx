"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

// Right side of the header: Sign in, or the signed-in user's links
export default function UserMenu() {
  const { user, loading, logout } = useAuth();

  // Placeholder while we check the session
  if (loading)
    return <span className="h-5 w-20 animate-pulse rounded bg-gray-200" />;

  // Signed out
  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded bg-black px-3 py-1.5 text-sm text-white"
      >
        Sign in
      </Link>
    );
  }

  // Signed in
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/account" className="hover:underline">
        My orders
      </Link>
      {user.role === "ADMIN" && (
        <Link href="/admin" className="rounded border px-2 py-0.5">
          Admin
        </Link>
      )}
      <button onClick={logout} className="text-gray-600 hover:text-black">
        Sign out
      </button>
    </div>
  );
}
