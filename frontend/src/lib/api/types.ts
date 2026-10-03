// Shapes returned by the Express API (keep in sync with docs/api-contract.md)

// Represents a product color option pairing a display name with its HEX color value
export type Color = { name: string; hex: string };

// Defines the data structure for a product category including names, slugs, and media
export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
};

// Represents lightweight product information optimized for display in catalog grid lists
export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  category: { name: string; slug: string };
  thumbnail: string | null;
  colors: Color[];
  priceNgn: number;
  isCustomizable: boolean;
  isFeatured: boolean;
  isNew: boolean;
  isPopular: boolean;
};

// Extends the summary model with comprehensive descriptive data for single product pages
export type ProductDetail = ProductSummary & {
  description: string;
  images: string[];
  sizes: number[];
};

// A generic wrapper providing metadata fields to handle chunked, server-side data pagination
export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

// The signed-in user as returned by GET /auth/me
export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "CUSTOMER" | "ADMIN";
};
