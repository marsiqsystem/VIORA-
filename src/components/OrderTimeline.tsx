// Flipkart / Amazon-style vertical order-tracking timeline.
//
// Pure presentational, server-renderable. Given the current stage index it
// draws four steps (Order Confirmed -> Shipped -> Out for Delivery ->
// Delivered): completed steps are solid green with a check, the current step is
// the maroon brand accent (pulsing), future steps are a hollow grey dot. The
// connecting rail fills green up to the current step.

export type OrderStageKey =
  | "CONFIRMED"
  | "SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELED";

export const ORDER_STAGES: { key: OrderStageKey; label: string; desc: string }[] = [
  { key: "CONFIRMED", label: "Order Confirmed", desc: "We've received your order and it's being packed." },
  { key: "SHIPPED", label: "Shipped", desc: "Your order has been handed to the courier." },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery", desc: "Your order is arriving today." },
  { key: "DELIVERED", label: "Delivered", desc: "Your order has been delivered. Enjoy!" },
];

const GREEN = "#1BA34A";
const MAROON = "#9B1B30";

const fmtDate = (d?: string | number | null) => {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

type Props = {
  /** Index into ORDER_STAGES the order has currently reached (0-3). */
  currentIndex: number;
  /** Optional per-stage timestamps, keyed by stage key. */
  timestamps?: Partial<Record<OrderStageKey, string | number | null>>;
  /** When true, the order is cancelled — renders a cancelled state instead. */
  canceled?: boolean;
};

const OrderTimeline = ({ currentIndex, timestamps = {}, canceled = false }: Props) => {
  if (canceled) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
        <div>
          <p className="font-semibold text-red-800">Order Cancelled</p>
          <p className="text-sm text-red-600">This order has been cancelled. Contact us if this looks wrong.</p>
        </div>
      </div>
    );
  }

  return (
    <ol className="relative">
      {ORDER_STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const isLast = i === ORDER_STAGES.length - 1;
        const railFilled = i < currentIndex; // segment BELOW this dot
        const ts = fmtDate(timestamps[stage.key]);

        return (
          <li key={stage.key} className="relative flex gap-4 pb-8 last:pb-0">
            {/* Rail connecting to the next dot */}
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-[2px]"
                style={{ backgroundColor: railFilled ? GREEN : "#E5E2DD" }}
              />
            )}

            {/* Dot */}
            <span
              className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                active ? "animate-pulse" : ""
              }`}
              style={{
                backgroundColor: done ? GREEN : active ? MAROON : "#FFFFFF",
                border: done || active ? "none" : "2px solid #D6D1CA",
                boxShadow: active ? `0 0 0 4px ${MAROON}22` : "none",
              }}
            >
              {done ? (
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : active ? (
                <span className="h-2.5 w-2.5 rounded-full bg-white" />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-[#D6D1CA]" />
              )}
            </span>

            {/* Text */}
            <div className="pt-1">
              <p
                className={`text-sm font-semibold ${
                  done || active ? "text-[#1A1410]" : "text-gray-400"
                }`}
              >
                {stage.label}
                {active && (
                  <span
                    className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: MAROON }}
                  >
                    Current
                  </span>
                )}
              </p>
              <p className={`mt-0.5 text-xs ${done || active ? "text-gray-600" : "text-gray-400"}`}>
                {stage.desc}
              </p>
              {ts && <p className="mt-1 text-[11px] font-medium text-gray-500">{ts}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default OrderTimeline;
