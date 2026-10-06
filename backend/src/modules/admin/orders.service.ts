import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { prismaCode } from "../../utils/prismaErrors.js";
import type { ListOrdersQuery } from "./orders.schema.js";

// Numbers shown on the dashboard
export async function getStats() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [byStatusRows, paid, awaitingPayment, last7Days] = await Promise.all([
    // How many orders in each status
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    // Paid orders and the money they brought in
    prisma.order.aggregate({
      where: { paymentStatus: "PAID" },
      _sum: { subtotalNgn: true },
      _count: { _all: true },
    }),
    // Catalogue orders that still need payment
    prisma.order.count({
      where: {
        type: "CATALOGUE",
        status: { not: "CANCELLED" },
        paymentStatus: { in: ["UNPAID", "PENDING", "FAILED"] },
      },
    }),
    // New orders in the last 7 days
    prisma.order.count({ where: { createdAt: { gte: since } } }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of byStatusRows) byStatus[row.status] = row._count._all;

  return {
    totalOrders: byStatusRows.reduce((sum, r) => sum + r._count._all, 0),
    last7Days,
    awaitingPayment,
    paidOrders: paid._count._all,
    paidRevenueNgn: paid._sum.subtotalNgn ?? 0,
    byStatus,
  };
}

// Orders list with filters, search and pagination (newest first)
export async function listOrders(q: ListOrdersQuery) {
  const where: Prisma.OrderWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
    ...(q.type ? { type: q.type } : {}),
    // Search in reference, name, phone and email
    ...(q.q
      ? {
          OR: [
            { reference: { contains: q.q, mode: "insensitive" } },
            { customerName: { contains: q.q, mode: "insensitive" } },
            { customerEmail: { contains: q.q, mode: "insensitive" } },
            { customerPhone: { contains: q.q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return {
    items: rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      type: o.type,
      status: o.status,
      paymentStatus: o.paymentStatus,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      totalQuantity: o.totalQuantity,
      subtotalNgn: o.subtotalNgn,
      itemCount: o._count.items,
      createdAt: o.createdAt,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
}

// One order with everything the admin needs (null if it does not exist)
export async function getOrderDetail(id: string) {
  const o = await prisma.order.findUnique({
    where: { id },
    include: { items: true, user: { select: { name: true, email: true } } },
  });
  if (!o) return null;

  return {
    id: o.id,
    reference: o.reference,
    type: o.type,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentReference: o.paymentReference,
    paidAt: o.paidAt,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail,
    location: o.location,
    instructions: o.instructions,
    totalQuantity: o.totalQuantity,
    subtotalNgn: o.subtotalNgn,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    account: o.user, // the signed-in customer who placed it, or null for guests
    items: o.items.map((i) => ({
      id: i.id,
      productName: i.productNameSnapshot,
      category: i.categorySnapshot,
      color: i.color,
      sizeBreakdown: i.sizeBreakdown as Record<string, number>,
      quantity: i.quantity,
      unitPriceNgn: i.unitPriceNgn,
      footwearType: i.footwearType,
      designImageUrl: i.designImageUrl,
      colorNote: i.colorNote,
    })),
  };
}

// Change an order's status; returns false if the order does not exist
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<boolean> {
  try {
    await prisma.order.update({ where: { id }, data: { status } });
    return true;
  } catch (err) {
    if (prismaCode(err) === "P2025") return false;
    throw err;
  }
}
