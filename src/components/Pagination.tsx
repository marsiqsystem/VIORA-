"use client";

import { usePathname, useSearchParams } from "next/navigation";

const Pagination = ({
  currentPage,
  hasPrev,
  hasNext,
}: {
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
}) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createPageUrl = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", pageNumber.toString());
    // Navigate to the new page URL with #product-grid hash so the browser
    // scrolls directly to the product section instead of the top of the page.
    const url = `${pathname}?${params.toString()}#product-grid`;
    window.location.href = url;
  };

  return (
    <div className="mt-12 flex justify-between w-full">
      <button
        className="rounded-lg bg-primary text-white px-6 py-2.5 text-sm font-medium cursor-pointer transition-all duration-200 hover:bg-primary-light hover:shadow-md disabled:cursor-not-allowed disabled:bg-silver-muted disabled:text-gray-400"
        disabled={!hasPrev}
        onClick={() => createPageUrl(currentPage - 1)}
      >
        Previous
      </button>
      <button
        className="rounded-lg bg-primary text-white px-6 py-2.5 text-sm font-medium cursor-pointer transition-all duration-200 hover:bg-primary-light hover:shadow-md disabled:cursor-not-allowed disabled:bg-silver-muted disabled:text-gray-400"
        disabled={!hasNext}
        onClick={() => createPageUrl(currentPage + 1)}
      >
        Next
      </button>
    </div>
  );
};

export default Pagination;
