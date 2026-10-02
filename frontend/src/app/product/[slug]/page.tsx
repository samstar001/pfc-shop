import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ApiError, apiGet } from "@/lib/api/client";
import type { ProductDetail } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

// Fetch one product; a 404 from the API becomes Next.js's not-found page
async function getProduct(slug: string): Promise<ProductDetail> {
  try {
    return await apiGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

// Page title and description for SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  return { title: p.name, description: p.description };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const p = await getProduct(slug);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Image gallery: large first image, then the rest as thumbnails */}
      <div>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
          {p.images[0] && (
            <Image
              src={p.images[0]}
              alt={p.name}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          )}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {p.images.slice(1).map((src, i) => (
            <div
              key={src}
              className="relative aspect-square overflow-hidden rounded bg-gray-100"
            >
              <Image
                src={src}
                alt={`${p.name} view ${i + 2}`}
                fill
                sizes="25vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Product information */}
      <div>
        <p className="text-sm uppercase tracking-wide text-gray-500">
          {p.category.name}
        </p>
        <h1 className="mt-1 text-3xl font-bold">{p.name}</h1>
        <p className="mt-3 text-2xl font-semibold">{formatNgn(p.priceNgn)}</p>
        <p className="mt-4 text-gray-700">{p.description}</p>

        {/* Available colors */}
        <h2 className="mt-6 font-medium">Colors</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {p.colors.map((c) => (
            <span
              key={c.name}
              className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              <span
                className="h-3 w-3 rounded-full border"
                style={{ backgroundColor: c.hex }}
              />
              {c.name}
            </span>
          ))}
        </div>

        {/* Available sizes */}
        <h2 className="mt-6 font-medium">Sizes</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {p.sizes.map((s) => (
            <span key={s} className="rounded border px-3 py-1 text-sm">
              {s}
            </span>
          ))}
        </div>

        {/* Whether custom requests are supported */}
        <p className="mt-6 text-sm text-gray-600">
          {p.isCustomizable
            ? "Custom requests supported for this style."
            : "Custom requests are not available for this style."}
        </p>

        {/* Placeholder until Phase 3 adds the configurator and cart */}
        <button
          disabled
          className="mt-6 w-full rounded bg-gray-300 px-5 py-3 font-medium text-gray-600"
        >
          Order options coming next
        </button>
      </div>
    </div>
  );
}
