"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  className?: string;
  ariaLabel?: string;
}

const BackButton = ({
  className = "",
  ariaLabel = "Go back to previous page",
}: BackButtonProps) => {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label={ariaLabel}
      style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-primary border border-transparent hover:border-accent/30 hover:bg-white hover:text-accent hover:shadow-sm transition-all duration-300 cursor-pointer ${className}`}
    >
      <svg
        className="w-5 h-5"
        style={{ width: 20, height: 20 }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 19l-7-7 7-7"
        />
      </svg>
    </button>
  );
};

export default BackButton;
