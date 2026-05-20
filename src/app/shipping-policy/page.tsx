import type { Metadata } from "next";
import BackButton from "@/components/BackButton";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description:
    "Shipping timelines, costs, and delivery partners for Viora Jewels orders.",
};

const ShippingPolicyPage = () => {
  return (
    <main className="min-h-[calc(100vh-180px)] bg-platinum">
      <div className="max-w-4xl mx-auto py-12 md:py-16 px-4 md:px-8">
        <div className="mb-6 flex items-center gap-2">
          <BackButton className="bg-white shadow-sm" />
          <span className="text-sm font-medium text-gray-500">Back</span>
        </div>
        <header className="mb-10 border-b border-primary/10 pb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">
            Orders
          </p>
          <h1 className="mt-2 font-playfair text-4xl md:text-5xl font-bold text-primary">
            Shipping Policy
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Last updated: 13 May 2026
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed text-gray-700">
          <p>
            Every Viora Jewels order is hand-checked, packaged, and dispatched
            with care. Below are our standard shipping terms.
          </p>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              Delivery Coverage
            </h2>
            <p>
              We currently ship pan-India through trusted courier partners such
              as Bluedart, Delhivery, and India Post. International shipping is
              not available at the moment.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              Processing &amp; Delivery Time
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Order processing:</strong> 1&ndash;2 business days.
              </li>
              <li>
                <strong>Standard delivery:</strong> 5&ndash;7 business days
                from dispatch.
              </li>
              <li>
                <strong>Remote pin codes:</strong> may take up to 10 business
                days.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              Shipping Charges
            </h2>
            <p>
              <strong>Free delivery on all orders</strong> across India. No
              minimum cart value required. Any cash-on-delivery handling fee,
              if applicable, will be shown clearly at checkout.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              Order Tracking
            </h2>
            <p>
              Once your order is dispatched, you will receive a tracking link
              via email and SMS. You can also check the status from{" "}
              <a className="text-accent underline" href="/orders">
                My Orders
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              Undelivered or Delayed Shipments
            </h2>
            <p>
              If your order has not arrived within the estimated window, please
              email{" "}
              <a
                className="text-accent underline"
                href="mailto:viorajewels6@gmail.com"
              >
                viorajewels6@gmail.com
              </a>{" "}
              with your order ID and we&apos;ll investigate within 24 hours.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
};

export default ShippingPolicyPage;
