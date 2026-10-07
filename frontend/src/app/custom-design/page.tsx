import CustomDesignForm from "@/components/custom/CustomDesignForm";

export const metadata = { title: "Custom design" };

export default function CustomDesignPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">Request a custom design</h1>
      <p className="mt-3 text-muted">
        Tell us what you want made. Upload a photo or sketch, describe it, and
        choose your sizes. PFC will review your request and contact you with a
        price. You do not pay anything until you agree to it.
      </p>

      <div className="mt-8">
        <CustomDesignForm />
      </div>
    </div>
  );
}
