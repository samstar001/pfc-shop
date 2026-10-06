import Link from "next/link";

// Big opening panel on the home page: the one bold moment in the design
export default function Hero() {
  return (
    <section className="rounded-3xl bg-brand px-6 py-14 text-white sm:px-12 sm:py-20">
      <h1 className="max-w-3xl font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
        Find your next pair.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-white/85">
        Browse the collection, pick your size and colour, and pay securely
        online. We confirm your delivery fee after you order.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/shop"
          className="inline-flex rounded-lg bg-white px-5 py-3 font-semibold text-brand hover:bg-brand-soft"
        >
          Shop the collection
        </Link>
        <Link
          href="/custom-design"
          className="inline-flex rounded-lg border border-white/60 px-5 py-3 font-semibold hover:bg-white/10"
        >
          Request a custom design
        </Link>
      </div>
    </section>
  );
}
