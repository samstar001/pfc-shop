import { Suspense } from "react";
import OrderView from "@/components/order/OrderView";

export const metadata = { title: "Order confirmation" };

// useSearchParams() needs a Suspense boundary so the production build succeeds
export default function OrderPage() {
  return (
    <Suspense fallback={<p className="text-gray-600">Loading your order...</p>}>
      <OrderView />
    </Suspense>
  );
}
