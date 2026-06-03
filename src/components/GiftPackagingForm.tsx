"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useWixClient } from "@/hooks/useWixClient";
import { useCartStore } from "@/hooks/useCartStore";
import { useRouter } from "next/navigation";
import { trackMetaEvent } from "@/lib/metaEvents";

export type GiftableProduct = {
  id: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  variantId: string;
};

const PACKAGING_FEE = 79;
const PLACEHOLDER_VARIANT = "00000000-0000-0000-0000-000000000000";

const COLORS: { id: string; label: string; swatch: string; ring: string }[] = [
  { id: "Red", label: "Red", swatch: "#9B1B30", ring: "ring-[#9B1B30]" },
  { id: "Blue", label: "Blue", swatch: "#1B3A6B", ring: "ring-[#1B3A6B]" },
  { id: "Green", label: "Green", swatch: "#0F5C3A", ring: "ring-[#0F5C3A]" },
  { id: "Silver", label: "Silver", swatch: "#C0C0C0", ring: "ring-[#8C8C8C]" },
  { id: "Golden", label: "Golden", swatch: "#D4AF37", ring: "ring-[#D4AF37]" },
];

const RIBBONS = ["Heart Shape", "Flower Knot", "Classic Bow"] as const;
const RECIPIENTS = ["Partner", "Mother", "Sister", "Friend", "Colleague", "Self"] as const;

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const GiftPackagingForm = ({ products }: { products: GiftableProduct[] }) => {
  const wixClient = useWixClient();
  const router = useRouter();
  const { getCart } = useCartStore();

  const [selectedId, setSelectedId] = useState<string>(products[0]?.id ?? "");
  const [color, setColor] = useState<string>(COLORS[0].id);
  const [ribbon, setRibbon] = useState<(typeof RIBBONS)[number]>(RIBBONS[0]);
  const [recipient, setRecipient] = useState<(typeof RECIPIENTS)[number]>(RECIPIENTS[0]);
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId),
    [products, selectedId]
  );

  const colorMeta = COLORS.find((c) => c.id === color) ?? COLORS[0];

  const productPrice = selected?.price ?? 0;
  const total = productPrice + PACKAGING_FEE;

  const handleCheckout = async () => {
    if (!selected || submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      await wixClient.currentCart.addToCurrentCart({
        lineItems: [
          {
            catalogReference: {
              appId: "215238eb-22a5-4c36-9e7b-e7c08025e04e",
              catalogItemId: selected.id,
              options: {
                variantId: PLACEHOLDER_VARIANT,
                customTextFields: {
                  "Gift Packaging": "Premium Gift Packaging",
                  "Packaging Color": color,
                  "Ribbon Shape": ribbon,
                  "Recipient": recipient,
                  "Personal Note": note || "—",
                },
              },
            },
            quantity: 1,
          },
        ],
        customLineItems: [
          {
            price: String(PACKAGING_FEE),
            quantity: 1,
            productName: { original: "Premium Gift Packaging" },
            itemType: { preset: "SERVICE" },
            descriptionLines: [
              {
                name: { original: "Color" },
                plainText: { original: color },
              },
              {
                name: { original: "Ribbon" },
                plainText: { original: ribbon },
              },
              {
                name: { original: "For" },
                plainText: { original: recipient },
              },
              ...(note
                ? [
                    {
                      name: { original: "Note" },
                      plainText: { original: note },
                    },
                  ]
                : []),
            ] as any,
          },
        ],
      } as any);

      await getCart(wixClient);

      const eventData = {
        currency: "INR",
        value: total,
        content_ids: [selected.id],
        content_name: `${selected.name} with gift packaging`,
        content_type: "product",
        contents: [
          { id: selected.id, quantity: 1, item_price: productPrice },
          { id: "premium-gift-packaging", quantity: 1, item_price: PACKAGING_FEE },
        ],
        num_items: 2,
      };

      trackMetaEvent("CustomizeProduct", {
        ...eventData,
        content_name: `Gift packaging: ${color}, ${ribbon}, ${recipient}`,
      });
      trackMetaEvent("AddToCart", eventData);
      trackMetaEvent("InitiateCheckout", eventData);

      router.push("/checkout");
      return;
    } catch (e: any) {
      console.error("Gift packaging checkout failed:", e);
      setError(
        "We couldn't add the gift packaging to your cart. Please try again or contact us."
      );
    }
    setSubmitting(false);
  };

  return (
    <div className="bg-platinum text-primary">
      <section className="px-4 pt-10 pb-6 md:px-8 md:pt-14 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mx-auto max-w-6xl text-center">
          <span className="inline-block rounded-full bg-[#9B1B30]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#9B1B30]">
            Premium Gift Service
          </span>
          <h1 className="mt-4 font-playfair text-3xl md:text-5xl font-bold leading-tight text-[#1A1410]">
            Customize Your Gift Packaging
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm md:text-base text-gray-600">
            Every Viora piece arrives in our signature jewelry packaging. Add
            custom wrapping, a decorative ribbon shape, and a handwritten note
            for just {formatINR(PACKAGING_FEE)}.
          </p>
        </div>
      </section>

      <section className="px-4 pb-20 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 lg:gap-12">
          {/* LEFT COLUMN — Visuals + Catalog */}
          <div className="space-y-6">
            <div
              className="relative aspect-square w-full overflow-hidden rounded-2xl border border-silver-light shadow-premium transition-colors"
              style={{
                background: `linear-gradient(135deg, ${colorMeta.swatch} 0%, ${colorMeta.swatch}cc 60%, #1A1410 100%)`,
              }}
            >
              {selected && (
                <Image
                  src={selected.image}
                  alt={selected.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain p-12 mix-blend-luminosity opacity-90"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-6 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-silver-light">
                  Live preview
                </p>
                <p className="font-playfair text-xl">
                  {color} wrap &middot; {ribbon}
                </p>
              </div>
              <span
                aria-hidden
                className="absolute right-5 top-5 flex h-12 w-12 items-center justify-center rounded-full bg-white/85 text-[#9B1B30] shadow-lg backdrop-blur"
                title={`${ribbon} accent`}
              >
                {ribbon === "Heart Shape" ? (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21s-7.5-4.6-9.5-9.2A5.3 5.3 0 0 1 12 5.3a5.3 5.3 0 0 1 9.5 6.5C19.5 16.4 12 21 12 21z" />
                  </svg>
                ) : ribbon === "Flower Knot" ? (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="6" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="12" r="3" />
                    <circle cx="12" cy="18" r="3" />
                    <circle cx="12" cy="12" r="2" fill="#fff" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 12c2-3 5-4 9-4s7 1 9 4c-2 3-5 4-9 4s-7-1-9-4z" />
                    <rect x="10.5" y="10" width="3" height="4" rx="0.5" fill="#fff" />
                  </svg>
                )}
              </span>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-playfair text-xl font-bold text-[#1A1410]">
                  Pick one piece to gift
                </h2>
                <span className="text-xs uppercase tracking-wider text-gray-500">
                  {products.length} pieces
                </span>
              </div>
              <div className="hide-scrollbar grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                {products.map((p) => {
                  const isActive = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`group relative overflow-hidden rounded-xl border-2 bg-white p-2 text-left transition-all ${
                        isActive
                          ? "border-[#9B1B30] shadow-silver"
                          : "border-silver-light hover:border-[#9B1B30]/40"
                      }`}
                    >
                      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-platinum">
                        <Image
                          src={p.image}
                          alt={p.name}
                          fill
                          sizes="(max-width: 640px) 50vw, 16vw"
                          className="object-cover transition-transform group-hover:scale-105"
                        />
                      </div>
                      <p className="mt-2 line-clamp-1 text-xs font-medium text-[#1A1410]">
                        {p.name}
                      </p>
                      <p className="text-[11px] font-semibold text-[#9B1B30]">
                        {formatINR(p.price)}
                      </p>
                      {isActive && (
                        <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#9B1B30] text-[10px] font-bold text-white">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN — Form */}
          <div className="space-y-7 rounded-2xl border border-silver-light bg-white/70 p-6 md:p-8 shadow-premium">
            {/* Color */}
            <div>
              <h3 className="mb-3 font-playfair text-lg font-bold text-[#1A1410]">
                Select Packaging Color
              </h3>
              <div className="flex flex-wrap gap-3">
                {COLORS.map((c) => {
                  const active = c.id === color;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setColor(c.id)}
                      className={`group flex items-center gap-3 rounded-full border px-4 py-2 transition-all ${
                        active
                          ? "border-[#9B1B30] bg-[#9B1B30]/5"
                          : "border-silver-light hover:border-[#9B1B30]/40"
                      }`}
                    >
                      <span
                        className={`h-6 w-6 rounded-full border border-black/10 ring-2 ring-offset-2 transition-all ${
                          active ? c.ring : "ring-transparent"
                        }`}
                        style={{ backgroundColor: c.swatch }}
                      />
                      <span className="text-sm font-medium text-[#1A1410]">
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ribbon */}
            <div>
              <h3 className="mb-3 font-playfair text-lg font-bold text-[#1A1410]">
                Select Ribbon Shape
              </h3>
              <div className="flex flex-wrap gap-2">
                {RIBBONS.map((r) => {
                  const active = r === ribbon;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRibbon(r)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                        active
                          ? "border-[#9B1B30] bg-[#9B1B30] text-white"
                          : "border-[#1A1410]/15 bg-white text-[#1A1410] hover:border-[#9B1B30]/40"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recipient */}
            <div>
              <label
                htmlFor="recipient"
                className="mb-2 block font-playfair text-lg font-bold text-[#1A1410]"
              >
                Who is this for?
              </label>
              <select
                id="recipient"
                value={recipient}
                onChange={(e) =>
                  setRecipient(e.target.value as (typeof RECIPIENTS)[number])
                }
                className="w-full rounded-lg border border-silver-light bg-white px-4 py-3 text-sm text-[#1A1410] outline-none transition focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
              >
                {RECIPIENTS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Note */}
            <div>
              <label
                htmlFor="note"
                className="mb-2 block font-playfair text-lg font-bold text-[#1A1410]"
              >
                Personal Gift Note
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 240))}
                rows={4}
                placeholder="Write a message we'll print on a handwritten-style card…"
                className="w-full resize-none rounded-lg border border-silver-light bg-white px-4 py-3 text-sm text-[#1A1410] outline-none transition placeholder:text-gray-400 focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
              />
              <p className="mt-1 text-right text-[11px] text-gray-500">
                {note.length} / 240
              </p>
            </div>

            {/* Sticky summary */}
            <div className="sticky bottom-4 z-10 rounded-xl border border-[#1A1410]/10 bg-[#1A1410] p-5 text-white shadow-premium-hover">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-gray-300">
                  <span className="truncate pr-3">
                    {selected?.name ?? "Select a piece"}
                  </span>
                  <span className="font-medium text-white">
                    {formatINR(productPrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-300">
                  <span>Premium Gift Packaging</span>
                  <span className="font-medium text-white">
                    {formatINR(PACKAGING_FEE)}
                  </span>
                </div>
                <div className="my-2 border-t border-white/10" />
                <div className="flex items-center justify-between">
                  <span className="text-sm uppercase tracking-wider text-gray-400">
                    Total
                  </span>
                  <span className="font-playfair text-2xl font-bold text-white">
                    {formatINR(total)}
                  </span>
                </div>
              </div>

              {error && (
                <p className="mt-3 rounded-md bg-white/10 px-3 py-2 text-xs text-[#FFD4D4]">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleCheckout}
                disabled={!selected || submitting}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-4 text-sm font-semibold uppercase tracking-wider transition-all ${
                  !selected || submitting
                    ? "bg-[#9B1B30]/60 text-white/80 cursor-not-allowed"
                    : "bg-[#9B1B30] text-white hover:bg-[#7d1626]"
                }`}
              >
                {submitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                    </svg>
                    Preparing your gift…
                  </>
                ) : (
                  <>Add Gift Packaging &amp; Checkout</>
                )}
              </button>
              <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-gray-400">
                Signature Viora jewelry packaging included · ₹79 covers wrapping, ribbon shape &amp; note
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default GiftPackagingForm;
