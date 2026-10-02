import { redirect } from "next/navigation";

// /shop/slides → /shop?category=slides
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  redirect(`/shop?category=${encodeURIComponent(category)}`);
}
