import type { Metadata } from "next";
import BackButton from "@/components/BackButton";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Viora Jewels collects, uses, and protects your personal information.",
};

const PrivacyPolicyPage = () => {
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
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Last updated: 13 May 2026
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed text-gray-700">
          <p>
            Viora Jewels (&ldquo;Viora&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
            respects your privacy. This Privacy Policy explains what personal
            information we collect when you visit viorajewel.in or purchase from
            us, how we use it, and the choices you have.
          </p>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              1. Information We Collect
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Identity &amp; contact data:</strong> name, email,
                phone number, shipping &amp; billing address.
              </li>
              <li>
                <strong>Order data:</strong> items purchased, payment status,
                delivery details.
              </li>
              <li>
                <strong>Usage data:</strong> pages visited, device, browser,
                IP address, cookies, and similar tracking signals.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              2. How We Use Your Information
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To process and deliver your orders.</li>
              <li>To provide customer support and respond to your queries.</li>
              <li>
                To send order updates, occasional product news, and offers
                (you can unsubscribe at any time).
              </li>
              <li>
                To improve our website, prevent fraud, and meet legal
                obligations.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              3. Sharing of Information
            </h2>
            <p>
              We do not sell your personal data. We share it only with trusted
              partners that help us run the business &mdash; payment gateways,
              delivery partners, analytics providers (e.g. Google, Meta), and
              hosting services &mdash; under appropriate confidentiality
              obligations.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              4. Cookies &amp; Tracking
            </h2>
            <p>
              We use cookies and similar technologies to remember your cart,
              authenticate sessions, and measure marketing performance. You can
              manage cookies through your browser settings; disabling them may
              affect site functionality.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              5. Data Security
            </h2>
            <p>
              We use industry-standard safeguards to protect your information.
              Payments are processed over secure (HTTPS) connections and we do
              not store your card details on our servers.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              6. Your Rights
            </h2>
            <p>
              You may request access to, correction of, or deletion of your
              personal data by writing to{" "}
              <a
                className="text-accent underline"
                href="mailto:viorajewels6@gmail.com"
              >
                viorajewels6@gmail.com
              </a>
              . We will respond within a reasonable timeframe.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              7. Contact
            </h2>
            <p>
              For any privacy-related questions, write to{" "}
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

export default PrivacyPolicyPage;
