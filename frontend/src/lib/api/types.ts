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

// An order as returned by POST /orders and GET /orders/:reference
export type OrderItemDetail = {
  id: string;
  productName: string;
  color: string | null;
  sizeBreakdown: Record<string, number>;
  quantity: number;
  unitPriceNgn: number | null;
};

export type OrderDetail = {
  id: string;
  reference: string;
  type: "CATALOGUE" | "CUSTOM";
  status: string;
  paymentStatus: "UNPAID" | "PENDING" | "PAID" | "FAILED" | "NOT_APPLICABLE";
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  location: string | null;
  instructions: string | null;
  totalQuantity: number;
  subtotalNgn: number | null;
  createdAt: string;
  items: OrderItemDetail[];
  whatsappUrl: string | null;
};

// ---------- Admin ----------
export type AdminStats = {
  totalOrders: number;
  last7Days: number;
  awaitingPayment: number;
  paidOrders: number;
  paidRevenueNgn: number;
  byStatus: Record<string, number>;
};

export type AdminOrderSummary = {
  id: string;
  reference: string;
  type: "CATALOGUE" | "CUSTOM";
  status: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  totalQuantity: number;
  subtotalNgn: number | null;
  itemCount: number;
  createdAt: string;
};

export type AdminOrderDetail = {
  id: string;
  reference: string;
  type: "CATALOGUE" | "CUSTOM";
  status: string;
  paymentStatus: string;
  paymentReference: string | null;
  paidAt: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  location: string | null;
  instructions: string | null;
  totalQuantity: number;
  subtotalNgn: number | null;
  createdAt: string;
  updatedAt: string;
  account: { name: string; email: string } | null;
  items: {
    id: string;
    productName: string;
    category: string | null;
    color: string | null;
    sizeBreakdown: Record<string, number>;
    quantity: number;
    unitPriceNgn: number | null;
    footwearType: string | null;
    designImageUrl: string | null;
    colorNote: string | null;
  }[];
};
