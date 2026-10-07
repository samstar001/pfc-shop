"use client";

import { useEffect, useRef, useState } from "react";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Pick a design image: it uploads straight away and gives the parent the hosted URL
export default function DesignUploader({
  onChange,
  onBusy,
}: {
  onChange: (url: string | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tell the form while an upload is running (so it can disable the send button)
  useEffect(() => onBusy(uploading), [uploading, onBusy]);

  // Free the temporary preview when it changes or the component goes away
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Check the file, show a preview, then upload it
  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    onChange(null);

    if (!TYPES.includes(file.type))
      return setError("Choose a JPEG, PNG or WebP image.");
    if (file.size > 5 * 1024 * 1024)
      return setError("The image must be 5 MB or smaller.");

    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/uploads/design", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
      onChange(data.url as string);
    } catch (e) {
      setPreview(null);
      setError(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  // Remove the chosen image
  function remove() {
    setPreview(null);
    setError(null);
    onChange(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      {preview ? (
        <div className="flex items-start gap-4">
          {/* Preview of the chosen image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Your design"
            className="h-40 w-40 rounded-lg border border-line object-cover"
          />
          <div className="text-sm">
            <p className="text-muted">
              {uploading ? "Uploading..." : "Image uploaded."}
            </p>
            <button
              type="button"
              onClick={remove}
              disabled={uploading}
              className="mt-2 font-medium text-brand underline disabled:opacity-50"
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-white px-4 py-8 text-center text-sm focus-within:outline focus-within:outline-2 focus-within:outline-brand hover:bg-page">
          <span className="font-medium">Choose a photo or sketch</span>
          <span className="mt-1 text-muted">JPEG, PNG or WebP, up to 5 MB</span>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
