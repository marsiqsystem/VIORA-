import type { Metadata } from "next";
import PolicyPage, { POLICY_EMAIL } from "@/components/policy/PolicyPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What personal data Viora Jewel collects, how it's used and shared, how long it's kept, and your rights under India's DPDP Act.",
  alternates: { canonical: "/privacy-policy" },
};

const TOC = [
  { id: "collect", title: "1. What we collect" },
  { id: "use", title: "2. How we use it" },
  { id: "messages", title: "3. WhatsApp and email" },
  { id: "sharing", title: "4. Who we share it with" },
  { id: "tools", title: "5. Analytics and advertising" },
  { id: "cookies", title: "6. Cookies and your choices" },
  { id: "retention", title: "7. How long we keep it" },
  { id: "rights", title: "8. Your rights" },
  { id: "children", title: "9. Children" },
  { id: "security", title: "10. Security and breaches" },
  { id: "changes", title: "11. Changes" },
  { id: "grievance", title: "12. Contact and grievances" },
];

const Email = () => <a href={`mailto:${POLICY_EMAIL}`}>{POLICY_EMAIL}</a>;

// Describes what the site actually does — keep in step with ConsentManager (trackers
// load unless declined), lib/crm/notify (WhatsApp templates), checkoutLeads (3-day
// reminder data) and the newsletter (Wix Contacts).
const PrivacyPolicyPage = () => (
  <PolicyPage
    path="/privacy-policy"
    eyebrow="Legal"
    title="Privacy Policy"
    updated="15 September 2026"
    summary={[
      "We use your details to deliver your order and keep you updated on WhatsApp and email.",
      "We never sell your personal data.",
      "Analytics and advertising tools run when you visit; you can switch them off any time from Cookie Preferences.",
      `To see, correct or delete your data, email ${POLICY_EMAIL}.`,
    ]}
    toc={TOC}
  >
    <p>
      Viora Jewel (&ldquo;Viora&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) runs viorajewel.in. This policy explains
      what personal data we collect, why, who we share it with, how long we keep it, and your rights under India&apos;s
      Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;) and its Rules.
    </p>

    <section id="collect">
      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Contact and delivery details:</strong> name, phone number, email and delivery address.
        </li>
        <li>
          <strong>Order details:</strong> what you bought, how you paid (we never see or store your card details),
          delivery status, and any exchange request and photo you send.
        </li>
        <li>
          <strong>Account details</strong> if you sign up, and <strong>reviews and photos</strong> you post.
        </li>
        <li>
          <strong>Messages</strong> you send us on WhatsApp, email or the contact form.
        </li>
        <li>
          <strong>Usage data:</strong> pages visited, device, browser, approximate location and IP address, collected
          by the tools in section 5.
        </li>
        <li>
          <strong>On your own device:</strong> your bag, wishlist and — if you leave &ldquo;remember my details&rdquo;
          ticked at checkout — your delivery details are saved in your browser so you don&apos;t retype them.
        </li>
      </ul>
    </section>

    <section id="use">
      <h2>2. How we use it</h2>
      <ul>
        <li>To take payment, pack, ship and deliver your order, and handle exchanges.</li>
        <li>To answer your questions and support requests.</li>
        <li>To send order updates, and offers or newsletters if you&apos;ve subscribed (you can stop them any time).</li>
        <li>To understand how the site is used, measure our ads, prevent fraud and meet legal obligations.</li>
      </ul>
    </section>

    <section id="messages">
      <h2>3. WhatsApp and email</h2>
      <ul>
        <li>
          <strong>Order updates:</strong> we send WhatsApp messages from our business number when your order is
          confirmed, dispatched, out for delivery and delivered, and may ask for a review afterwards. Your order
          confirmation also comes by email.
        </li>
        <li>
          <strong>Checkout reminder:</strong> if you enter your phone number at checkout and leave the &ldquo;Send me
          one WhatsApp reminder&rdquo; box ticked, we save your number and bag for up to 3 days and may send one
          reminder if you don&apos;t finish. Untick the box and nothing is saved for this. We send at most one reminder
          per number per week.
        </li>
        <li>
          <strong>Newsletter:</strong> if you subscribe, your email is added to our mailing list. To unsubscribe, write
          to <Email /> and we&apos;ll remove you.
        </li>
      </ul>
      <p className="mt-3">
        To stop reminders, review requests or offers, message us on WhatsApp or email <Email />. Order updates for an
        order you&apos;ve placed will still be sent.
      </p>
    </section>

    <section id="sharing">
      <h2>4. Who we share it with</h2>
      <p>We don&apos;t sell your personal data. We share only what each service needs to do its job for us:</p>
      <ul className="mt-3">
        <li>
          <strong>Wix</strong> — our store platform (products, orders, accounts, reviews, newsletter contacts).
        </li>
        <li>
          <strong>Razorpay</strong> — online payments.
        </li>
        <li>
          <strong>Courier and shipping partners</strong> — your name, phone and address to deliver the parcel.
        </li>
        <li>
          <strong>Meta</strong> — WhatsApp Business messages, and the Meta Pixel and Conversions API (section 5).
        </li>
        <li>
          <strong>Google</strong> — Google Analytics, and email delivery.
        </li>
        <li>
          <strong>Microsoft</strong> — Microsoft Clarity (section 5).
        </li>
        <li>
          <strong>Vercel and Upstash</strong> — website hosting and our order and checkout-reminder records.
        </li>
      </ul>
      <p className="mt-3">
        Some of these providers may process data outside India, as the DPDP Act allows. We may also share data when the
        law requires it.
      </p>
    </section>

    <section id="tools">
      <h2>5. Analytics and advertising tools</h2>
      <ul>
        <li>
          <strong>Google Analytics 4</strong> (analytics) — traffic and behaviour such as pages, sessions, devices and
          approximate location. See{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer noopener">
            Google&apos;s Privacy Policy
          </a>
          .
        </li>
        <li>
          <strong>Microsoft Clarity</strong> (analytics) — session recordings, heatmaps, clicks and scrolls, so we can
          see where the site is confusing or broken. See{" "}
          <a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noreferrer noopener">
            Microsoft&apos;s Privacy Statement
          </a>
          .
        </li>
        <li>
          <strong>Meta Pixel and Conversions API</strong> (marketing) — events such as page views, add to bag and
          purchases, so we can measure our ads and show relevant ones. The Conversions API also sends some details from
          our server, including your email and phone number in <em>hashed</em> (scrambled) form — never in plain text.
          See{" "}
          <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noreferrer noopener">
            Meta&apos;s Privacy Policy
          </a>
          .
        </li>
      </ul>
    </section>

    <section id="cookies">
      <h2>6. Cookies and your choices</h2>
      <p>We use three kinds of cookies and similar storage:</p>
      <ul className="mt-3">
        <li>
          <strong>Essential</strong> — bag, login, checkout and security. Always on; the site can&apos;t work without
          them.
        </li>
        <li>
          <strong>Analytics</strong> — Google Analytics 4 and Microsoft Clarity.
        </li>
        <li>
          <strong>Marketing</strong> — Meta Pixel and Conversions API.
        </li>
      </ul>
      <p className="mt-3">
        <strong>Analytics and marketing tools are on when you first visit.</strong> The cookie banner shown on your first
        visit lets you accept them or open settings and switch either category off. Your choice is saved in your browser
        and applies from then on. You can change it any time with the <strong>Cookie Preferences</strong> link at the
        bottom of every page, by clearing cookies in your browser, or by emailing <Email />. Changing your choice
        doesn&apos;t undo processing that already happened.
      </p>
    </section>

    <section id="retention">
      <h2>7. How long we keep it</h2>
      <ul>
        <li>
          <strong>Orders and invoices:</strong> 7 years, as Indian tax and accounting law requires.
        </li>
        <li>
          <strong>Checkout reminder data:</strong> up to 3 days, and removed when you place the order.
        </li>
        <li>
          <strong>Account, contact and newsletter details:</strong> until you ask us to delete them. We erase them
          within 30 days of your request, except what the law requires us to keep.
        </li>
        <li>
          <strong>Analytics data:</strong> per each tool&apos;s settings — up to 14 months for Google Analytics 4 and up
          to 13 months for Microsoft Clarity.
        </li>
      </ul>
    </section>

    <section id="rights">
      <h2>8. Your rights</h2>
      <p>Under the DPDP Act you can:</p>
      <ul className="mt-3">
        <li>ask what personal data we hold about you;</li>
        <li>have it corrected or updated;</li>
        <li>have it erased;</li>
        <li>withdraw consent for anything that relies on consent;</li>
        <li>nominate someone to use these rights for you, as the Act allows;</li>
        <li>complain to us, and if we don&apos;t resolve it, to the Data Protection Board of India.</li>
      </ul>
      <p className="mt-3">
        Email <Email /> to use any of these rights. We reply within 30 days.
      </p>
    </section>

    <section id="children">
      <h2>9. Children</h2>
      <p>
        Viora is meant for people aged 18 and over. We don&apos;t knowingly collect data from anyone under 18, and we
        delete it if we find we have. If you think a minor has shared data with us, write to <Email />.
      </p>
    </section>

    <section id="security">
      <h2>10. Security and breaches</h2>
      <p>
        The site runs over secure (HTTPS) connections, payments are handled by Razorpay, and we don&apos;t store card
        details. If a data breach is likely to affect you, we&apos;ll tell you and the Data Protection Board of India as
        the DPDP Act and its Rules require.
      </p>
    </section>

    <section id="changes">
      <h2>11. Changes to this policy</h2>
      <p>
        When we update this policy, the &ldquo;Last updated&rdquo; date at the top changes. We&apos;ll point out
        important changes on the site.
      </p>
    </section>

    <section id="grievance">
      <h2>12. Contact and grievances</h2>
      <p>For privacy questions, requests or complaints, contact:</p>
      <address className="mt-3 not-italic">
        <strong>Viora Jewel</strong>
        <br />
        38C B.T. Road (Kalpana Apartment), 1st Floor, Flat 1A
        <br />
        Kolkata – 700056, West Bengal, India
        <br />
        Email: <Email />
      </address>
    </section>
  </PolicyPage>
);

export default PrivacyPolicyPage;
