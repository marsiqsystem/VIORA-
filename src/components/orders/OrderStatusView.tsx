import Image from "next/image";
import Link from "next/link";
import OrderTimeline, { ORDER_STAGES } from "@/components/OrderTimeline";
import { COD_CHARGE, REVIEW_REWARD } from "@/lib/checkoutPricing";
import { whatsappLink } from "@/lib/contact";
import type { OrderStatus } from "@/lib/orderStatus";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

type Props = {
  status: OrderStatus;
  /** Members see the full street address; verified guests see city + pincode only. */
  showFullAddress: boolean;
  backHref: string;
  backLabel: string;
};

/** One order: live courier timeline, items, delivery, payment and help. */
const OrderStatusView = ({ status, showFullAddress, backHref, backLabel }: Props) => {
  const placedOn = new Date(status.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const label = status.canceled ? "Cancelled" : ORDER_STAGES[status.stageIndex].label;
  const delivered = !status.canceled && status.stageIndex === 3;
  const toPay = status.paymentMode === "COD" && !status.paid;
  const help = whatsappLink(`Hi Viora, I have a question about my order #${status.number}`);
  const exchangeHelp = whatsappLink(`Hi Viora, I'd like to request an exchange for order #${status.number}`);

  return (
    <div className="min-h-screen bg-platinum text-primary">
      <section className="px-4 pb-16 pt-5 md:px-6 md:pt-10 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-accent">
            <span aria-hidden="true">←</span> {backLabel}
          </Link>

          <div className="bg-white p-5 shadow-sm md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent">Order tracking</p>
                <h1 className="mt-1 font-playfair text-3xl font-bold">#{status.number}</h1>
                <p className="mt-1 text-xs text-gray-500">Placed on {placedOn}</p>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                  status.canceled
                    ? "border-red-200 bg-red-100 text-red-800"
                    : delivered
                      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                      : "border-amber-200 bg-amber-100 text-amber-800"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {label}
              </span>
            </div>

            <div className="mt-6">
              <OrderTimeline currentIndex={status.stageIndex} timestamps={{ CONFIRMED: status.placedAt }} canceled={status.canceled} />
            </div>

            {!status.canceled && status.stageIndex === 0 && (
              <p className="mt-4 flex items-start gap-2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span aria-hidden="true">📞</span>
                <span>
                  Our team will call you to confirm this order before dispatch — please keep your phone reachable so it ships without delay.
                </span>
              </p>
            )}

            {status.edd && (
              <p className="mt-4 text-sm text-gray-700">
                Expected delivery: <b className="text-primary">{status.edd}</b>
              </p>
            )}

            {status.latestUpdate && (
              <p className="mt-4 bg-platinum px-4 py-3 text-xs text-gray-600">
                <span className="font-semibold text-primary">Latest update: </span>
                {status.latestUpdate}
              </p>
            )}

            {status.trackUrl ? (
              <a
                href={status.trackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-white hover:bg-accent"
              >
                Live track on courier
                {status.trackingNumber && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">AWB {status.trackingNumber}</span>}
              </a>
            ) : (
              !status.canceled && (
                <p className="mt-5 border border-dashed border-gray-300 px-4 py-3 text-center text-xs text-gray-500">
                  Live courier tracking appears here once your order ships — we&apos;ll also send the link on WhatsApp.
                </p>
              )
            )}
          </div>

          {toPay && !status.canceled && (
            <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Cash on Delivery: keep <b>{inr(status.amount)}</b> ready for the courier.
            </div>
          )}

          {status.items.length > 0 && (
            <div className="bg-white p-5 shadow-sm">
              <h2 className="font-playfair text-lg font-bold">Items</h2>
              <ul className="mt-2 divide-y divide-silver-light">
                {status.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-3 py-3">
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden bg-platinum">
                      {item.image && <Image src={item.image} alt="" fill sizes="56px" className="object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block text-xs text-gray-500">{[item.variant, `Qty ${item.quantity}`].filter(Boolean).join(" · ")}</span>
                    </span>
                    {item.price ? <span className="text-sm font-semibold">{inr(item.price)}</span> : null}
                  </li>
                ))}
                {status.giftWrap && <li className="py-3 text-sm">🎁 Premium gift wrap included</li>}
              </ul>
              {status.paymentMode === "COD" && (
                <p className="flex justify-between border-t border-silver-light pt-2 text-sm text-gray-600">
                  <span>Delivery + COD charge</span>
                  <span>₹{COD_CHARGE}</span>
                </p>
              )}
              <p className="mt-2 flex items-center justify-between border-t border-silver-light pt-3">
                <span className="text-sm text-gray-600">{toPay ? "To pay on delivery" : "Paid"}</span>
                <span className="font-playfair text-xl font-bold">{inr(status.amount)}</span>
              </p>
            </div>
          )}

          <div className="bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-500">Delivering to</p>
            <p className="mt-2 text-sm font-medium">{status.firstName || "You"}</p>
            <p className="mt-1 text-sm text-gray-600">
              {(showFullAddress
                ? [status.address.line1, status.address.city, status.address.state, status.address.postalCode]
                : [status.address.city, status.address.postalCode]
              )
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
          </div>

          {delivered && (
            <div className="bg-accent p-5 text-white">
              <p className="text-lg font-bold">Loving it? Share a photo review, get ₹{REVIEW_REWARD.amount} off</p>
              <p className="mt-1 text-sm text-white/85">
                Post a photo on the product page (logged in) — the code works on your next order of ₹{REVIEW_REWARD.minimum}+.
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href={help}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[48px] items-center justify-center border border-green-600 bg-white text-sm font-semibold text-green-700 hover:bg-green-50"
            >
              💬 Questions? WhatsApp us
            </a>
            {delivered ? (
              <a
                href={exchangeHelp}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[48px] items-center justify-center border border-gray-300 bg-white text-sm font-semibold text-primary hover:border-accent"
              >
                Damaged or wrong piece? Exchange
              </a>
            ) : (
              <Link href="/list" className="flex min-h-[48px] items-center justify-center bg-primary text-sm font-bold uppercase tracking-wider text-white hover:bg-accent">
                Continue shopping
              </Link>
            )}
          </div>
          <p className="text-center text-xs text-gray-500">
            Exchanges for damaged or wrong pieces within 48 hours of delivery —{" "}
            <Link href="/exchange-policy" className="font-semibold text-accent hover:underline">
              see the policy
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
};

export default OrderStatusView;
