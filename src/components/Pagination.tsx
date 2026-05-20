import Link from "next/link";

const Pagination = ({
  currentPage,
  hasPrev,
  hasNext,
  searchParams,
}: {
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  searchParams?: Record<string, string | string[] | undefined>;
}) => {
  const createPageUrl = (pageNumber: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParams || {}).forEach(([key, value]) => {
      if (value === undefined || key === "page") return;
      if (Array.isArray(value)) {
        value.forEach((entry) => params.append(key, entry));
      } else {
        params.set(key, value);
      }
    });
    params.set("page", pageNumber.toString());
    return `/list?${params.toString()}#product-grid`;
  };

  const buttonClass =
    "rounded-lg bg-primary text-white px-6 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-primary-light hover:shadow-md";
  const disabledClass =
    "rounded-lg bg-silver-muted px-6 py-2.5 text-sm font-medium text-gray-400 cursor-not-allowed";

  return (
    <div className="mt-12 flex justify-between w-full">
      {hasPrev ? (
        <Link href={createPageUrl(currentPage - 1)} className={buttonClass}>
          Previous
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Previous
        </span>
      )}

      {hasNext ? (
        <Link href={createPageUrl(currentPage + 1)} className={buttonClass}>
          Next
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Next
        </span>
      )}
    </div>
  );
};

export default Pagination;
