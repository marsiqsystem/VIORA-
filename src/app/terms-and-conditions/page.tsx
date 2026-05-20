import type { Metadata } from "next";
import BackButton from "@/components/BackButton";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms governing your use of the Viora Jewels website and services.",
};

const TermsAndConditionsPage = () => {
  return (
    <main className="min-h-[calc(100vh-180px)] bg-platinum">
      <div className="max-w-4xl mx-auto py-12 md:py-16 px-4 md:px-8">
        <div className="mb-6 flex items-center gap-2">
          <BackButton className="bg-white shadow-sm" />
          <span className="text-sm font-medium text-gray-500">Back</span>
        </div>
        <header className="mb-10 border-b border-primary/10 pb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">
            Legal
          </p>
          <h1 className="mt-2 font-playfair text-4xl md:text-5xl font-bold text-primary">
            Terms &amp; Conditions
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Last updated: 13 May 2026
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed text-gray-700">
          <p>
            These terms govern your access to and use of viorajewels.co and
            any related services (the &ldquo;Site&rdquo;). By using the Site
            you agree to these terms in full.
          </p>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              1. Eligibility
            </h2>
            <p>
              You must be at least 18 years old, or have the consent of a
              parent or legal guardian, to purchase from Viora Jewels.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              2. Products &amp; Pricing
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Product images are representative. Colours may vary slightly
                due to monitor calibration and lighting.
              </li>
              <li>
                All prices are in Indian Rupees (INR) and inclusive of
                applicable taxes unless otherwise stated.
              </li>
              <li>
                We reserve the right to change prices, withdraw products, or
                correct pricing errors without prior notice.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              3. Orders &amp; Payment
            </h2>
            <p>
              An order is confirmed only when payment is successfully received
              and we send you an order confirmation email. We may cancel any
              order at our sole discretion (e.g. stock unavailability, payment
              fraud, or pricing errors) and issue a full refund.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              4. Shipping &amp; Exchange
            </h2>
            <p>
              Shipping is governed by our{" "}
              <a className="text-accent underline" href="/shipping-policy">
                Shipping Policy
              </a>
              . Exchanges are limited to damaged or incorrect items raised
              within 48 hours of delivery, as detailed in our{" "}
              <a className="text-accent underline" href="/exchange-policy">
                Exchange Policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              5. Intellectual Property
            </h2>
            <p>
              All content on the Site &mdash; including product designs,
              photographs, logos, and copy &mdash; is the property of Viora
              Jewels and may not be copied, reproduced, or used without our
              written permission.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              6. User Conduct
            </h2>
            <p>
              You agree not to misuse the Site &mdash; including but not
              limited to attempting unauthorised access, scraping content, or
              uploading harmful code. Reviews and other user-generated content
              must not be unlawful, defamatory, or infringing.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              7. Limitation of Liability
            </h2>
            <p>
              To the extent permitted by law, Viora Jewels&apos; total
              liability for any claim arising from your use of the Site is
              limited to the amount you paid for the relevant order.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              8. Governing Law
            </h2>
            <p>
              These terms are governed by the laws of India. Any disputes
              shall be subject to the exclusive jurisdiction of the courts in
              India.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              9. Contact
            </h2>
            <p>
              Questions? Write to us at{" "}
              <a
                className="text-accent underline"
                href="mailto:viorajewels6@gmail.com"
              >
                viorajewels6@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
};

export default TermsAndConditionsPage;
