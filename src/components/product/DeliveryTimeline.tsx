"use client";

import { useEffect, useState } from "react";
import {
  DISPATCH_CUTOFF_LABEL,
  deliveryPlan,
  formatDay,
  relativeDay,
  type DeliveryPlan,
} from "@/lib/deliveryEstimate";

const STEP_ICONS = {
  ordered: "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2",
  shipped:
    "M3 7h11v10H3zM14 10h4l3 3v4h-7M7.5 19.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 19.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  delivered: "M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8",
};

const timeLeft = (ms: number) => {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return `${h} ${h === 1 ? "hr" : "hrs"}${m ? ` ${m} min` : ""}`;
};

const shortDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const Step = ({ icon, label, when }: { icon: string; label: string; when: string }) => (
  <li className="relative z-10 flex flex-col items-center text-center">
    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-silver-light bg-white text-primary">
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={icon} />
      </svg>
    </span>
    <span className="mt-1.5 text-xs font-semibold text-primary">{label}</span>
    <span className="text-[11px] leading-tight text-gray-500">{when}</span>
  </li>
);

/**
 * "Order within 3 hrs 12 min and it ships today" + Ordered → Shipped → Delivered
 * with real dates. The countdown is the real 8 pm IST dispatch cutoff (closed
 * Sundays), so it never resets into fake urgency. Client-only: it needs the clock.
 */
const DeliveryTimeline = () => {
  const [plan, setPlan] = useState<DeliveryPlan | null>(null);

  useEffect(() => {
    const tick = () => setPlan(deliveryPlan());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!plan) return <div className="min-h-[124px]" aria-hidden="true" />;

  const shipWhen = relativeDay(plan.shipDay);
  const delivered =
    plan.earliest.getMonth() === plan.latest.getMonth()
      ? `${plan.earliest.getDate()}–${shortDay(plan.latest)}`
      : `${shortDay(plan.earliest)} – ${shortDay(plan.latest)}`;

  return (
    <div className="min-h-[124px]">
      <p className="text-sm text-gray-700">
        {plan.shipsToday ? (
          <>
            Order within <strong className="text-accent">{timeLeft(plan.msToCutoff)}</strong> and it ships{" "}
            <strong className="text-primary">today</strong>
          </>
        ) : (
          <>
            Order now and it ships <strong className="text-primary">{shipWhen}</strong>
            <span className="block text-xs text-gray-500">
              Orders before {DISPATCH_CUTOFF_LABEL} ship the same day, Monday to Saturday
            </span>
          </>
        )}
      </p>
      <ol className="relative mt-3 grid grid-cols-3">
        <span
          className="absolute left-[16.5%] right-[16.5%] top-[22px] border-t border-dashed border-gray-300"
          aria-hidden="true"
        />
        <Step icon={STEP_ICONS.ordered} label="Ordered" when="Today" />
        <Step
          icon={STEP_ICONS.shipped}
          label="Shipped"
          when={plan.shipsToday ? "Today" : shipWhen === "tomorrow" ? "Tomorrow" : formatDay(plan.shipDay)}
        />
        <Step icon={STEP_ICONS.delivered} label="Delivered" when={delivered} />
      </ol>
    </div>
  );
};

export default DeliveryTimeline;
