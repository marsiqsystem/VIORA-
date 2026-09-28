"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { useToast } from "@/components/Toast";
import { trackMetaEvent } from "@/lib/metaEvents";
import { rememberMetaCatalogId } from "@/lib/metaCatalogId";
import { nextTierFor } from "@/lib/checkoutPricing";
import ScrollRow from "@/components/ScrollRow";
import { isServiceLine, lineTotal } from "@/lib/cartLines";

const NO_VARIANT = "00000000-0000-0000-0000-000000000000";

/** Lean, serialisable product shape built server-side in app/[slug]/page.tsx. */
export type PairItem = {
  id: string;
  slug: string;
  name: string;
  image?: string;
  price: number;
  compareAt?: number;
  variantId?: string;
  options?: Record<string, string>;
  /** False when the product has a real choice to make (e.g. several sizes) — link instead. */
  quickAdd: boolean;
};

/** The piece on this page, counted as if it were already in the bag. */
export type CurrentPiece = {
  id: string;
  slug: string;
  name: string;
  price: number;
  /** Chosen variant and options (e.g. Color), as the main Add button sends them. */
  variantId?: string;
  options?: Record<string, string>;
  /** In stock with every option chosen — safe to add alongside a pick. */
  canAdd: boolean;
};

type Props = {
  items: PairItem[];
  current: CurrentPiece;
};

const WIX_STORES_APP_ID = "215238eb-22a5-4c36-9e7b-e7c08025e04e";

/**
 * "Add to your order" — a short upsell row under the buy buttons. Sets already
 * include earrings, so the server picks other popular designs rather than a
 * "matching" pair. Cards that would lift the order to the next spend-ladder
 * step say so and come first. One tap adds the pick — plus this page's piece if
 * it isn't in the bag yet — and opens the bag.
 */
const PairItWith = ({ items, current }: Props) => {
  const wixClient = useWixClient();
  const { cart, getCart } = useCartStore();
  const openDrawer = useCommerceUi((s) => s.openDrawer);
  const { showToast } = useToast();
  const [addingId, setAddingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  const productLines = (cart.lineItems || []).filter((li) => !isServiceLine(li));
  const inCartIds = new Set(productLines.map((li) => li.catalogReference?.catalogItemId).filter(Boolean));
  // The order this piece would join: the bag, plus this page's piece if it isn't in it yet.
  const orderTotal =
    productLines.reduce((sum, li) => sum + lineTotal(li), 0) +
    (inCartIds.has(current.id) ? 0 : current.price);
  const next = nextTierFor(orderTotal);
  const unlocks = (item: PairItem) => !!next && orderTotal + item.price >= next.minimum;
  const sorted = [...items].sort((a, b) => Number(unlocks(b)) - Number(unlocks(a)));
  const anyUnlocks = items.some((item) => !inCartIds.has(item.id) && unlocks(item));

  // The row's maths assumes this page's piece is in the order, so a tap adds it
  // too (in one Wix call) unless it's already in the bag or can't be added yet
  // (sold out, or a choice like colour still to make).
  const addsCurrent = !inCartIds.has(current.id) && current.canAdd;

  const handleAdd = async (item: PairItem) => {
    if (addingId) return;
    setAddingId(item.id);
    const pieces = [
      ...(addsCurrent ? [{ id: current.id, slug: current.slug, name: current.name, price: current.price, options: current.options, variantId: current.variantId }] : []),
      { id: item.id, slug: item.slug, name: item.name, price: item.price, options: item.options, variantId: item.variantId },
    ];
    pieces.forEach((p) => rememberMetaCatalogId(p.id, p.slug));
    // Fire before awaiting Wix, same as the main Add to Cart (see Add.tsx).
    trackMetaEvent("AddToCart", {
      currency: "INR",
      value: pieces.reduce((sum, p) => sum + p.price, 0),
      content_ids: pieces.map((p) => p.slug),
      content_name: pieces.map((p) => p.name).join(" + "),
      content_type: "product",
      contents: pieces.map((p) => ({ id: p.slug, quantity: 1, item_price: p.price })),
      num_items: pieces.length,
    });
    try {
      await wixClient.currentCart.addToCurrentCart({
        lineItems: pieces.map((p) => {
          const variantId = p.variantId && p.variantId !== NO_VARIANT ? p.variantId : undefined;
          const options = p.options && Object.keys(p.options).length ? p.options : undefined;
          return {
            catalogReference: {
              appId: WIX_STORES_APP_ID,
              catalogItemId: p.id,
              ...(variantId || options ? { options: { ...(variantId && { variantId }), ...(options && { options }) } } : {}),
            },
            quantity: 1,
          };
        }),
      });
      await getCart(wixClient);
      openDrawer(item.id);
    } catch (err) {
      console.error("Add-to-order add to cart failed:", err);
      showToast((err as any)?.message === "SOLD_OUT" ? "Sorry, this piece just sold out." : "Failed to add item to cart. Please try again.", "error");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <section id="add-to-order" aria-labelledby="pair-it-with-title" className="scroll-mt-24">
      <h2
        id="pair-it-with-title"
        className="mb-3 font-inter text-sm font-semibold uppercase tracking-wider text-primary"
      >
        {anyUnlocks && next ? `Add one more, get ${next.percent}% OFF` : "Add to your order"}
      </h2>
      <p className="-mt-2 mb-3 text-xs text-gray-500">
        {addsCurrent ? "“Add both” puts this piece in your bag too. " : ""}
        {next
          ? `Orders of ₹${next.minimum.toLocaleString("en-IN")}+ get ${next.percent}% OFF automatically.`
          : "Customers' favourite designs to add alongside."}
      </p>
      <ScrollRow className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide md:mx-0 md:scroll-px-0 md:px-0">
        {sorted.map((item) => {
          const discountPercent =
            item.compareAt && item.compareAt > item.price
              ? Math.round(((item.compareAt - item.price) / item.compareAt) * 100)
              : 0;
          const inBag = inCartIds.has(item.id);
          const isAdding = addingId === item.id;
          return (
            <div
              key={item.id}
              className="w-36 shrink-0 snap-start overflow-hidden border border-gray-200 bg-white"
            >
              <Link href={`/${item.slug}`} className="relative block aspect-square bg-gray-50">
                {item.image && (
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="144px"
                    quality={60}
                    className="object-cover"
                  />
                )}
                {!inBag && unlocks(item) && next ? (
                  <span className="absolute inset-x-0 bottom-0 bg-accent py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white">
                    Unlocks {next.percent}% OFF
                  </span>
                ) : null}
                {discountPercent > 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-[#1A1410] px-2 py-0.5 text-[10px] font-bold text-white">
                    {discountPercent}% OFF
                  </span>
                )}
              </Link>
              <div className="p-2.5">
                <Link
                  href={`/${item.slug}`}
                  className="line-clamp-1 text-xs font-medium text-gray-800 hover:text-accent"
                >
                  {item.name}
                </Link>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-primary">₹{item.price}</span>
                  {discountPercent > 0 && (
                    <span className="text-[11px] text-gray-400 line-through">
                      ₹{item.compareAt}
                    </span>
                  )}
                </div>
                {inBag ? (
                  <button
                    type="button"
                    onClick={() => openDrawer(item.id)}
                    className="mt-2 flex h-9 w-full items-center justify-center rounded-md bg-green-600 text-xs font-semibold uppercase tracking-wide text-white"
                  >
                    ✓ In your bag
                  </button>
                ) : item.quickAdd ? (
                  <button
                    type="button"
                    onClick={() => handleAdd(item)}
                    disabled={isAdding}
                    className="mt-2 flex h-9 w-full items-center justify-center rounded-md border border-primary text-xs font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-60"
                  >
                    {isAdding ? "Adding…" : addsCurrent ? "+ Add both" : "+ Add"}
                  </button>
                ) : (
                  <Link
                    href={`/${item.slug}`}
                    className="mt-2 flex h-9 w-full items-center justify-center rounded-md border border-primary text-xs font-semibold uppercase tracking-wide text-primary hover:bg-primary hover:text-white"
                  >
                    View
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </ScrollRow>
    </section>
  );
};

export default PairItWith;
