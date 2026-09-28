"use client";

import { useSocialProof } from "@/hooks/useSocialProof";
import { SOCIAL_PROOF_MIN_ORDERS } from "@/lib/socialProof";

/** "🔥 N orders placed this week" — real counts, hidden below the threshold. */
const WeeklyOrders = ({ className = "" }: { className?: string }) => {
  const { weekOrders } = useSocialProof();
  if (weekOrders < SOCIAL_PROOF_MIN_ORDERS) return null;
  return (
    <p className={`text-xs font-semibold text-orange-700 ${className}`}>
      🔥 {weekOrders} orders placed this week
    </p>
  );
};

export default WeeklyOrders;
