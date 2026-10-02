import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

// Card shown in product grids: image, name, category, color dots, price
export default function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:shadow-md"
    >
      {/* Product image */}
      <div className="relative aspect-square bg-gray-100">
        {product.thumbnail && (
          <Image
            src={product.thumbnail}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition group-hover:scale-105"
          />
        )}
        {product.isNew && (
          <span className="absolute left-2 top-2 rounded bg-black px-2 py-0.5 text-xs text-white">
            New
          </span>
        )}
      </div>

      {/* Text details */}
      <div className="p-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {product.category.name}
        </p>
        <h3 className="mt-1 font-medium">{product.name}</h3>

        {/* Available colors */}
        <div className="mt-2 flex gap-1" aria-label="Available colors">
          {product.colors.map((c) => (
            <span
              key={c.name}
              title={c.name}
              className="h-4 w-4 rounded-full border border-gray-300"
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>

        <p className="mt-2 font-semibold">{formatNgn(product.priceNgn)}</p>
      </div>
    </Link>
  );
}
