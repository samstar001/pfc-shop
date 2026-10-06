"use client";

import { useState } from "react";

// Starts a Paystack payment and sends the browser to Paystack's hosted page
export default function PayButton({
  reference,
  token,
  label,
}: {
  reference: string;
  token: string | null;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/payments/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, token: token ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not start payment");
        setLoading(false);
        return;
      }
      // Leave the button in its loading state while the browser navigates away
      window.location.href = data.authorizationUrl;
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={pay}
        disabled={loading}
        className="rounded bg-brand px-5 py-3 font-medium text-white disabled:bg-gray-400"
      >
        {loading ? "Redirecting to Paystack..." : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
