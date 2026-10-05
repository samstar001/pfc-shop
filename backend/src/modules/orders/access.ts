import type { Order, User } from "@prisma/client";
import { verifyOrderToken } from "../../lib/orderToken.js";

// An order can be used by: someone holding its token, the signed-in owner, or an admin
export async function canAccessOrder(
  order: Pick<Order, "id" | "userId">,
  token: string | null | undefined,
  user?: User,
): Promise<boolean> {
  if (token && (await verifyOrderToken(token)) === order.id) return true;
  if (user && (user.id === order.userId || user.role === "ADMIN")) return true;
  return false;
}
