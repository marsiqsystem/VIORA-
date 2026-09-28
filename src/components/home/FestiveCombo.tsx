"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FESTIVE_COMBO } from "@/lib/checkoutPricing";
import type { ComboPair } from "@/lib/homeData";
import { useCartStore } from "@/hooks/useCartStore";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { useWixClient } from "@/hooks/useWixClient";
import { useToast } from "@/components/Toast";
import { trackMetaEvent } from "@/lib/metaEvents";
import FestiveCountdown from "@/components/FestiveCountdown";

const NO_VARIANT = "00000000-0000-0000-0000-000000000000";

type Props = {
  comboPairs: ComboPair[];
  festiveLive: boolean;
};

export const ComboCard = ({ pair }: { pair: ComboPair }) => {
  const wixClient = useWixClient();
  const { addItem } = useCartStore();
  const openDrawer = useCommerceUi((s) => s.openDrawer);
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const together = pair.first.price + pair.second.price;

  const addBoth = async () => {
    if (adding) return;
    setAdding(true);
    trackMetaEvent("AddToCart", {
      currency: "INR",
      value: together,
      content_ids: [pair.first.slug, pair.second.slug],
      content_type: "product",
      contents: [
        { id: pair.first.slug, quantity: 1, item_price: pair.first.price },
        { id: pair.second.slug, quantity: 1, item_price: pair.second.price },
      ],
      num_items: 2,
    });
    try {
      await addItem(wixClient, pair.first.id, pair.first.variantId || NO_VARIANT, 1, pair.first.options);
      await addItem(wixClient, pair.second.id, pair.second.variantId || NO_VARIANT, 1, pair.second.options);
      openDrawer(pair.second.id);
    } catch (err) {
      console.error("Festive combo add failed:", err);
      showToast((err as any)?.message === "SOLD_OUT" ? "Sorry, one of these pieces just sold out." : "Couldn't add the combo. Please try again.", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <li className="flex w-[82%] shrink-0 snap-start flex-col border border-amber-300 bg-white md:w-auto">
      {pair.image ? (
        // Designed pairing image (brief S7-C), once confirmed.
        <Link href={`/${pair.first.slug}`} className="relative block aspect-[4/5] bg-gray-50">
          <Image src={pair.image} alt={`${pair.first.name} with ${pair.second.name}`} fill sizes="(min-width: 768px) 33vw, 82vw" className="object-cover" />
        </Link>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-amber-100">
          {[pair.first, pair.second].map((item) => (
            <Link key={item.id} href={`/${item.slug}`} className="relative block aspect-[4/5] bg-gray-50">
              {item.image && (
                <Image src={item.image} alt={item.name} fill sizes="(min-width: 768px) 16vw, 40vw" className="object-cover" />
              )}
            </Link>
          ))}
        </div>
      )}
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-1 text-sm font-semibold text-primary">{pair.first.name}</p>
        <p className="line-clamp-1 text-xs text-gray-500">+ {pair.second.name}</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-primary">₹{together - FESTIVE_COMBO.amount}</span>
          <span className="text-sm text-gray-400 line-through">₹{together}</span>
          <span className="text-xs font-bold text-green-700">SAVE ₹{FESTIVE_COMBO.amount}</span>
        </p>
        <button
          type="button"
          onClick={addBoth}
          disabled={adding}
          className="mt-3 bg-accent py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#7d1527] disabled:opacity-60"
        >
          {adding ? "Adding…" : "Add both to bag"}
        </button>
      </div>
    </li>
  );
};

/** The festive combo (any 2 pieces), only while it runs. */
const FestiveCombo = ({ comboPairs, festiveLive }: Props) => {
  if (!festiveLive || comboPairs.length === 0) return null;
  return (
    <section id="festive-combo" aria-labelledby="festive-combo-title" className="scroll-mt-24 bg-platinum px-4 py-10 md:px-6 md:py-14 lg:px-8">
      <div className="border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-rose-50 p-4 md:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">Festive combo · till {FESTIVE_COMBO.endLabel}</p>
        <h2 id="festive-combo-title" className="font-playfair text-2xl font-bold text-primary md:text-3xl">
          Any 2 pieces = ₹{FESTIVE_COMBO.amount} OFF
        </h2>
        <p className="text-sm text-gray-600">
          Applied automatically at checkout. Two sets, two earrings or one of each — or{" "}
          <Link href="/list#product-grid" className="font-semibold text-accent underline underline-offset-2">
            pick your own two
          </Link>
          .
        </p>
        <FestiveCountdown className="mt-3" />
        <ul
          className={`scrollbar-hide -mx-4 mt-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:gap-5 md:overflow-visible md:px-0 ${
            comboPairs.length === 1 ? "md:max-w-md md:grid-cols-1" : comboPairs.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"
          }`}
        >
          {comboPairs.map((pair) => (
            <ComboCard key={`${pair.first.id}-${pair.second.id}`} pair={pair} />
          ))}
        </ul>
      </div>
    </section>
  );
};

export default FestiveCombo;
