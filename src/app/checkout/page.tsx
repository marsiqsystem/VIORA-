import { redirect } from "next/navigation";

// The old address form here sent buyers to Wix's hosted checkout. It showed
// invented fees ("₹99 shipping", "₹50 processing fee") and skipped the site
// checkout's Razorpay verification and COD charge. Nothing links here any more;
// old bookmarks open the bag with the site-wide checkout instead.
export default function CheckoutPage() {
  redirect("/cart?checkout=1");
}
