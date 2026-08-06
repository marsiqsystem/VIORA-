"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

// The admin overlays (/inbox, /broadcast) are full-screen position:fixed panels
// with their OWN scroll containers (chat list, thread, modals). Lenis hijacks
// the window's wheel events globally, which makes scrolling inside those panels
// (e.g. the send-template modal) move the background instead. So we skip Lenis
// entirely on these routes and let native scrolling work.
const NO_SMOOTH = ["/inbox", "/broadcast"];

export default function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (NO_SMOOTH.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return; // native scrolling on the admin overlays
    }
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      touchMultiplier: 2,
    });

    let rafId = 0;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [pathname]);

  return null;
}
