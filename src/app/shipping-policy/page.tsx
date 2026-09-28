import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage, { POLICY_EMAIL } from "@/components/policy/PolicyPage";
import { COD_CHARGE, PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { whatsappLink } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: `Pan-India delivery from Viora Jewel: FREE + ₹${PREPAID_DISCOUNT} off when you pay online, ₹${COD_CHARGE} with cash on delivery. Orders before 8 pm ship the same day, Monday to Saturday.`,
  alternates: { canonical: "/shipping-policy" },
};

// Keep in step with checkoutPricing, lib/deliveryEstimate and ProductJsonLd's shipping details.
const ShippingPolicyPage = () => (
  <PolicyPage
    path="/shipping-policy"
    eyebrow="Orders"
    title="Shipping Policy"
    updated="16 September 2026"
    summary={[
      "We deliver across India. International shipping isn't available yet.",
      `Pay online: FREE delivery + ₹${PREPAID_DISCOUNT} off. Cash on delivery: ₹${COD_CHARGE} delivery & handling.`,
      "Order before 8 pm and it ships the same day (Monday to Saturday), then usually 5–7 business days to arrive.",
      "Order updates come on WhatsApp, and you can track your order any time without logging in.",
    ]}
  >
    <p>Every Viora order is hand-checked, packed and dispatched from Kolkata. These are our shipping terms.</p>

    <section id="coverage">
      <h2>Where we deliver</h2>
      <p>
        We ship pan-India through trusted courier partners such as Bluedart, Delhivery and India Post. International
        shipping isn&apos;t available at the moment.
      </p>
    </section>

    <section id="charges">
      <h2>Delivery charges</h2>
      <ul>
        <li>
          <strong>Pay online (UPI, cards and more):</strong> FREE delivery, plus ₹{PREPAID_DISCOUNT} off your order.
        </li>
        <li>
          <strong>Cash on delivery:</strong> a ₹{COD_CHARGE} delivery &amp; handling charge, shown at checkout before you
          place the order.
        </li>
      </ul>
      <p className="mt-3">There&apos;s no minimum order value for either.</p>
    </section>

    <section id="timelines">
      <h2>How long delivery takes</h2>
      <ul>
        <li>
          <strong>Dispatch:</strong> orders placed before 8 pm (IST) are packed and shipped the same day. Orders after 8 pm ship
          the next working day. We pack Monday to Saturday, so Saturday-night and Sunday orders ship on Monday.
        </li>
        <li>
          <strong>Delivery:</strong> usually 5–7 business days after shipping.
        </li>
        <li>
          <strong>Remote pin codes:</strong> can take up to 10 business days.
        </li>
      </ul>
      <p className="mt-3">
        Sundays aren&apos;t counted as business days. The date shown on the product page and at checkout uses these same
        timelines.
      </p>
    </section>

    <section id="tracking">
      <h2>Tracking your order</h2>
      <p>
        We send your order confirmation by email and WhatsApp, then a WhatsApp message with your tracking link when the
        order is dispatched, when it&apos;s out for delivery and when it&apos;s delivered. You can also check it any time
        on <Link href="/track">Track Order</Link> with your order number and phone number — no login needed — or in{" "}
        <Link href="/account/orders">My Orders</Link> if you have an account.
      </p>
    </section>

    <section id="address">
      <h2>Changing your address</h2>
      <p>
        Spotted a mistake? Message us on{" "}
        <a href={whatsappLink("Hi Viora, I need to change the address on my order")} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>{" "}
        with your order number as soon as possible. We can usually update it before the order is dispatched, but not
        after.
      </p>
    </section>

    <section id="delays">
      <h2>Delayed or missing orders</h2>
      <p>
        If your order hasn&apos;t arrived within the window above, message us on{" "}
        <a href={whatsappLink("Hi Viora, my order hasn't arrived yet")} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>{" "}
        or email <a href={`mailto:${POLICY_EMAIL}`}>{POLICY_EMAIL}</a> with your order number, and we&apos;ll look into
        it within 24 hours.
      </p>
    </section>
  </PolicyPage>
);

export default ShippingPolicyPage;
