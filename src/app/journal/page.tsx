import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getAllJournalPosts, type JournalPost } from "@/lib/journal";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.viorajewel.in"
).replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Viora Journal — Jewellery Guides, Care Tips & Styling",
  description:
    "Honest guides on Indian fashion jewellery: care, styling, materials, gifting and buying tips from the Viora Jewel team.",
  alternates: { canonical: "/journal" },
  openGraph: {
    title: "Viora Journal",
    description:
      "Honest guides on Indian fashion jewellery: care, styling, materials, gifting and buying tips.",
    url: `${SITE_URL}/journal`,
    type: "website",
  },
};

/**
 * The guide shown first. Point it at whatever the season needs (festive gifting
 * now; switch after Bhai Dooj) — it falls back to the newest post if missing.
 */
const FEATURED_SLUG = "karwa-chauth-diwali-jewellery-gift-guide";

/** Topic order on the page; unknown categories are appended. */
const TOPIC_ORDER = ["Gifting Guide", "Styling Guide", "Occasion Guide", "Buyer Guide", "Care Guide", "Cultural Guide"];

const topicId = (category: string) => category.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const PostCard = ({ post }: { post: JournalPost }) => (
  <li>
    <Link
      href={`/journal/${post.slug}`}
      className="group block h-full border border-silver-light bg-white p-5 transition-shadow hover:shadow-premium"
    >
      <h3 className="font-playfair text-xl font-bold leading-snug text-primary transition-colors group-hover:text-accent">
        {post.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">{post.description}</p>
      {post.readingMinutes && <p className="mt-3 text-xs text-gray-500">{post.readingMinutes} min read</p>}
    </Link>
  </li>
);

export default function JournalIndexPage() {
  const posts = getAllJournalPosts();
  const featured = posts.find((p) => p.slug === FEATURED_SLUG) || posts[0];
  const rest = posts.filter((p) => p !== featured);

  const categories = Array.from(new Set(rest.map((p) => p.category))).sort((a, b) => {
    const ia = TOPIC_ORDER.indexOf(a);
    const ib = TOPIC_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Viora Journal",
    url: `${SITE_URL}/journal`,
    description:
      "Guides on Indian fashion jewellery: care, styling, materials, gifting and buying tips.",
    publisher: { "@type": "Organization", name: "Viora Jewel" },
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}/journal/${p.slug}`,
      datePublished: p.publishedAt,
      dateModified: p.updatedAt || p.publishedAt,
      author: { "@type": "Person", name: p.author },
    })),
  };

  return (
    <main className="min-h-[calc(100vh-180px)] bg-platinum text-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />

      <div className="mx-auto max-w-5xl px-4 pt-4 md:px-8 md:pt-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-gray-500">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-primary">Journal</span>
        </nav>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-accent">The Viora Journal</p>
        <h1 className="mt-1 font-playfair text-[32px] font-bold leading-tight md:text-5xl">Jewellery, demystified.</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600 md:text-base">
          Honest guides on Indian fashion jewellery — gifting, styling, materials and care.
        </p>

        {categories.length > 0 && (
          <nav aria-label="Topics" className="mt-4">
            <ul className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {categories.map((c) => (
                <li key={c} className="shrink-0">
                  <a
                    href={`#${topicId(c)}`}
                    className="flex h-9 items-center rounded-full border border-gray-300 bg-white px-4 text-[13px] font-semibold hover:border-accent"
                  >
                    {c.replace(/ Guide$/, "")}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {posts.length === 0 ? (
        <p className="py-16 text-center text-gray-500">New stories coming soon.</p>
      ) : (
        <div className="mx-auto max-w-5xl px-4 pb-12 pt-6 md:px-8 md:pb-16">
          {featured && (
            <Link
              href={`/journal/${featured.slug}`}
              className="group grid overflow-hidden border border-silver-light bg-white transition-shadow hover:shadow-premium md:grid-cols-2"
            >
              <div className="relative aspect-[16/9] bg-platinum md:aspect-auto md:min-h-[280px]">
                <Image
                  src={featured.coverImage || "/journal-hero-rose-tone-set.jpg"}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-col justify-center p-5 md:p-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
                  Featured · {featured.category}
                </p>
                <h2 className="mt-2 font-playfair text-2xl font-bold leading-snug transition-colors group-hover:text-accent md:text-3xl">
                  {featured.title}
                </h2>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-600 md:text-base">
                  {featured.description}
                </p>
                <p className="mt-4 text-xs text-gray-500">
                  {formatDate(featured.updatedAt || featured.publishedAt)}
                  {featured.readingMinutes ? ` · ${featured.readingMinutes} min read` : ""}
                </p>
              </div>
            </Link>
          )}

          {categories.map((category) => (
            <section key={category} id={topicId(category)} aria-labelledby={`${topicId(category)}-title`} className="mt-10 scroll-mt-24">
              <h2 id={`${topicId(category)}-title`} className="font-playfair text-2xl font-bold md:text-3xl">
                {category}s
              </h2>
              <ul className="mt-4 grid gap-3 md:grid-cols-2 md:gap-5">
                {rest
                  .filter((p) => p.category === category)
                  .map((post) => (
                    <PostCard key={post.slug} post={post} />
                  ))}
              </ul>
            </section>
          ))}

          <section className="mt-12 flex flex-col gap-4 bg-primary p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
            <div>
              <h2 className="font-playfair text-2xl font-bold">Read enough? Shop the pieces.</h2>
              <p className="mt-1 text-sm text-white/75">Diamond-style necklace sets and earrings, hand-checked in Kolkata.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/list?cat=best-sellers#product-grid"
                className="inline-flex h-12 items-center bg-white px-6 text-sm font-bold uppercase tracking-wider text-primary hover:bg-platinum"
              >
                Best sellers
              </Link>
              <Link
                href="/list#product-grid"
                className="inline-flex h-12 items-center border border-white/60 px-6 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/10"
              >
                All jewellery
              </Link>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
