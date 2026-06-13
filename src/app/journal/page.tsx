import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getAllJournalPosts } from "@/lib/journal";

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function JournalIndexPage() {
  const posts = getAllJournalPosts();

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
    <main className="min-h-[calc(100vh-180px)] bg-platinum">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />

      <section className="relative overflow-hidden text-white">
        <Image
          src="/gsdjgds.png"
          alt="Rose-gold pendant and earring set on blush satin"
          fill
          priority
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/70 via-primary/50 to-primary/80" />
        <div className="relative max-w-5xl mx-auto px-4 md:px-8 py-20 md:py-32 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-white/80 mb-3">
            The Viora Journal
          </p>
          <h1 className="font-playfair text-4xl md:text-6xl font-bold leading-tight drop-shadow-sm">
            Jewellery, demystified.
          </h1>
          <p className="mt-5 max-w-2xl mx-auto text-white/90 text-base md:text-lg drop-shadow-sm">
            Honest guides on Indian fashion jewellery — care, styling, materials,
            and the small decisions that make a piece last longer.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 md:px-8 py-12 md:py-16">
        {posts.length === 0 ? (
          <p className="text-center text-gray-500 py-16">
            New stories coming soon.
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {posts.map((post) => (
              <li
                key={post.slug}
                className="group rounded-2xl border border-silver-light bg-white overflow-hidden shadow-sm hover:shadow-premium transition-all duration-300"
              >
                <Link href={`/journal/${post.slug}`} className="block p-6 md:p-8">
                  <p className="text-xs uppercase tracking-[0.2em] text-accent mb-3">
                    {post.category}
                  </p>
                  <h2 className="font-playfair text-2xl md:text-3xl font-bold text-primary leading-snug group-hover:text-accent transition-colors">
                    {post.title}
                  </h2>
                  <p className="mt-3 text-sm md:text-base text-gray-600 leading-relaxed line-clamp-3">
                    {post.description}
                  </p>
                  <div className="mt-5 flex items-center gap-3 text-xs text-gray-500">
                    <span>{post.author}</span>
                    <span className="text-gray-300">•</span>
                    <span>{formatDate(post.publishedAt)}</span>
                    {post.readingMinutes && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span>{post.readingMinutes} min read</span>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
