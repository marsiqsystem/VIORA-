import Link from "next/link";
import { whatsappLink } from "@/lib/contact";

export const POLICY_EMAIL = "mail@viorajewel.in";

const POLICIES = [
  { href: "/shipping-policy", label: "Shipping" },
  { href: "/exchange-policy", label: "Exchanges" },
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/terms-and-conditions", label: "Terms" },
];

type Props = {
  path: string;
  eyebrow: string;
  title: string;
  /** e.g. "15 September 2026" */
  updated: string;
  /** Plain-words key points, shown before the full text. */
  summary: string[];
  /** Section anchors for long policies. */
  toc?: { id: string; title: string }[];
  children: React.ReactNode;
};

/**
 * Shared frame for the policy pages: the short version first, the full text,
 * links to the other policies, and a way to ask a person.
 */
const PolicyPage = ({ path, eyebrow, title, updated, summary, toc, children }: Props) => (
  <main className="bg-platinum text-primary">
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-4 md:px-6 md:pb-16 md:pt-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-gray-500">
        <Link href="/" className="hover:text-accent">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-primary">{title}</span>
      </nav>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h1 className="mt-1 font-playfair text-[32px] font-bold leading-tight md:text-5xl">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">Last updated: {updated}</p>

      <section aria-label="In short" className="mt-6 border border-accent/30 bg-white p-5">
        <h2 className="font-inter text-[11px] font-bold uppercase tracking-[0.2em] text-accent">In short</h2>
        <ul className="mt-3 space-y-2">
          {summary.map((point) => (
            <li key={point} className="flex gap-2.5 text-[15px] leading-snug">
              <span aria-hidden="true" className="mt-0.5 text-green-700">
                ✓
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      {toc && toc.length > 0 && (
        <nav aria-label="On this page" className="mt-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">On this page</p>
          <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {toc.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-primary underline-offset-4 hover:text-accent hover:underline">
                  {item.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-gray-700 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mb-3 [&_h2]:font-playfair [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-primary [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_section]:scroll-mt-24 [&_strong]:text-primary [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>

      <nav aria-label="Other policies" className="mt-10 border-t border-silver-light pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">Our policies</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {POLICIES.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={p.href === path ? "page" : undefined}
                className={`flex h-9 items-center rounded-full border px-4 text-sm font-semibold ${
                  p.href === path ? "border-primary bg-primary text-white" : "border-gray-300 bg-white text-primary hover:border-accent"
                }`}
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 flex flex-col gap-3 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <b>Still have a question?</b> <span className="text-gray-600">Ask us before you order.</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={whatsappLink("Hi Viora, I have a question about your policies")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center bg-[#1f7a4d] px-4 text-sm font-semibold text-white hover:bg-[#19663f]"
          >
            WhatsApp us
          </a>
          <a
            href={`mailto:${POLICY_EMAIL}`}
            className="flex h-10 items-center border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Email us
          </a>
        </div>
      </div>
    </div>
  </main>
);

export default PolicyPage;
