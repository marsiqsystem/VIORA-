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
            Last updated: 10 June 2026
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed text-gray-700">
          <p>
            Viora Jewels (&ldquo;Viora&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
            respects your privacy. This Privacy Policy explains, in plain
            English, what personal information we collect when you visit
            viorajewel.in or buy from us, how we use it, who we share it with,
            how long we keep it, and the rights you have under India&apos;s
            Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;)
            and the DPDP Rules, 2025.
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
                IP address, and similar tracking signals collected via cookies
                and the analytics tools listed in Section 4.
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
                To improve our website, understand how visitors use it, prevent
                fraud, and meet legal obligations.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              3. Sharing of Information
            </h2>
            <p>
              We do not sell your personal data. We share it only with trusted
              partners that help us run the business &mdash; payment gateways
              (e.g. Razorpay), delivery partners, analytics &amp; marketing
              providers (Google, Meta, Microsoft), email/communication
              providers, and hosting services &mdash; under appropriate
              confidentiality and data-processing agreements.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              4. Analytics &amp; Marketing Tools We Use
            </h2>
            <p className="mb-3">
              These tools only activate <strong>after you give consent</strong>{" "}
              through the cookie banner shown on your first visit. Before
              consent, only essential cookies (cart, login, security) run.
            </p>
            <ul className="list-disc pl-5 space-y-3">
              <li>
                <strong>Microsoft Clarity</strong> &mdash; records anonymised
                session recordings, heatmaps, clicks, scrolls, and mouse
                movement so we can see where the site is confusing or broken.
                Data is processed by Microsoft Ireland Operations Ltd. See{" "}
                <a
                  className="text-accent underline"
                  href="https://privacy.microsoft.com/privacystatement"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Microsoft&apos;s Privacy Statement
                </a>
                .
              </li>
              <li>
                <strong>Meta Pixel &amp; Conversions API (CAPI)</strong>{" "}
                &mdash; sends events such as page views, add-to-cart, and
                purchases to Meta so we can measure ads and show you relevant
                ones. CAPI sends some data server-to-server, including{" "}
                <em>hashed</em> email and phone number plus purchase event
                details (your raw email/phone are never shared). See{" "}
                <a
                  className="text-accent underline"
                  href="https://www.facebook.com/privacy/policy"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Meta&apos;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Google Analytics 4</strong> &mdash; collects aggregated
                traffic and behavioural data (pages, sessions, devices,
                approximate location) so we can understand site performance.
                Google acts as a data processor on our behalf. See{" "}
                <a
                  className="text-accent underline"
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Google&apos;s Privacy Policy
                </a>
                .
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              5. Cookies &amp; Consent
            </h2>
            <p className="mb-3">
              On your first visit, a cookie consent banner asks whether you
              accept non-essential cookies. We use three categories:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Essential</strong> &mdash; cart, login session,
                security and fraud prevention. These always run; the site
                cannot function without them.
              </li>
              <li>
                <strong>Analytics</strong> &mdash; Google Analytics 4 and
                Microsoft Clarity. Require consent.
              </li>
              <li>
                <strong>Marketing</strong> &mdash; Meta Pixel &amp; CAPI.
                Require consent.
              </li>
            </ul>
            <p className="mt-3">
              You can <strong>withdraw consent at any time</strong> by (a)
              clicking the &ldquo;Cookie Preferences&rdquo; link in our footer
              to reopen the banner, (b) clearing cookies via your browser
              settings, or (c) emailing{" "}
              <a
                className="text-accent underline"
                href="mailto:viorajewels6@gmail.com"
              >
                viorajewels6@gmail.com
              </a>
              . Withdrawing consent does not affect processing already carried
              out before withdrawal.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              6. How Long We Keep Your Data
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Order &amp; transaction data:</strong> 7 years, as
                required by Indian tax and accounting laws.
              </li>
              <li>
                <strong>Account &amp; contact data:</strong> until you ask us
                to delete it. After a deletion request, we erase it within 30
                days (except where law requires longer retention, e.g.
                invoices).
              </li>
              <li>
                <strong>Analytics &amp; behavioural data:</strong> per each
                tool&apos;s policy &mdash; Microsoft Clarity up to 13 months,
                Google Analytics 4 up to 14 months.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              7. Your Rights Under the DPDP Act
            </h2>
            <p className="mb-3">As a Data Principal, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate or out-of-date data.</li>
              <li>Request erasure of your data.</li>
              <li>
                Withdraw consent at any time for any processing that relies on
                consent.
              </li>
              <li>
                Nominate another person to exercise these rights on your behalf
                (for example, in case of incapacity or death), as permitted by
                the DPDP Act.
              </li>
              <li>
                Raise a grievance with us; if unresolved, you may approach the
                Data Protection Board of India.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{" "}
              <a
                className="text-accent underline"
                href="mailto:viorajewels6@gmail.com"
              >
                viorajewels6@gmail.com
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              8. Children&apos;s Data
            </h2>
            <p>
              Viora is intended for users aged 18 and above. We do not
              knowingly collect personal data from minors. If we discover that
              we have collected data from a person under 18, we will delete it
              immediately. If you believe a minor has shared data with us,
              please write to{" "}
              <a
                className="text-accent underline"
                href="mailto:viorajewels6@gmail.com"
              >
                viorajewels6@gmail.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              9. Data Security
            </h2>
            <p>
              We use industry-standard safeguards to protect your information.
              Payments are processed over secure (HTTPS) connections by our
              payment partners, and we do not store your card details on our
              servers.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              10. Data Breach Notification
            </h2>
            <p>
              If a personal data breach occurs that is likely to affect your
              rights, we will notify affected users and the Data Protection
              Board of India within a reasonable timeframe, as required by the
              DPDP Act and its Rules.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              11. Updates to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. The
              &ldquo;Last updated&rdquo; date at the top reflects the most
              recent change. Material changes will be highlighted on the site.
            </p>
          </section>

          <section>
            <h2 className="font-playfair text-2xl font-semibold text-primary mb-3">
              12. Contact
            </h2>
            <p>
              For any privacy-related questions, requests, or grievances, write
              to{" "}
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
