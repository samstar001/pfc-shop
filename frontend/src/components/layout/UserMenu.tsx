"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

// Right side of the header: Sign in, or the signed-in user's links
export default function UserMenu() {
  const { user, loading, logout } = useAuth();

  // Placeholder while we check the session
  if (loading)
    return <span className="h-9 w-20 animate-pulse rounded-lg bg-line" />;

  // Signed out
  if (!user) {
    return (
      <Link href="/login" className="btn-primary px-4 py-2 text-sm">
        Sign in
      </Link>
    );
  }

  // Signed in (the links other than Sign out hide on very small screens)
  return (
    <div className="flex items-center gap-1 text-sm font-medium">
      <Link
        href="/account"
        className="hidden rounded-lg px-3 py-2 hover:bg-page sm:inline"
      >
        My orders
      </Link>
      {user.role === "ADMIN" && (
        <Link
          href="/admin"
          className="hidden rounded-lg bg-brand-soft px-3 py-2 text-brand sm:inline"
        >
          Admin
        </Link>
      )}
      <button
        onClick={logout}
        className="rounded-lg px-3 py-2 text-muted hover:bg-page hover:text-ink"
      >
        Sign out
      </button>
    </div>
  );
}
