import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import { apiGet } from "@/lib/api/client";
import type { Category, Paginated, ProductSummary } from "@/lib/api/types";

export const metadata = { title: "Shop" };

// In Next.js 15+, searchParams is a Promise
type Props = { searchParams: Promise<{ category?: string; page?: string }> };

export default async function ShopPage({ searchParams }: Props) {
  const { category, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  // Build the API query from the URL
  const qs = new URLSearchParams({ page: String(currentPage), pageSize: "12" });
  if (category) qs.set("category", category);

  // Fetch categories and products at the same time
  const [categories, products] = await Promise.all([
    apiGet<{ items: Category[] }>("/categories"),
    apiGet<Paginated<ProductSummary>>(`/products?${qs.toString()}`),
  ]);

  const totalPages = Math.max(1, Math.ceil(products.total / products.pageSize));

  // Helper for building pagination links that keep the selected category
  const pageHref = (p: number) =>
    `/shop?${new URLSearchParams({ ...(category ? { category } : {}), page: String(p) })}`;

  return (
    <div>
      <h1 className="text-2xl font-bold">Shop</h1>

      {/* Category filter chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/shop"
          className={`rounded-full border px-4 py-1 text-sm ${!category ? "bg-brand text-white" : "hover:bg-gray-50"}`}
        >
          All
        </Link>
        {categories.items.map((c) => (
          <Link
            key={c.id}
            href={`/shop?category=${c.slug}`}
            className={`rounded-full border px-4 py-1 text-sm ${category === c.slug ? "bg-brand text-white" : "hover:bg-gray-50"}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {/* Product grid (or an empty state) */}
      {products.items.length === 0 ? (
        <p className="mt-10 text-gray-600">No products found.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4 text-sm">
          {currentPage > 1 && (
            <Link href={pageHref(currentPage - 1)}>← Previous</Link>
          )}
          <span>
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link href={pageHref(currentPage + 1)}>Next →</Link>
          )}
        </div>
      )}
    </div>
  );
}
