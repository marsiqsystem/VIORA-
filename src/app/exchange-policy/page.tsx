import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage, { POLICY_EMAIL } from "@/components/policy/PolicyPage";
import { whatsappLink } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Exchange Policy",
  description:
    "Viora Jewel's 48-hour exchange for damaged, wrong or incomplete pieces — how to request one, what's covered, and store credit.",
  alternates: { canonical: "/exchange-policy" },
};

// Keep in step with ProductJsonLd's return policy, the FAQ and /account/orders (ExchangeModal).
const ExchangePolicyPage = () => (
  <PolicyPage
    path="/exchange-policy"
    eyebrow="Orders"
    title="Exchange Policy"
    updated="15 September 2026"
    summary={[
      "Damaged, wrong or missing parts? We exchange it if you tell us within 48 hours of delivery.",
      "Send a clear photo of the problem with your request.",
      "No exchanges for change of mind or styling reasons.",
      "We don't give refunds on delivered orders — if a replacement isn't available, you get store credit valid for 12 months.",
    ]}
  >
    <section id="eligible">
      <h2>What we exchange</h2>
      <p>Every piece is inspected before it&apos;s packed. If something still goes wrong, we&apos;ll exchange it when:</p>
      <ul className="mt-3">
        <li>the piece arrived damaged or broken;</li>
        <li>the packaging was crushed badly enough to damage the piece;</li>
        <li>you received the wrong design or colour;</li>
        <li>parts were missing from your order.</li>
      </ul>
      <p className="mt-3">
        The request must reach us within <strong>48 hours of delivery</strong>.
      </p>
    </section>

    <section id="how">
      <h2>How to request an exchange</h2>
      <p>
        <strong>If you have an account:</strong>
      </p>
      <ol className="mt-2">
        <li>
          Open <Link href="/account/orders">My Orders</Link> and find the order.
        </li>
        <li>
          Tap <strong>Damaged or wrong? Exchange</strong> and choose the reason.
        </li>
        <li>Add a clear photo of the problem and send the request.</li>
      </ol>
      <p className="mt-4">
        <strong>If you checked out without an account:</strong> message us on{" "}
        <a href={whatsappLink("Hi Viora, I'd like to exchange a piece from my order")} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>{" "}
        or email <a href={`mailto:${POLICY_EMAIL}`}>{POLICY_EMAIL}</a> with your order number, what&apos;s wrong and a
        photo.
      </p>
      <p className="mt-3">We reply within 48 hours with the next steps.</p>
    </section>

    <section id="not-covered">
      <h2>What isn&apos;t covered</h2>
      <ul>
        <li>Change of mind, or not liking how a piece looks or styles.</li>
        <li>Damage from wear, drops, or contact with perfume, water or chemicals.</li>
        <li>Requests made more than 48 hours after delivery.</li>
        <li>Pieces sent back without their original packaging.</li>
      </ul>
    </section>

    <section id="refunds">
      <h2>Refunds and store credit</h2>
      <p>
        For delivered orders we offer <strong>exchanges, not refunds</strong>. If an exact replacement isn&apos;t
        available, we give you store credit for the value of the piece, valid for 12 months.
      </p>
      <p className="mt-3">
        If <strong>we</strong> have to cancel a paid order before it&apos;s dispatched (for example, a piece goes out of
        stock), we refund the full amount to your original payment method.
      </p>
    </section>
  </PolicyPage>
);

export default ExchangePolicyPage;
