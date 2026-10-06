import Link from "next/link";

// Links grouped in the footer
const shop = [
  { href: "/shop", label: "Shop" },
  { href: "/custom-design", label: "Custom design" },
  { href: "/cart", label: "Cart" },
];
const help = [
  { href: "/how-to-order", label: "How to order" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        {/* About */}
        <div>
          <p className="font-display text-xl font-extrabold text-brand">PFC</p>
          <p className="mt-2 max-w-xs text-muted">
            PAT Footwear Collection. Choose your pair online and pay securely.
          </p>
        </div>

        {/* Shop links */}
        <nav aria-label="Shop">
          <p className="font-semibold">Shop</p>
          <ul className="mt-3 space-y-2">
            {shop.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Help links */}
        <nav aria-label="Help">
          <p className="font-semibold">Help</p>
          <ul className="mt-3 space-y-2">
            {help.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} PAT Footwear Collection (PFC)
      </p>
    </footer>
  );
}
