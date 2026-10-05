import { Suspense } from "react";
import PaymentCallback from "@/components/payment/PaymentCallback";

export const metadata = { title: "Confirming payment" };

// useSearchParams() needs a Suspense boundary so the production build succeeds
export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <p className="text-center text-gray-600">
          Confirming your payment, please wait...
        </p>
      }
    >
      <PaymentCallback />
    </Suspense>
  );
}
