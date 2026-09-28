// Real order counts from the dashboard's order store, used as social proof.
// Thresholds keep small numbers (which read as weak, and reveal volumes) hidden.

/** Show "N orders placed this week" only from this many orders. */
export const SOCIAL_PROOF_MIN_ORDERS = 5;
/** Show "Ordered N times this week" on a product only from this many orders. */
export const PRODUCT_PROOF_MIN = 3;

export type SocialProof = {
  weekOrders: number;
  byProduct: Record<string, number>;
};

export const EMPTY_SOCIAL_PROOF: SocialProof = { weekOrders: 0, byProduct: {} };
