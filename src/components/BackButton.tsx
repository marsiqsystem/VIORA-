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
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-primary hover:bg-silver-light transition-colors cursor-pointer ${className}`}
    >
      <svg
        className="w-5 h-5"
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
