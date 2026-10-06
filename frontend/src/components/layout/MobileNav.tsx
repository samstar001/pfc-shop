"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Menu button and drop-down links for small screens
export default function MobileNav({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  // The menu counts as open only on the page where it was opened, so it closes after a link is tapped
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <div className="md:hidden">
      {/* Menu button */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpenOn(open ? null : pathname)}
        className="btn-secondary px-3 py-2 text-sm"
      >
        {open ? "Close" : "Menu"}
      </button>

      {/* Links */}
      {open && (
        <nav
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-line bg-white px-4 py-3 shadow-sm"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block rounded-md px-2 py-3 font-medium hover:bg-page"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
