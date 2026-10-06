"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ImageUploader from "@/components/admin/ImageUploader";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminCategory, AdminProductDetail, Color } from "@/lib/api/types";
import { parseSizes } from "@/lib/sizes";

// Used for both "new product" (no product prop) and "edit product"
export default function ProductForm({
  product,
}: {
  product?: AdminProductDetail;
}) {
  const router = useRouter();
  const editing = Boolean(product);

  // Form fields (start from the product when editing)
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [price, setPrice] = useState(product ? String(product.priceNgn) : "");
  const [colors, setColors] = useState<Color[]>(
    product?.colors ?? [{ name: "Black", hex: "#111111" }],
  );
  const [sizesText, setSizesText] = useState(
    product ? product.sizes.join(", ") : "38-46",
  );
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [flags, setFlags] = useState({
    isPublished: product?.isPublished ?? true,
    isFeatured: product?.isFeatured ?? false,
    isNew: product?.isNew ?? false,
    isPopular: product?.isPopular ?? false,
    isCustomizable: product?.isCustomizable ?? true,
  });

  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the categories for the dropdown (and pick the first one for a new product)
  useEffect(() => {
    adminFetch<{ items: AdminCategory[] }>("/admin/categories")
      .then((d) => {
        setCategories(d.items);
        setCategoryId((current) => current || d.items[0]?.id || "");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const sizes = parseSizes(sizesText);

  // Update one color row
  function setColor(index: number, patch: Partial<Color>) {
    setColors(colors.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  // Save: create or edit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body = {
      name,
      ...(slug ? { slug } : {}), // empty = let the server make one (new) or keep the old one (edit)
      description,
      categoryId,
      priceNgn: Number(price),
      colors,
      sizes,
      images,
      ...flags,
    };

    try {
      await adminFetch(
        editing ? `/admin/products/${product!.id}` : "/admin/products",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(body),
        },
      );
      router.push("/admin/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded border px-3 py-2 font-normal";

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <label className="block text-sm font-medium">
        Product name *
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
        />
      </label>

      <label className="block text-sm font-medium">
        Category *
        <select
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={field}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        Price per pair (₦) *
        <input
          required
          type="number"
          min={100}
          step={1}
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={field}
        />
      </label>

      <label className="block text-sm font-medium">
        Description *
        <textarea
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={field}
        />
      </label>

      {/* Colors */}
      <div>
        <p className="text-sm font-medium">Colors *</p>
        <div className="mt-2 space-y-2">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={c.hex}
                onChange={(e) => setColor(i, { hex: e.target.value })}
                className="h-9 w-12 rounded border"
                aria-label={`Color ${i + 1} swatch`}
              />
              <input
                value={c.name}
                onChange={(e) => setColor(i, { name: e.target.value })}
                placeholder="Color name"
                className="rounded border px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={colors.length === 1}
                onClick={() => setColors(colors.filter((_, j) => j !== i))}
                className="text-sm text-red-600 underline disabled:text-gray-400"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setColors([...colors, { name: "", hex: "#888888" }])}
          className="mt-2 text-sm underline"
        >
          + Add color
        </button>
      </div>

      {/* Sizes */}
      <label className="block text-sm font-medium">
        Sizes *{" "}
        <span className="font-normal text-gray-500">
          (e.g. 38-46, or 38, 40, 42)
        </span>
        <input
          value={sizesText}
          onChange={(e) => setSizesText(e.target.value)}
          className={field}
        />
        <span className="mt-1 block text-xs font-normal text-gray-600">
          {sizes.length ? `Sizes: ${sizes.join(", ")}` : "No valid sizes yet"}
        </span>
      </label>

      {/* Photos */}
      <div>
        <p className="text-sm font-medium">Photos</p>
        <div className="mt-2">
          <ImageUploader images={images} onChange={setImages} />
        </div>
      </div>

      {/* Options */}
      <fieldset className="grid grid-cols-2 gap-2 text-sm">
        {(
          [
            ["isPublished", "Visible on the shop"],
            ["isFeatured", "Featured on the home page"],
            ["isNew", "Show “New” label"],
            ["isPopular", "Popular"],
            ["isCustomizable", "Custom requests allowed"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {/* Advanced */}
      <label className="block text-sm font-medium">
        URL name (optional){" "}
        <span className="font-normal text-gray-500">
          e.g. pfc-classic-slide. Leave empty to generate it from the name.
        </span>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={field}
        />
      </label>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          disabled={saving}
          className="rounded bg-black px-5 py-2 font-medium text-white disabled:bg-gray-400"
        >
          {saving ? "Saving..." : editing ? "Save changes" : "Create product"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/products")}
          className="rounded border px-5 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
