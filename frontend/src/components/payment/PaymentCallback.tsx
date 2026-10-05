"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Landing page after Paystack: asks the API to verify the payment, then opens the order page
export default function PaymentCallback() {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const reference = search.get("reference") ?? search.get("trxref");

  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // stops React dev mode from verifying twice

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!reference) {
      setError("Missing payment reference.");
      return;
    }

    fetch(
      `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`,
      {
        cache: "no-store",
      },
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error?.message ?? "Could not verify payment");
        // Show the order page, which displays PAID / FAILED / PENDING
        router.replace(
          `/order/${data.orderReference}?token=${encodeURIComponent(token)}`,
        );
      })
      .catch((e: Error) => setError(e.message));
  }, [reference, token, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-bold">We could not confirm your payment</h1>
        <p className="mt-2 text-gray-600">{error}</p>
        <p className="mt-2 text-sm text-gray-600">
          If money left your account, do not worry: PFC will confirm it. Contact
          us with your order reference.
        </p>
        <Link href="/" className="mt-4 inline-block underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <p className="text-center text-gray-600">
      Confirming your payment, please wait...
    </p>
  );
}
