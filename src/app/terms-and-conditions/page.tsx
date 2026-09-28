import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage, { POLICY_EMAIL } from "@/components/policy/PolicyPage";
import { COD_CHARGE, PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { whatsappLink } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms for buying from Viora Jewel: prices and offers, cash on delivery, cancellations, shipping, exchanges and your use of viorajewel.in.",
  alternates: { canonical: "/terms-and-conditions" },
};

const TOC = [
  { id: "about", title: "1. Who we are" },
  { id: "eligibility", title: "2. Eligibility" },
  { id: "products", title: "3. Products and photos" },
  { id: "prices", title: "4. Prices and offers" },
  { id: "orders", title: "5. Orders and payment" },
  { id: "cancellations", title: "6. Cancellations" },
  { id: "shipping", title: "7. Shipping and exchanges" },
  { id: "reviews", title: "8. Reviews and your content" },
  { id: "ip", title: "9. Our content" },
  { id: "conduct", title: "10. Using the site" },
  { id: "liability", title: "11. Liability" },
  { id: "law", title: "12. Governing law" },
  { id: "contact", title: "13. Contact" },
];

// Keep in step with checkoutPricing (ladder, COD charge, prepaid discount) and the policies.
const TermsAndConditionsPage = () => (
  <PolicyPage
    path="/terms-and-conditions"
    eyebrow="Legal"
    title="Terms & Conditions"
    updated="15 September 2026"
    summary={[
      "Prices are in rupees and include taxes. Pay online or with cash on delivery.",
      "One coupon per order. Our spend-more-save-more offers apply automatically in your bag.",
      "Shipping and exchanges follow our Shipping and Exchange policies.",
      "These terms are governed by Indian law.",
    ]}
    toc={TOC}
  >
    <p>
      These terms apply when you use viorajewel.in (the &ldquo;site&rdquo;) or buy from us. By placing an order, you agree
      to them.
    </p>

    <section id="about">
      <h2>1. Who we are</h2>
      <p>
        The site is run by Viora Jewel, 38C B.T. Road (Kalpana Apartment), 1st Floor, Flat 1A, Kolkata – 700056, West
        Bengal, India. Email: <a href={`mailto:${POLICY_EMAIL}`}>{POLICY_EMAIL}</a>.
      </p>
    </section>

    <section id="eligibility">
      <h2>2. Eligibility</h2>
      <p>You must be 18 or older, or have a parent or guardian&apos;s consent, to buy from us.</p>
    </section>

    <section id="products">
      <h2>3. Products and photos</h2>
      <ul>
        <li>
          Viora pieces are fashion jewellery made of brass with rhodium plating and glass stones — not gold, silver or
          real diamonds.
        </li>
        <li>
          Product photos are representative. Colours can look slightly different depending on your screen and lighting.
        </li>
      </ul>
    </section>

    <section id="prices">
      <h2>4. Prices and offers</h2>
      <ul>
        <li>All prices are in Indian Rupees (₹) and include applicable taxes.</li>
        <li>
          Paying online gets FREE delivery and ₹{PREPAID_DISCOUNT} off. Cash on delivery carries a ₹{COD_CHARGE} delivery
          &amp; handling charge. Both are shown at checkout before you order.
        </li>
        <li>
          Only one coupon can be used per order. Our spend-more-save-more coupons are applied automatically in your bag
          when you qualify; you can remove them or enter a different code instead.
        </li>
        <li>
          Offers run for the period shown and can end or change without notice. An offer only applies to orders placed
          while it&apos;s live.
        </li>
        <li>
          If a price is clearly wrong because of an error, we may cancel the order and refund anything you paid.
        </li>
      </ul>
    </section>

    <section id="orders">
      <h2>5. Orders and payment</h2>
      <ul>
        <li>
          <strong>Paying online:</strong> your order is confirmed once your payment is verified.
        </li>
        <li>
          <strong>Cash on delivery:</strong> your order is confirmed once we accept it. We may ask you to confirm it on
          WhatsApp before we dispatch. Please pay the courier the amount shown at checkout.
        </li>
        <li>
          We may cancel an order — for example if a piece is out of stock, the payment looks fraudulent, or we can&apos;t
          deliver to the address. If you&apos;ve already paid, we refund the full amount to your original payment method.
        </li>
      </ul>
    </section>

    <section id="cancellations">
      <h2>6. Cancellations</h2>
      <p>
        Want to cancel? Message us on{" "}
        <a href={whatsappLink("Hi Viora, I'd like to cancel my order")} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>{" "}
        with your order number before it&apos;s dispatched and we&apos;ll cancel it, refunding any online payment to your
        original payment method. Orders that have already been dispatched can&apos;t be cancelled.
      </p>
    </section>

    <section id="shipping">
      <h2>7. Shipping and exchanges</h2>
      <p>
        Delivery is covered by our <Link href="/shipping-policy">Shipping Policy</Link>. Exchanges are for damaged, wrong
        or incomplete pieces reported within 48 hours of delivery, as set out in our{" "}
        <Link href="/exchange-policy">Exchange Policy</Link>.
      </p>
    </section>

    <section id="reviews">
      <h2>8. Reviews and your content</h2>
      <p>
        Reviews and photos you post must be your own, honest, and not unlawful, abusive or infringing. By posting them,
        you let us show them on the site and in our marketing. We may remove content that breaks these rules. Review
        rewards are limited to one per customer.
      </p>
    </section>

    <section id="ip">
      <h2>9. Our content</h2>
      <p>
        The designs, photos, logos and text on the site belong to Viora Jewel. Please don&apos;t copy or reuse them
        without our written permission.
      </p>
    </section>

    <section id="conduct">
      <h2>10. Using the site</h2>
      <p>
        Don&apos;t misuse the site — for example by trying to access it without permission, scraping content, placing
        fake orders or uploading harmful code.
      </p>
    </section>

    <section id="liability">
      <h2>11. Liability</h2>
      <p>
        As far as the law allows, our total liability for any claim about an order is limited to the amount you paid for
        that order. Nothing in these terms limits your rights under the Consumer Protection Act, 2019.
      </p>
    </section>

    <section id="law">
      <h2>12. Governing law</h2>
      <p>These terms are governed by the laws of India, and disputes are subject to the jurisdiction of Indian courts.</p>
    </section>

    <section id="contact">
      <h2>13. Contact</h2>
      <p>
        Questions or complaints? Email <a href={`mailto:${POLICY_EMAIL}`}>{POLICY_EMAIL}</a> or message us on{" "}
        <a href={whatsappLink("Hi Viora, I have a question")} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
        .
      </p>
    </section>
  </PolicyPage>
);

export default TermsAndConditionsPage;
