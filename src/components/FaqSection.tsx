"use client";

import Link from "next/link";
import { useState } from "react";
import { COD_CHARGE, PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { whatsappLink } from "@/lib/contact";

type Faq = { question: string; answer: string };

// Keep answers in step with the policy pages, WhyViora and the product page.
const FAQS: Faq[] = [
  {
    question: "What is Viora Jewel?",
    answer:
      "Viora Jewel is an Indian fashion jewellery brand based in Kolkata. We make diamond-style necklace sets and statement earrings for weddings, festive occasions, parties, office wear and gifting — designed to look premium at an everyday price.",
  },
  {
    question: "Does Viora Jewel sell artificial jewellery online?",
    answer: `Yes. Viora Jewel sells artificial and fashion jewellery for women online, delivered across India. Pay online for FREE delivery plus ₹${PREPAID_DISCOUNT} off, or choose Cash on Delivery.`,
  },
  {
    question: "What kinds of necklace sets and earrings do you have?",
    answer:
      "Diamond-style necklace sets — many with matching earrings — in colours like red, green, blue, pink and black, plus statement drop earrings. Lighter sets work for office and parties; fuller ones suit weddings and festive functions.",
  },
  {
    question: "Is Viora Jewel jewellery real gold or gold-plated?",
    answer:
      "Neither. Viora Jewel pieces are fashion jewellery — not real gold and not gold-plated. They're made to give you an elegant, occasion-ready look at an everyday price.",
  },
  {
    question: "What materials does Viora Jewel use?",
    answer:
      "Brass with high-quality rhodium plating for a bright, long-lasting shine, set with original glass stones. With proper care the polish typically lasts 1.5–2 years. Every piece is hand-checked before it's packed and dispatched.",
  },
  {
    question: "Is Viora Jewel jewellery safe for sensitive skin?",
    answer:
      "Most customers wear our pieces comfortably. If you have known metal sensitivities, do a short patch test before wearing a piece for long, and keep it away from water, perfume and sweat.",
  },
  {
    question: "Where does Viora Jewel ship?",
    answer: `Across India, through trusted courier partners. Prepaid orders (UPI, cards) get FREE delivery plus ₹${PREPAID_DISCOUNT} off; Cash on Delivery has a ₹${COD_CHARGE} delivery & handling charge. International shipping isn't available yet.`,
  },
  {
    question: "What is the return and exchange policy?",
    answer:
      "We exchange pieces that arrive damaged, wrong or with missing parts if you tell us within 48 hours of delivery, with a clear photo — from My Orders, or on WhatsApp if you checked out without an account. We don't exchange for change of mind, and we don't give refunds on delivered orders; if a replacement isn't available, you get store credit valid for 12 months.",
  },
  {
    question: "How should I care for my Viora Jewel jewellery?",
    answer:
      "Wipe each piece with a soft, dry cloth after wearing it; keep it away from perfume, alcohol-based products, water, sweat and harsh chemicals; and store it dry, in a pouch or box. With this routine the shine can last 1.5–2 years.",
  },
  {
    question: "How long does delivery take?",
    answer:
      "Orders placed before 8 pm ship the same day (Monday to Saturday); later orders ship the next working day. They usually arrive 5–7 business days after shipping. Remote pin codes can take up to 10 business days. You'll get tracking updates on WhatsApp, and can track any time on our Track Order page.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

/**
 * Full-width like every other section (slim side gutters, left-aligned heading):
 * heading + help on the left, questions on the right from md up; stacked on phones.
 * `limit` shows the first N questions with a "show all" toggle; the FAQ schema always lists every question.
 */
export default function FaqSection({ limit }: { limit?: number } = {}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [showAll, setShowAll] = useState(false);
  const visible = limit && !showAll ? FAQS.slice(0, limit) : FAQS;

  return (
    <section
      aria-labelledby="faq-heading"
      className="border-t border-silver-light bg-white px-4 py-10 md:px-6 md:py-14 lg:px-8"
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <div className="grid gap-6 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-12 lg:gap-16">
        <div className="md:sticky md:top-28 md:self-start">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Frequently asked</p>
          <h2 id="faq-heading" className="mt-1 font-playfair text-3xl font-bold text-primary md:text-4xl">
            Everything about Viora Jewel
          </h2>
          <p className="mt-2 text-sm text-gray-600 md:text-base">Materials, shipping, exchanges and care — answered.</p>

          <div className="mt-6 hidden border border-silver-light bg-platinum p-5 md:block">
            <p className="font-semibold text-primary">Still have a question?</p>
            <p className="mt-1 text-sm text-gray-600">Message us before you order — we&apos;re happy to help.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={whatsappLink("Hi Viora, I have a question")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center bg-[#1f7a4d] px-4 text-sm font-semibold text-white hover:bg-[#19663f]"
              >
                WhatsApp us
              </a>
              <Link
                href="/contact"
                className="inline-flex h-10 items-center border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
              >
                Contact us
              </Link>
            </div>
          </div>
        </div>

        <div>
          <ul className="divide-y divide-silver-light border-y border-silver-light">
            {visible.map((faq, i) => {
              const isOpen = openIndex === i;
              return (
                <li key={faq.question}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-trigger-${i}`}
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="group flex w-full items-center justify-between gap-4 py-4 text-left md:py-5"
                  >
                    <span
                      className={`text-[15px] font-semibold transition-colors md:text-base ${
                        isOpen ? "text-accent" : "text-primary group-hover:text-accent"
                      }`}
                    >
                      {faq.question}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                        isOpen ? "rotate-45 border-accent bg-accent text-white" : "border-gray-300 text-primary"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                  </button>

                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${i}`}
                    className={`grid overflow-hidden transition-all duration-300 ease-in-out ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="max-w-3xl pb-5 pr-12 text-sm leading-relaxed text-gray-600 md:text-[15px]">{faq.answer}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {limit && !showAll && FAQS.length > limit && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-5 inline-flex h-11 items-center border border-primary px-6 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
            >
              Show all {FAQS.length} questions
            </button>
          )}

          {/* Phones: help sits after the questions. */}
          <p className="mt-6 text-sm text-gray-600 md:hidden">
            Still have a question?{" "}
            <a
              href={whatsappLink("Hi Viora, I have a question")}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent underline-offset-4 hover:underline"
            >
              WhatsApp us
            </a>{" "}
            or{" "}
            <Link href="/contact" className="font-semibold text-accent underline-offset-4 hover:underline">
              contact us
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
