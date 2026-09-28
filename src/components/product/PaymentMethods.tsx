import type { ReactNode } from "react";

// What checkout really accepts: Razorpay (UPI apps, RuPay/Visa/Mastercard cards)
// and cash on delivery. Wordmark chips, so no external logo files to load.

const Chip = ({ label, children }: { label: string; children: ReactNode }) => (
  <li
    aria-label={label}
    title={label}
    className="flex h-7 items-center justify-center rounded border border-gray-200 bg-white px-2 text-[11px] font-bold leading-none"
  >
    {children}
  </li>
);

const PaymentMethods = ({ className = "" }: { className?: string }) => (
  <div className={className}>
    <ul className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:justify-center" aria-label="Payment methods">
      <Chip label="UPI">
        <span className="italic text-gray-700">UPI</span>
        <svg className="ml-0.5 h-2.5 w-2" viewBox="0 0 8 10" aria-hidden="true">
          <path d="M0 0l5 5-5 5z" fill="#F47A20" />
          <path d="M3 0l5 5-5 5z" fill="#097939" />
        </svg>
      </Chip>
      <Chip label="Google Pay">
        <span className="text-[#4285F4]">G</span>
        <span className="ml-0.5 font-semibold text-gray-600">Pay</span>
      </Chip>
      <Chip label="PhonePe">
        <span className="text-[#5F259F]">PhonePe</span>
      </Chip>
      <Chip label="Paytm">
        <span className="text-[#002E6E]">Pay</span>
        <span className="text-[#00BAF2]">tm</span>
      </Chip>
      <Chip label="RuPay">
        <span className="italic text-[#1B3281]">Ru</span>
        <span className="italic text-[#F47A20]">Pay</span>
      </Chip>
      <Chip label="Visa">
        <span className="italic tracking-tight text-[#1A1F71]">VISA</span>
      </Chip>
      <Chip label="Mastercard">
        <svg className="h-4 w-6" viewBox="0 0 24 16" aria-hidden="true">
          <circle cx="9" cy="8" r="6" fill="#EB001B" />
          <circle cx="15" cy="8" r="6" fill="#F79E1B" fillOpacity="0.9" />
        </svg>
      </Chip>
      <Chip label="Cash on delivery">
        <span className="text-green-700">COD</span>
      </Chip>
    </ul>
    <p className="mt-1.5 text-center text-[11px] text-gray-500">
      Secure checkout by Razorpay · or pay cash on delivery
    </p>
  </div>
);

export default PaymentMethods;
