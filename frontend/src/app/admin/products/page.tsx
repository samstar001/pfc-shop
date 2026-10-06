"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminProductSummary, Paginated } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

export default function AdminProductsPage() {
  const [data, setData] = useState<Paginated<AdminProductSummary> | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Load the list (also used to refresh after a change)
  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (query) qs.set("q", query);
    try {
      setData(
        await adminFetch<Paginated<AdminProductSummary>>(
          `/admin/products?${qs.toString()}`,
        ),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load products");
    }
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  // Show or hide a product on the shop
  async function togglePublished(p: AdminProductSummary) {
    try {
      await adminFetch(`/admin/products/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublished: !p.isPublished }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    }
  }

  // Delete after confirmation
  async function remove(p: AdminProductSummary) {
    if (
      !window.confirm(
        `Delete "${p.name}"? Old orders will keep their details. This cannot be undone.`,
      )
    )
      return;
    try {
      await adminFetch(`/admin/products/${p.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Products</h1>
        <Link
          href="/admin/products/new"
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          + New product
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          className="w-64 rounded border px-3 py-1 text-sm"
        />
        <button className="rounded border px-3 py-1 text-sm">Search</button>
      </form>

      {error && <p className="mt-4 text-red-700">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b text-gray-600">
            <tr>
              <th className="py-2 pr-3">Product</th>
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3">Price</th>
              <th className="py-2 pr-3">Shop</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id} className="border-b align-middle">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-gray-100">
                      {p.thumbnail && (
                        <Image
                          src={p.thumbnail}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div>
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="font-medium underline"
                      >
                        {p.name}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {p.isFeatured && "Featured · "}
                        {p.isNew && "New · "}
                        {p.isPopular && "Popular"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-3">{p.category.name}</td>
                <td className="py-2 pr-3">{formatNgn(p.priceNgn)}</td>
                <td className="py-2 pr-3">
                  <button
                    onClick={() => togglePublished(p)}
                    className={`rounded-full px-3 py-0.5 text-xs ${p.isPublished ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}
                  >
                    {p.isPublished ? "Visible" : "Hidden"}
                  </button>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <Link href={`/admin/products/${p.id}`} className="underline">
                    Edit
                  </Link>
                  <button
                    onClick={() => remove(p)}
                    className="ml-3 text-red-600 underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <p className="mt-3 text-gray-600">No products found.</p>
        )}
        {!data && !error && <p className="mt-3 text-gray-600">Loading...</p>}
      </div>

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="disabled:text-gray-400"
          >
            ← Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="disabled:text-gray-400"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
