import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { ListMyOrdersQuery } from "./schema.js";

// Attach earlier guest orders to this account when the (Google-verified) email matches.
// NEVER throws: a problem here must not stop someone signing in.
export async function linkGuestOrders(
  user: Pick<User, "id" | "email">,
): Promise<number> {
  try {
    const result = await prisma.order.updateMany({
      where: {
        userId: null,
        customerEmail: { equals: user.email, mode: "insensitive" },
      },
      data: { userId: user.id },
    });
    if (result.count > 0)
      console.log(
        `[account] linked ${result.count} guest order(s) to ${user.email}`,
      );
    return result.count;
  } catch (err) {
    console.error("[account] could not link guest orders", err);
    return 0;
  }
}

// The signed-in customer's orders, newest first
export async function listMyOrders(userId: string, q: ListMyOrdersQuery) {
  const where = { userId };

  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        items: {
          select: { productNameSnapshot: true, color: true, quantity: true },
        },
      },
    }),
  ]);

  return {
    items: rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      type: o.type,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totalQuantity: o.totalQuantity,
      subtotalNgn: o.subtotalNgn,
      createdAt: o.createdAt,
      // True when the customer can still pay for this order online
      payable:
        o.type === "CATALOGUE" &&
        o.subtotalNgn != null &&
        o.paymentStatus !== "PAID" &&
        o.status !== "CANCELLED",
      lines: o.items.map((i) => ({
        productName: i.productNameSnapshot,
        color: i.color,
        quantity: i.quantity,
      })),
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
}

// Details to prefill at checkout: name and email from the account, phone and location from the latest order
export async function getCheckoutDefaults(user: User) {
  const last = await prisma.order.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { customerPhone: true, location: true },
  });

  return {
    name: user.name,
    email: user.email,
    phone: last?.customerPhone ?? "",
    location: last?.location ?? "",
  };
}
