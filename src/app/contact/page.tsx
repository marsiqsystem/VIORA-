import Link from "next/link";
import ContactForm from "@/components/contact/ContactForm";
import ContactLink from "@/components/contact/ContactLink";
import { COD_CHARGE, PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { whatsappLink } from "@/lib/contact";

const CONTACT_EMAIL = "mail@viorajewel.in";

const icon = (d: string) => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

// Short answers to what people usually write in about — same facts as the policies and FAQ.
const QUICK_ANSWERS = [
  {
    q: "When will my order arrive?",
    a: "Order before 8 pm and it ships the same day (Mon–Sat), then usually 5–7 business days to arrive. Remote pin codes can take up to 10.",
    href: "/track",
    link: "Track your order",
  },
  {
    q: "Damaged or wrong piece?",
    a: "Tell us within 48 hours of delivery with a clear photo and we'll exchange it.",
    href: "/exchange-policy",
    link: "Exchange policy",
  },
  {
    q: "Is there a delivery charge?",
    a: `FREE when you pay online (plus ₹${PREPAID_DISCOUNT} off). Cash on delivery is ₹${COD_CHARGE}.`,
    href: "/shipping-policy",
    link: "Shipping policy",
  },
];

/** Contact: the fastest channel first, self-serve for the common questions, then the form and the address. */
const ContactPage = () => (
  <div className="bg-platinum text-primary">
    <section className="mx-auto max-w-6xl px-4 pt-4 md:px-6 md:pt-8 lg:px-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-gray-500">
        <Link href="/" className="hover:text-accent">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-primary">Contact</span>
      </nav>
      <h1 className="mt-2 font-playfair text-[32px] font-bold leading-tight md:text-5xl">How can we help?</h1>
      <p className="mt-1 text-sm text-gray-600 md:text-base">
        WhatsApp is the fastest way to reach us. For your order, tracking needs no login.
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li>
          <ContactLink
            href={whatsappLink("Hi Viora, I need help with")}
            external
            className="flex h-full items-start gap-3 bg-[#1f7a4d] p-4 text-white hover:bg-[#19663f]"
          >
            <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5a9.5 9.5 0 01-4.84-1.33l-.35-.2-3.6.94.96-3.5-.23-.36a9.46 9.46 0 01-1.45-5.05c0-5.24 4.27-9.5 9.52-9.5a9.5 9.5 0 010 19zm8.08-17.58A11.35 11.35 0 0012.04.5C5.74.5.62 5.62.61 11.92c0 2.01.53 3.98 1.53 5.71L.5 23.5l6.02-1.58a11.4 11.4 0 005.51 1.4c6.3 0 11.42-5.12 11.43-11.42a11.35 11.35 0 00-3.34-8.08z" />
            </svg>
            <span>
              <span className="block font-semibold">WhatsApp us</span>
              <span className="block text-sm text-white/85">+91 89103 50623</span>
            </span>
          </ContactLink>
        </li>
        <li>
          <Link href="/track" className="flex h-full items-start gap-3 border border-silver-light bg-white p-4 hover:border-accent">
            <span className="text-accent">{icon("M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z")}</span>
            <span>
              <span className="block font-semibold">Track my order</span>
              <span className="block text-sm text-gray-600">Status and courier updates</span>
            </span>
          </Link>
        </li>
        <li>
          <Link href="/exchange-policy" className="flex h-full items-start gap-3 border border-silver-light bg-white p-4 hover:border-accent">
            <span className="text-accent">{icon("M4 8h13l-3-3M20 16H7l3 3")}</span>
            <span>
              <span className="block font-semibold">Exchange a piece</span>
              <span className="block text-sm text-gray-600">Within 48 hours of delivery</span>
            </span>
          </Link>
        </li>
        <li>
          <ContactLink href={`mailto:${CONTACT_EMAIL}`} className="flex h-full items-start gap-3 border border-silver-light bg-white p-4 hover:border-accent">
            <span className="text-accent">{icon("M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z")}</span>
            <span className="min-w-0">
              <span className="block font-semibold">Email us</span>
              <span className="block truncate text-sm text-gray-600">{CONTACT_EMAIL}</span>
            </span>
          </ContactLink>
        </li>
      </ul>
    </section>

    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:px-6 md:py-14 lg:gap-12 lg:px-8">
      <div className="border border-silver-light bg-white p-5 md:p-8">
        <h2 className="font-playfair text-2xl font-bold md:text-3xl">Send us a message</h2>
        <p className="mb-5 mt-1 text-sm text-gray-600">For anything that needs detail or photos, write to us here.</p>
        <ContactForm />
      </div>

      <aside className="space-y-6">
        <div>
          <h2 className="font-playfair text-2xl font-bold">Quick answers</h2>
          <ul className="mt-3 divide-y divide-silver-light border-y border-silver-light">
            {QUICK_ANSWERS.map((item) => (
              <li key={item.q} className="py-3">
                <p className="text-sm font-semibold">{item.q}</p>
                <p className="mt-0.5 text-sm text-gray-600">{item.a}</p>
                <Link href={item.href} className="mt-1 inline-block text-sm font-semibold text-accent underline-offset-4 hover:underline">
                  {item.link} →
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-silver-light bg-white p-5">
          <h2 className="font-playfair text-lg font-bold">Registered address</h2>
          <address className="mt-2 text-sm not-italic leading-relaxed text-gray-700">
            <strong className="text-primary">Viora Jewel</strong>
            <br />
            38C B.T. Road (Kalpana Apartment), 1st Floor, Flat 1A
            <br />
            Kolkata – 700056, West Bengal, India
          </address>
        </div>

        <div className="border border-silver-light bg-white p-5">
          <h2 className="font-playfair text-lg font-bold">Business hours</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            {[
              ["Monday – Friday", "9:00 AM – 6:00 PM"],
              ["Saturday", "10:00 AM – 4:00 PM"],
              ["Sunday", "Closed"],
            ].map(([day, hours]) => (
              <div key={day} className="flex justify-between gap-4">
                <dt className="text-gray-600">{day}</dt>
                <dd className={hours === "Closed" ? "text-gray-400" : "font-medium"}>{hours}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-600">Follow us:</span>
          <ContactLink href="https://www.instagram.com/_viorajewels_" external className="font-semibold text-accent underline-offset-4 hover:underline">
            Instagram
          </ContactLink>
          <ContactLink
            href="https://www.facebook.com/profile.php?id=61589962820647"
            external
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Facebook
          </ContactLink>
        </p>
      </aside>
    </section>
  </div>
);

export default ContactPage;
