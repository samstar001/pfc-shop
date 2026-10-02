// Seed script: inserts sample categories and products. Safe to run more than once (uses upsert).
// All names, prices and images are PLACEHOLDERS to be replaced with PFC's real data.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Placeholder image URL (swap for real Cloudinary photos later)
const img = (label: string) =>
  `https://placehold.co/800x800.png?text=${encodeURIComponent(label).replace(/%20/g, "+")}`;

// Reusable colors
const COLORS = {
  black: { name: "Black", hex: "#111111" },
  brown: { name: "Brown", hex: "#6b4423" },
  white: { name: "White", hex: "#f5f5f5" },
  navy: { name: "Navy", hex: "#1f2a44" },
  tan: { name: "Tan", hex: "#c8a165" },
  red: { name: "Red", hex: "#b3261e" },
};

// Size range helper: range(38, 46) → [38, 39, ..., 46]
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Categories shown on the site
const categories = [
  { name: "Shoes", slug: "shoes", description: "Formal and casual shoes", sortOrder: 1 },
  { name: "Slides", slug: "slides", description: "Comfortable everyday slides", sortOrder: 2 },
  { name: "Sandals", slug: "sandals", description: "Durable leather and gladiator sandals", sortOrder: 3 },
  { name: "Slippers", slug: "slippers", description: "Soft home and indoor slippers", sortOrder: 4 },
];

// Sample products (priceNgn is in whole naira)
const products = [
  {
    name: "PFC Classic Slide", slug: "pfc-classic-slide", categorySlug: "slides", priceNgn: 8500,
    description: "Our best-selling everyday slide with a soft footbed and durable sole.",
    colors: [COLORS.black, COLORS.brown, COLORS.white], sizes: range(38, 46),
    isFeatured: true, isPopular: true, isNew: false,
  },
  {
    name: "PFC Cushion Slide", slug: "pfc-cushion-slide", categorySlug: "slides", priceNgn: 9500,
    description: "Extra-thick cushioned slide for all-day comfort.",
    colors: [COLORS.black, COLORS.navy], sizes: range(38, 46),
    isFeatured: false, isPopular: false, isNew: true,
  },
  {
    name: "PFC Leather Sandal", slug: "pfc-leather-sandal", categorySlug: "sandals", priceNgn: 12000,
    description: "Handcrafted leather sandal with adjustable straps.",
    colors: [COLORS.brown, COLORS.tan, COLORS.black], sizes: range(39, 46),
    isFeatured: false, isPopular: true, isNew: false,
  },
  {
    name: "PFC Gladiator Sandal", slug: "pfc-gladiator-sandal", categorySlug: "sandals", priceNgn: 11000,
    description: "Strappy gladiator-style sandal, light and breathable.",
    colors: [COLORS.tan, COLORS.black], sizes: range(36, 42),
    isFeatured: true, isPopular: false, isNew: false,
  },
  {
    name: "PFC Home Slipper", slug: "pfc-home-slipper", categorySlug: "slippers", priceNgn: 6000,
    description: "Lightweight indoor slipper that is easy to slip on and off.",
    colors: [COLORS.navy, COLORS.black, COLORS.red], sizes: range(36, 46),
    isFeatured: false, isPopular: false, isNew: false,
  },
  {
    name: "PFC Plush Slipper", slug: "pfc-plush-slipper", categorySlug: "slippers", priceNgn: 7000,
    description: "Warm plush-lined slipper for cool evenings.",
    colors: [COLORS.white, COLORS.tan], sizes: range(36, 44),
    isFeatured: false, isPopular: true, isNew: false,
  },
  {
    name: "PFC Oxford Shoe", slug: "pfc-oxford-shoe", categorySlug: "shoes", priceNgn: 22000,
    description: "Classic leather oxford for office and formal events.",
    colors: [COLORS.black, COLORS.brown], sizes: range(40, 46),
    isFeatured: true, isPopular: false, isNew: false,
  },
  {
    name: "PFC Casual Loafer", slug: "pfc-casual-loafer", categorySlug: "shoes", priceNgn: 19000,
    description: "Smart-casual slip-on loafer with a flexible sole.",
    colors: [COLORS.brown, COLORS.navy], sizes: range(40, 46),
    isFeatured: false, isPopular: false, isNew: true,
  },
];

async function main() {
  // Create or update categories, remembering each id by slug
  const categoryIds: Record<string, string> = {};
  for (const c of categories) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, sortOrder: c.sortOrder },
      create: c,
    });
    categoryIds[c.slug] = row.id;
  }

  // Create or update products (3 placeholder photos each)
  for (const p of products) {
    const { categorySlug, ...rest } = p;
    const data = {
      ...rest,
      categoryId: categoryIds[categorySlug],
      images: [img(p.name), img(`${p.name} side`), img(`${p.name} back`)],
      isCustomizable: true,
      isPublished: true,
    };
    await prisma.product.upsert({ where: { slug: p.slug }, update: data, create: data });
  }

  console.log(`Seeded ${categories.length} categories and ${products.length} products`);
}

// Run, report failures, and always close the database connection
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());