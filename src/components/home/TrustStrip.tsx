import Image from "next/image";
import { TRUST_ICONS } from "@/data/homeAssets";
import { PREPAID_DISCOUNT } from "@/lib/checkoutPricing";

const icon = (d: string) => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

// Only promises that are true for every order.
const ITEMS = [
  { key: "cod", title: "Cash on Delivery", sub: "Pay when it arrives", path: "M3 7h18v10H3zM7 12h.01M17 12h.01M12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" },
  { key: "delivery", title: "FREE delivery", sub: `+ ₹${PREPAID_DISCOUNT} off paying online`, path: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z" },
  { key: "exchange", title: "48-hour exchange", sub: "On damaged or wrong pieces", path: "M4 8h13l-3-3M20 16H7l3 3" },
  { key: "secure", title: "Secure payments", sub: "UPI, cards via Razorpay", path: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zM9 12l2 2 4-4" },
  { key: "packed", title: "Hand-checked", sub: "Packed with care in Kolkata", path: "M4 9h16v11H4zM2 5h20v4H2zM12 5v15M12 5c-1.5-3-5-3-5 0M12 5c1.5-3 5-3 5 0" },
] as const;

const TrustStrip = () => (
  <section aria-label="Why shop with Viora" className="border-b border-silver-light bg-white">
    <ul className="scrollbar-hide flex snap-x gap-6 overflow-x-auto px-4 py-4 md:justify-between md:px-6 lg:px-8">
      {ITEMS.map((item) => {
        const custom = TRUST_ICONS[item.key];
        return (
          <li key={item.key} className="flex shrink-0 snap-start items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-accent/5 text-accent">
              {custom ? <Image src={custom} alt="" width={24} height={24} /> : icon(item.path)}
            </span>
            <span className="leading-tight">
              <span className="block text-[13px] font-semibold text-primary">{item.title}</span>
              <span className="block text-[11px] text-gray-500">{item.sub}</span>
            </span>
          </li>
        );
      })}
    </ul>
  </section>
);

export default TrustStrip;
