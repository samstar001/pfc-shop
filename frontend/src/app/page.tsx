import Image from "next/image";
import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
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
      {/* Hero */}
      <section className="rounded-xl bg-gray-900 px-6 py-16 text-center text-white">
        <h1 className="text-3xl font-bold sm:text-5xl">
          PAT Footwear Collection
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-gray-300">
          Quality shoes, slides, sandals and slippers, made by us. Order from
          our collection or send us your own design.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/shop"
            className="rounded bg-white px-5 py-3 font-medium text-black"
          >
            Explore Collection
          </Link>
          <Link
            href="/custom-design"
            className="rounded border border-white px-5 py-3 font-medium"
          >
            Create Custom Order
          </Link>
        </div>
      </section>

      {/* Category navigation */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Shop by category</h2>
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
      <section>
        <h2 className="mb-4 text-xl font-semibold">Featured</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {featured.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
