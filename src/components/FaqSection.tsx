"use client";

import { useState } from "react";

type Faq = { question: string; answer: string };

const FAQS: Faq[] = [
  {
    question: "What is Viora Jewel?",
    answer:
      "Viora Jewel is an Indian direct-to-consumer brand offering curated everyday fashion jewellery — sets, earrings, necklaces and rings designed for daily wear, gifting, weddings, receptions and office occasions, with most pieces priced under ₹649.",
  },
  {
    question: "Is Viora Jewel jewellery real gold or gold-plated?",
    answer:
      "Neither. Viora Jewel pieces are curated fashion jewellery — not real gold and not gold-plated. They're designed to give you an elegant, occasion-ready look at an everyday price, so you can style boldly without worrying about the cost.",
  },
  {
    question: "What materials does Viora Jewel use?",
    answer:
      "Our pieces are fashion jewellery finished with decorative crystal-style and pearl-style accents, depending on the design. Every piece is hand-checked and inspected before it's packaged and dispatched to you.",
  },
  {
    question: "Is Viora Jewel jewellery safe for sensitive skin?",
    answer:
      "Most customers wear our pieces comfortably for everyday occasions. If you have known metal sensitivities, we recommend a short patch test before extended wear. Always avoid contact with water, perfume and sweat — this keeps both the finish and your skin happy.",
  },
  {
    question: "Where does Viora Jewel ship?",
    answer:
      "We ship pan-India through trusted courier partners including Bluedart, Delhivery and India Post. Free delivery on every order with no minimum cart value. Cash on Delivery and prepaid options (UPI, cards, RuPay) are available at checkout. International shipping isn't available currently.",
  },
  {
    question: "What is the return and exchange policy?",
    answer:
      "We offer a 48-hour exchange on pieces that arrive damaged, incorrect, or with missing parts. Raise the request from My Orders within 48 hours of delivery with a clear photo. Change-of-mind or styling-based exchanges aren't supported. We don't offer refunds — if an exact replacement isn't available, we issue store credit valid for 12 months.",
  },
  {
    question: "How should I care for my Viora Jewel jewellery?",
    answer:
      "Keep your jewellery away from water, perfume, sweat and harsh chemicals. Store each piece in an airtight pouch or box and wipe gently with a soft dry cloth after wear. With this simple routine, the finish and stones stay looking fresh for far longer.",
  },
  {
    question: "How long does delivery take?",
    answer:
      "Orders are processed within 1–2 business days and typically delivered within 5–7 business days from dispatch. Remote pin codes may take up to 10 business days. You'll receive a tracking link by email and SMS as soon as your order ships.",
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

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      aria-labelledby="faq-heading"
      className="w-full bg-gradient-to-b from-white to-rose-50/40 py-16 sm:py-24"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-xs sm:text-sm font-medium uppercase tracking-[0.2em] text-[#9B1B30]">
            Frequently Asked
          </p>
          <h2
            id="faq-heading"
            className="mt-3 text-3xl sm:text-4xl font-playfair font-bold text-primary"
          >
            Everything about Viora Jewel
          </h2>
          <p className="mt-3 text-sm sm:text-base text-gray-600">
            Materials, shipping, exchanges and care — answered.
          </p>
        </div>

        <ul className="space-y-3 sm:space-y-4">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <li
                key={faq.question}
                className="rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  id={`faq-trigger-${i}`}
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 sm:px-6 py-4 sm:py-5 text-left"
                >
                  <span className="text-base sm:text-lg font-medium text-neutral-900">
                    {faq.question}
                  </span>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-700 transition-transform duration-300 ${
                      isOpen
                        ? "rotate-45 bg-[#9B1B30] text-white border-[#9B1B30]"
                        : ""
                    }`}
                    aria-hidden="true"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
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
                    isOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 sm:px-6 pb-5 sm:pb-6 text-sm sm:text-base leading-relaxed text-gray-600">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-10 text-center">
          <p className="text-sm text-gray-600">
            Still have a question?{" "}
            <a
              href="/contact"
              className="font-medium text-[#9B1B30] underline-offset-4 hover:underline"
            >
              Talk to our team
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
