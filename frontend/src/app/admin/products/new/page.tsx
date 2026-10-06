import ProductForm from "@/components/admin/ProductForm";

// Empty form for a new product
export default function NewProductPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">New product</h1>
      <ProductForm />
    </div>
  );
}
