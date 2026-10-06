import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

// Card shown in product grids: photo first, then name, colours and price
export default function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link href={`/product/${product.slug}`} className="group block">
      {/* Product image */}
      <div className="relative aspect-square overflow-hidden rounded-xl bg-line">
        {product.thumbnail && (
          <Image
            src={product.thumbnail}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        )}
        {product.isNew && (
          <span className="absolute left-2 top-2 rounded-md bg-brand px-2 py-0.5 text-xs font-semibold text-white">
            New
          </span>
        )}
      </div>

      {/* Text details */}
      <div className="mt-3">
        <h3 className="font-semibold group-hover:text-brand">{product.name}</h3>
        <p className="text-sm text-muted">{product.category.name}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="font-semibold">{formatNgn(product.priceNgn)}</p>

          {/* Available colours */}
          <div className="flex gap-1" aria-label="Available colours">
            {product.colors.map((c) => (
              <span
                key={c.name}
                title={c.name}
                className="h-4 w-4 rounded-full border border-black/15"
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
