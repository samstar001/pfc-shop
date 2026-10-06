import Link from "next/link";
import CartLink from "./CartLink";
import MobileNav from "./MobileNav";
import UserMenu from "./UserMenu";
import Image from "next/image";

// Main navigation links shown on every page
const links = [
  { href: "/shop", label: "Shop" },
  { href: "/custom-design", label: "Custom design" },
  { href: "/how-to-order", label: "How to order" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        {/* Brand / home link */}
        {/* Brand logo / home link */}
        <Link
          href="/"
          className="flex items-center gap-3"
          aria-label="PAT Footwear Collection, home"
        >
          <Image
            src="/logo.png"
            alt=""
            width={44}
            height={44}
            priority
            className="h-11 w-11"
          />
          <span className="hidden font-display text-lg font-extrabold leading-tight tracking-tight sm:block">
            PAT Footwear
          </span>
        </Link>

        {/* Page links (large screens) */}
        <nav className="ml-4 hidden gap-6 text-sm font-medium md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Cart, account and menu button */}
        <div className="ml-auto flex items-center gap-3">
          <CartLink />
          <UserMenu />
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  );
}
