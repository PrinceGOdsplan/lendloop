"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isDemoSearch } from "@/lib/demo";
import { DemoAccess } from "./DemoAccess";

/**
 * Server-side `searchParams` can drop an empty `?demo=` in production, so the
 * browser's own query string is checked after mount as well.
 */
export function DemoSlot({ initial, fallback }: { initial: boolean; fallback: ReactNode }) {
  const [demo, setDemo] = useState(initial);
  useEffect(() => {
    // Reads the browser URL once after hydration; there is no external store to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initial && isDemoSearch(window.location.search)) setDemo(true);
  }, [initial]);
  return demo ? <DemoAccess /> : <>{fallback}</>;
}
