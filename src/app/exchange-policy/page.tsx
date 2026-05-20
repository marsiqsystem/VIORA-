import type { Metadata } from "next";
import BackButton from "@/components/BackButton";

export const metadata: Metadata = {
  title: "Exchange Policy",
  description:
    "Viora Jewels 48-hour exchange policy for damaged or incorrect items.",
};

const ExchangePolicyPage = () => {
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
            Exchange Policy
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Last updated: 13 May 2026
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed text-gray-700">
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
            <p className="font-semibold text-primary mb-1">
              48 Hours Exchange &mdash; Damaged or Incorrect Items Only
            </p>
            <p className="text-sm text-gray-700">
              Every Viora piece is carefully inspected before it reaches you.
              If anything arrives damaged or incorrect, please reach out within{" "}
              <strong>48 hours of delivery</strong> and we&apos;ll make it right.
              Exchanges are <strong>not</strong> offered for change of mind,
              size preference, or styling reasons.
            </p>
          </div>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              Eligibility
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Product arrived damaged or broken.</li>
              <li>Packaging was distorted to the extent it affected the item.</li>
              <li>You received the wrong item or wrong variant.</li>
              <li>Parts or components were missing from your order.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              How to Raise an Exchange Request
            </h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Go to{" "}
                <a className="text-accent underline" href="/orders">
                  My Orders
                </a>{" "}
                and select the delivered order.
              </li>
              <li>
                Click <strong>Exchange Request</strong> and pick a reason from
                the list (Product damaged, Packaging distorted, Wrong item
                received, Missing parts, or Other).
              </li>
              <li>
                Upload a clear photo of the issue &mdash; this helps us approve
                your request faster.
              </li>
              <li>
                Submit for approval. Our team will respond within 48 hours
                with next steps.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              What Is Not Covered
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Change-of-mind returns or exchanges.</li>
              <li>
                Damage resulting from normal wear, accidental drops, or
                exposure to perfume, water, or chemicals.
              </li>
              <li>
                Requests raised after the 48-hour window from delivery.
              </li>
              <li>
                Items returned without original packaging, tags, or
                certificates.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              Refunds
            </h2>
            <p>
              We offer <strong>exchanges only</strong> &mdash; not refunds. In
              the rare case that an exact replacement is unavailable, we will
              issue a store credit valid for 12 months.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              Need Help?
            </h2>
            <p>
              Email us at{" "}
              <a
                className="text-accent underline"
                href="mailto:viorajewels6@gmail.com"
              >
                viorajewels6@gmail.com
              </a>{" "}
              with your order ID and we&apos;ll take it from there.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
};

export default ExchangePolicyPage;
