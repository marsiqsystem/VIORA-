// Delivery dates from how the studio actually works (owner, 16 Sept 2026): orders
// placed before 8 pm IST are packed and shipped the same day, later orders the
// next working day. The studio is closed on Sundays. Transit is 5–7 business days
// (Sundays don't count). Shared by the product page, bag, checkout and success
// page — all times are IST whatever the shopper's or server's timezone.

export const DISPATCH_CUTOFF_HOUR = 20;
export const DISPATCH_CUTOFF_LABEL = "8 pm";
export const MIN_TRANSIT_BUSINESS_DAYS = 5;
export const MAX_TRANSIT_BUSINESS_DAYS = 7;

const IST_OFFSET_MINUTES = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A Date whose local fields (getHours, getDay…) read the IST wall clock. Only for
 * date maths and display — its epoch value is not the real instant.
 */
export const toIstClock = (d: Date = new Date()) =>
  new Date(d.getTime() + (d.getTimezoneOffset() + IST_OFFSET_MINUTES) * 60 * 1000);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Today's calendar date in IST, at midnight. */
export const istToday = (now: Date = new Date()) => startOfDay(toIstClock(now));

const isClosed = (d: Date) => d.getDay() === 0;

const addBusinessDays = (from: Date, days: number): Date => {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (!isClosed(d)) added++;
  }
  return d;
};

/** Ship day for an order placed at this IST wall-clock time (calendar date). */
const shipDayFromIstClock = (ist: Date): Date => {
  const d = startOfDay(ist);
  if (!isClosed(d) && ist.getHours() < DISPATCH_CUTOFF_HOUR) return d;
  do d.setDate(d.getDate() + 1);
  while (isClosed(d));
  return d;
};

export type DeliveryPlan = {
  /** Calendar dates (IST). */
  shipDay: Date;
  earliest: Date;
  latest: Date;
  shipsToday: boolean;
  /** Milliseconds left to make today's dispatch; 0 when it has already gone. */
  msToCutoff: number;
};

export const deliveryPlan = (now: Date = new Date()): DeliveryPlan => {
  const ist = toIstClock(now);
  const shipDay = shipDayFromIstClock(ist);
  const shipsToday = shipDay.getTime() === startOfDay(ist).getTime();
  const cutoff = new Date(startOfDay(ist));
  cutoff.setHours(DISPATCH_CUTOFF_HOUR);
  return {
    shipDay,
    earliest: addBusinessDays(shipDay, MIN_TRANSIT_BUSINESS_DAYS),
    latest: addBusinessDays(shipDay, MAX_TRANSIT_BUSINESS_DAYS),
    shipsToday,
    msToCutoff: shipsToday ? Math.max(0, cutoff.getTime() - ist.getTime()) : 0,
  };
};

export const formatDay = (d: Date) =>
  d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** "today", "tomorrow" or "Mon, 21 Sept", relative to the IST date of `now`. */
export const relativeDay = (d: Date, now: Date = new Date()) => {
  const diff = Math.round((startOfDay(d).getTime() - istToday(now).getTime()) / DAY_MS);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return formatDay(d);
};

/** e.g. "Mon, 21 Sept – Thu, 24 Sept". */
export const deliveryWindowLabel = (now: Date = new Date()) => {
  const { earliest, latest } = deliveryPlan(now);
  return `${formatDay(earliest)} – ${formatDay(latest)}`;
};

/** The latest expected delivery day, e.g. "Thu, 24 Sept". */
export const latestDeliveryLabel = (now: Date = new Date()) => formatDay(deliveryPlan(now).latest);
