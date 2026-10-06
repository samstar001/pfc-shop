"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ProductForm from "@/components/admin/ProductForm";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminProductDetail } from "@/lib/api/types";

// Loads one product, then shows the form filled in
export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<AdminProductDetail>(`/admin/products/${id}`)
      .then(setProduct)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-red-700">{error}</p>;
  if (!product) return <p className="text-gray-600">Loading...</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Edit product</h1>
      <ProductForm product={product} />
    </div>
  );
}
