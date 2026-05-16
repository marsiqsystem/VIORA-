const items = [
  {
    label: "Secure Payment",
    path: (
      <>
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <path d="M7 11V8a5 5 0 0 1 10 0v3" />
      </>
    ),
  },
  {
    label: "Fast Delivery",
    path: (
      <>
        <path d="M3 7h11v10H3z" />
        <path d="M14 10h4l3 3v4h-7" />
        <circle cx="7.5" cy="17.5" r="1.5" />
        <circle cx="17.5" cy="17.5" r="1.5" />
      </>
    ),
  },
  {
    label: "COD Available",
    path: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 12h.01M18 12h.01" />
      </>
    ),
  },
  {
    label: "48 Hrs Exchange",
    path: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </>
    ),
  },
];

const TrustBadges = () => {
  return (
    <div className="mt-2 grid grid-cols-2 gap-3 border-t border-[#1A1410]/10 pt-5 sm:grid-cols-4 sm:gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2.5 text-[#1A1410]/80"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 flex-shrink-0"
            aria-hidden="true"
          >
            {item.path}
          </svg>
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] sm:text-xs">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default TrustBadges;
