"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { adminFetch } from "@/lib/api/adminClient";

// Upload product photos, remove them, and choose which one is the main image (the first one)
export default function ImageUploader({
  images,
  onChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Upload each chosen file, one at a time
  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);

    let next = [...images];
    for (const file of Array.from(files)) {
      if (next.length >= 8) {
        setError("A product can have at most 8 photos");
        break;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(`${file.name} is larger than 5 MB`);
        continue;
      }

      const form = new FormData();
      form.append("file", file);
      try {
        const { url } = await adminFetch<{ url: string }>(
          "/admin/uploads/image",
          { method: "POST", body: form },
        );
        next = [...next, url];
        onChange(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    }

    setUploading(false);
    if (input.current) input.current.value = ""; // allow choosing the same file again
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((src, i) => (
          <div key={src} className="w-28">
            <div className="relative aspect-square overflow-hidden rounded border bg-gray-100">
              <Image
                src={src}
                alt={`Photo ${i + 1}`}
                fill
                sizes="112px"
                className="object-cover"
              />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-black px-1.5 text-xs text-white">
                  Main
                </span>
              )}
            </div>
            <div className="mt-1 flex justify-between text-xs">
              {i > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange([src, ...images.filter((_, j) => j !== i)])
                  }
                  className="underline"
                >
                  Make main
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                className="text-red-600 underline"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="mt-3 block text-sm"
      />
      <p className="mt-1 text-xs text-gray-500">
        JPEG, PNG or WebP, up to 5 MB each, up to 8 photos. The first photo is
        the main one.
      </p>
      {uploading && <p className="mt-1 text-sm text-gray-600">Uploading...</p>}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
