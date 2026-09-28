"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SHOP_SORTS, type ShopSort } from "@/lib/shopSorts";

/** Native select: the phone's own picker is the fastest sort UI there is. */
const SortSelect = ({ value, defaultSort }: { value: ShopSort; defaultSort: ShopSort }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (next === defaultSort) params.delete("sort");
    else params.set("sort", next);
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  return (
    <label className="relative flex shrink-0 items-center">
      <span className="sr-only">Sort products</span>
      <svg className="pointer-events-none absolute left-2.5 h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h13M3 12h9M3 17h5M17 10v10m0 0l-3-3m3 3l3-3" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-full border border-gray-300 bg-white py-0 pl-8 pr-7 text-[13px] font-semibold text-primary outline-none focus:border-accent"
      >
        {SHOP_SORTS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2.5 h-3 w-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </label>
  );
};

export default SortSelect;
