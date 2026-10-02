import Link from "next/link";

// Main navigation links shown on every page
const links = [
  { href: "/shop", label: "Shop" },
  { href: "/custom-design", label: "Custom Design" },
  { href: "/how-to-order", label: "How to Order" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        {/* Brand / home link */}
        <Link href="/" className="text-lg font-bold tracking-tight">
          PFC
        </Link>

        {/* Page links */}
        <nav className="flex flex-wrap gap-4 text-sm text-gray-700">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-black">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
