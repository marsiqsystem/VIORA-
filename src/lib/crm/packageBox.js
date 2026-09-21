// SINGLE SOURCE OF TRUTH for Viora's shipping box.
//
// Every courier (Velocity / Shiprocket / iThink) and the dashboard rate-compare
// read the parcel size + weight from HERE, so "no matter where an order is
// created, it uses the same measurement" — change it in ONE place and all three
// couriers + the rate quotes update together.
//
// Base (single-unit) values. LENGTH & BREADTH are constant. HEIGHT scales
// linearly with quantity (2 qty => double height). WEIGHT does NOT double — see
// parcelWeightKg below.
export const PACKAGE_BOX = {
  length: 16, // cm
  breadth: 6.5, // cm
  height: 3.5, // cm (per unit — height scales linearly with quantity)
  weight: 0.2, // kg = 200 g for the first unit (real ~117 g, padded for safety)
};

// Weight for EACH ADDITIONAL unit beyond the first (kg). We pad the first unit to
// 200 g for safety, then add 150 g per extra unit — so 2 qty = 350 g (NOT 400 g),
// 3 qty = 500 g, etc. (Real per-item weight is ~117 g.)
export const EXTRA_UNIT_WEIGHT_KG = 0.15;

/** Parcel weight (kg) for a given unit count: 200 g + 150 g × (units − 1). */
export function parcelWeightKg(units = 1) {
  const u = Math.max(1, Number(units) || 1);
  return Number((PACKAGE_BOX.weight + (u - 1) * EXTRA_UNIT_WEIGHT_KG).toFixed(3));
}

/** Parcel height (cm) for a given unit count: base height × units (linear). */
export function parcelHeightCm(units = 1) {
  const u = Math.max(1, Number(units) || 1);
  return Number((PACKAGE_BOX.height * u).toFixed(2));
}
