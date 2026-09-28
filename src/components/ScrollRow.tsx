"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Classes for the scrolling element (flex, gap, overflow-x-auto, snap…). */
  className?: string;
  as?: "div" | "ul";
  /** Arrow colours for dark sections. */
  tone?: "light" | "dark";
  ariaLabel?: string;
};

/** Pixels the mouse must move before a press counts as a drag, not a click. */
const DRAG_THRESHOLD = 6;

/**
 * A horizontal row that works with a mouse as well as a finger: prev/next
 * arrows (shown only while there is more to see, on screens md and up) and
 * click-and-drag scrolling. Touch keeps native swipe; a drag never fires the
 * link or button it started on.
 */
const ScrollRow = ({ children, className = "", as = "div", tone = "light", ariaLabel }: Props) => {
  const ref = useRef<HTMLElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const drag = useRef({ down: false, moved: false, startX: 0, startLeft: 0, pointerId: 0 });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [update]);

  const step = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !ref.current) return;
    drag.current = { down: true, moved: false, startX: e.clientX, startLeft: ref.current.scrollLeft, pointerId: e.pointerId };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    const d = drag.current;
    if (!d.down || !el) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      d.moved = true;
      // Capture only once it's a real drag, so plain clicks still reach links.
      el.setPointerCapture(d.pointerId);
      el.style.scrollSnapType = "none";
      el.style.scrollBehavior = "auto";
      el.style.cursor = "grabbing";
    }
    el.scrollLeft = d.startLeft - dx;
  };

  const endDrag = () => {
    const el = ref.current;
    const d = drag.current;
    if (!d.down) return;
    d.down = false;
    if (!el || !d.moved) return;
    if (el.hasPointerCapture(d.pointerId)) el.releasePointerCapture(d.pointerId);
    el.style.cursor = "";
    el.style.scrollBehavior = "";
    // Let snapping settle on the nearest card again.
    el.style.scrollSnapType = "";
  };

  // A drag ends with a click on whatever was under the mouse — swallow it.
  const onClickCapture = (e: React.MouseEvent<HTMLElement>) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  const Tag = as;
  const arrow =
    tone === "dark"
      ? "bg-white/90 text-primary hover:bg-white"
      : "border border-gray-200 bg-white text-primary shadow-md hover:bg-platinum";

  return (
    <div className="relative">
      <Tag
        ref={ref as any}
        className={className}
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(e: React.DragEvent) => e.preventDefault()}
      >
        {children}
      </Tag>
      {[
        { dir: -1 as const, show: canLeft, label: "Scroll left", pos: "left-1", path: "M15 19l-7-7 7-7" },
        { dir: 1 as const, show: canRight, label: "Scroll right", pos: "right-1", path: "M9 5l7 7-7 7" },
      ].map((a) => (
        <button
          key={a.dir}
          type="button"
          onClick={() => step(a.dir)}
          aria-label={a.label}
          tabIndex={a.show ? 0 : -1}
          className={`absolute ${a.pos} top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-opacity md:flex ${arrow} ${
            a.show ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={a.path} />
          </svg>
        </button>
      ))}
    </div>
  );
};

export default ScrollRow;
