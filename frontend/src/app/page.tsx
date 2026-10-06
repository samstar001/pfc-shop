import Image from "next/image";
import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
// 1. Added the Hero component import
import Hero from "@/components/home/Hero";
import { apiGet } from "@/lib/api/client";
import type { Category, Paginated, ProductSummary } from "@/lib/api/types";

export default async function Home() {
  // Fetch categories and featured products at the same time
  const [categories, featured] = await Promise.all([
    apiGet<{ items: Category[] }>("/categories"),
    apiGet<Paginated<ProductSummary>>("/products?featured=true&pageSize=4"),
  ]);

  return (
    <div className="space-y-14">
      {/* 2. Replaced the old top banner layout section with the clean Hero component wrapper */}
      <Hero />

      {/* Category navigation */}
      {/* 3. Added mt-12 styling parameters and font-display configuration to section headings */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold mb-4">
          Shop by category
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.items.map((c) => (
            <Link
              key={c.id}
              href={`/shop?category=${c.slug}`}
              className="rounded-lg border border-gray-200 p-5 text-center font-medium hover:bg-gray-50"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold mb-4">Featured</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {featured.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
