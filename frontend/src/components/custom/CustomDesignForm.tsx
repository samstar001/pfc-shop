"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { OrderDetail } from "@/lib/api/types";
import DesignUploader from "./DesignUploader";

// Choices for the type of footwear (must match the backend list)
const FOOTWEAR_TYPES = ["Shoes", "Slides", "Sandals", "Slippers", "Other"];

// Sizes shown in the quantity grid
const SIZES = Array.from({ length: 12 }, (_, i) => 36 + i);

export default function CustomDesignForm() {
  const router = useRouter();
  const { user } = useAuth();

  // Request details
  const [footwearType, setFootwearType] = useState("");
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [colorNote, setColorNote] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [instructions, setInstructions] = useState("");

  // Contact details
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed-in customers: fill in name and email, and phone and location from their last order
  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.name);
    setEmail((e) => e || user.email);
    fetch("/api/v1/account/checkout-defaults", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!d) return;
        setPhone((p) => p || d.phone || "");
        setLocation((l) => l || d.location || "");
      })
      .catch(() => {
        /* prefill is a convenience: ignore errors */
      });
  }, [user]);

  // Total pairs across all sizes
  const total = Object.values(quantities).reduce((sum, n) => sum + n, 0);

  // Set the quantity for one size (0 to 1000)
  function setQuantity(size: number, value: string) {
    const n = Math.max(0, Math.min(1000, Math.floor(Number(value) || 0)));
    setQuantities((q) => ({ ...q, [size]: n }));
  }

  // Send the request to the API
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!footwearType) return setError("Choose a type of footwear.");
    if (total === 0)
      return setError("Enter how many pairs you want in at least one size.");

    // Only sizes with a quantity are sent
    const sizeBreakdown: Record<string, number> = {};
    for (const [size, n] of Object.entries(quantities))
      if (n > 0) sizeBreakdown[size] = n;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOM",
          customer: { name, phone, email, location },
          items: [
            {
              footwearType,
              designImageUrl: designUrl ?? undefined,
              colorNote: colorNote || undefined,
              sizeBreakdown,
            },
          ],
          instructions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const detail = data?.error?.details?.[0];
        setError(
          detail
            ? detail.issue
            : (data?.error?.message ?? "Something went wrong"),
        );
        return;
      }

      // Success: open the request page (the token lets guests view it)
      const order = data as OrderDetail & { accessToken: string };
      router.push(
        `/order/${order.reference}?token=${encodeURIComponent(order.accessToken)}`,
      );
    } catch {
      setError(
        "Could not reach the server. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Optional Google sign-in */}
      {!user && (
        <p className="panel p-3 text-sm text-muted">
          Have a Google account?{" "}
          <a
            href="/api/v1/auth/google/login?next=/custom-design"
            className="font-medium text-brand underline"
          >
            Continue with Google
          </a>{" "}
          to fill in your details and keep track of your requests. Or just fill
          in the form below.
        </p>
      )}

      {/* Type of footwear */}
      <fieldset>
        <legend className="text-sm font-medium">
          What do you want made? *
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FOOTWEAR_TYPES.map((t) => (
            <label key={t} className="relative">
              <input
                type="radio"
                name="footwearType"
                value={t}
                checked={footwearType === t}
                onChange={() => setFootwearType(t)}
                className="peer sr-only"
              />
              <span className="inline-block cursor-pointer rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                {t}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Design image */}
      <div>
        <p className="text-sm font-medium">Your design</p>
        <p className="mb-2 text-sm text-muted">
          A photo, sketch or screenshot of what you have in mind. Optional, but
          it helps us price it.
        </p>
        <DesignUploader onChange={setDesignUrl} onBusy={setUploadBusy} />
      </div>

      {/* Description and colour */}
      <div className="space-y-4">
        <label className="block text-sm font-medium">
          Describe your design *
          <textarea
            required
            minLength={10}
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Material, strap style, sole, logo, anything we should know"
            className="mt-1 w-full font-normal"
          />
        </label>
        <label className="block text-sm font-medium">
          Colours
          <input
            value={colorNote}
            onChange={(e) => setColorNote(e.target.value)}
            placeholder="e.g. Black with gold straps"
            maxLength={200}
            className="mt-1 w-full font-normal"
          />
        </label>
      </div>

      {/* Sizes and quantities */}
      <fieldset>
        <legend className="text-sm font-medium">
          How many pairs in each size? *
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {SIZES.map((s) => (
            <label key={s} className="text-sm">
              <span className="block text-muted">Size {s}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                value={quantities[s] ? quantities[s] : ""}
                placeholder="0"
                onChange={(e) => setQuantity(s, e.target.value)}
                className="mt-1 w-full"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm font-medium">
          Total: {total} pair{total === 1 ? "" : "s"}
        </p>
      </fieldset>

      {/* Contact details */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">How can we reach you?</h2>
        <label className="block text-sm font-medium">
          Full name *
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full font-normal"
          />
        </label>
        <label className="block text-sm font-medium">
          Phone number *
          <input
            required
            type="tel"
            inputMode="tel"
            placeholder="08012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full font-normal"
          />
        </label>
        <label className="block text-sm font-medium">
          Email *
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full font-normal"
          />
        </label>
        <label className="block text-sm font-medium">
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City / area"
            className="mt-1 w-full font-normal"
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={submitting || uploadBusy}
          className="btn-primary w-full sm:w-auto"
        >
          {submitting
            ? "Sending..."
            : uploadBusy
              ? "Uploading image..."
              : "Send request"}
        </button>
        <p className="mt-2 text-sm text-muted">
          This is a quote request. You do not pay anything now.
        </p>
      </div>
    </form>
  );
}
