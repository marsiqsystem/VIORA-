"use client";

import { useRouter } from "next/navigation";
import { trackSearch } from "@/lib/metaPixel";

type Props = {
  variant?: "desktop" | "mobile";
  onSubmit?: () => void;
};

const PLACEHOLDER = "Search for necklaces, rings, earrings...";

const SearchBar = ({ variant = "desktop", onSubmit }: Props) => {
  const router = useRouter();

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = (formData.get("q") as string)?.trim();
    if (q) {
      trackSearch(q);
      router.push(`/list?q=${encodeURIComponent(q)}`);
      onSubmit?.();
    }
  };

  if (variant === "mobile") {
    return (
      <form
        onSubmit={handleSearch}
        className="relative flex w-full items-center"
        role="search"
      >
        <input
          type="text"
          name="q"
          placeholder={PLACEHOLDER}
          aria-label="Search the Viora catalogue"
          className="w-full rounded-full bg-gray-100 px-4 py-2 pr-11 text-sm font-medium text-[#1A1410] placeholder:text-gray-500 outline-none transition focus:bg-white focus:ring-2 focus:ring-[#9B1B30]/30 min-h-[44px]"
        />
        <button
          type="submit"
          aria-label="Submit search"
          className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#1A1410] hover:bg-white/60 transition-colors min-h-[44px] min-w-[44px]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSearch}
      className="relative flex w-64 items-center"
      role="search"
    >
      <input
        type="text"
        name="q"
        placeholder={PLACEHOLDER}
        aria-label="Search the Viora catalogue"
        className="w-64 rounded-full border border-gray-300 bg-transparent px-4 py-1.5 pr-10 text-sm font-medium text-[#1A1410] placeholder:text-gray-500 outline-none transition focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
      />
      <button
        type="submit"
        aria-label="Submit search"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full text-[#1A1410] hover:bg-silver-light transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    </form>
  );
};

export default SearchBar;
