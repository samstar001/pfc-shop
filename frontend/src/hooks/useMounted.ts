"use client";

import { useEffect, useState } from "react";

// True only after the component has mounted in the browser.
// The cart lives in localStorage, so we wait for this before showing it (avoids hydration mismatches).
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
