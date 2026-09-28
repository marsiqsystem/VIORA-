import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import ShopPicks from "@/components/journal/ShopPicks";
import { COD_CHARGE, PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { getJournalCatalog } from "@/lib/journalCatalog";
import {
  getAllJournalSlugs,
  getJournalPost,
  getAllJournalPosts,
} from "@/lib/journal";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.viorajewel.in"
).replace(/\/$/, "");

// Articles embed live product cards (<ShopPicks>). Re-render hourly so prices
// and sold-out state don't freeze at build time — roughly half the catalog is
// out of stock at any moment, and the picks are filtered on stock.
export const revalidate = 3600;

export function generateStaticParams() {
  return getAllJournalSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const post = getJournalPost(params.slug);
  if (!post) return { title: "Not found" };
  const url = `${SITE_URL}/journal/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/journal/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      authors: [post.author],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const mdxComponents = {
  h2: (props: any) => (
    <h2
      className="font-playfair text-2xl md:text-3xl font-bold text-primary mt-12 mb-4"
      {...props}
    />
  ),
  h3: (props: any) => (
    <h3
      className="font-playfair text-xl md:text-2xl font-semibold text-primary mt-8 mb-3"
      {...props}
    />
  ),
  p: (props: any) => (
    <p className="text-base leading-relaxed text-gray-700 my-4" {...props} />
  ),
  ul: (props: any) => (
    <ul className="list-disc pl-6 my-4 space-y-2 text-gray-700" {...props} />
  ),
  ol: (props: any) => (
    <ol className="list-decimal pl-6 my-4 space-y-2 text-gray-700" {...props} />
  ),
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  a: (props: any) => (
    <a className="text-accent underline underline-offset-2 hover:no-underline" {...props} />
  ),
  strong: (props: any) => (
    <strong className="font-semibold text-primary" {...props} />
  ),
  table: (props: any) => (
    <div className="my-6 overflow-x-auto">
      <table
        className="min-w-full border-collapse border border-silver-light text-sm"
        {...props}
      />
    </div>
  ),
  th: (props: any) => (
    <th
      className="border border-silver-light bg-platinum px-4 py-2 text-left font-semibold text-primary"
      {...props}
    />
  ),
  td: (props: any) => (
    <td
      className="border border-silver-light px-4 py-2 text-gray-700"
      {...props}
    />
  ),
  blockquote: (props: any) => (
    <blockquote
      className="my-6 border-l-4 border-accent bg-accent/5 pl-5 py-3 italic text-gray-700"
      {...props}
    />
  ),
};

export default async function JournalArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const post = getJournalPost(params.slug);
  if (!post) notFound();

  // Fetched once here and handed to every <ShopPicks> in the article, so the
  // MDX components stay synchronous — next-mdx-remote renders them inline and
  // an async component in the map is the one thing that would break it.
  const catalog = await getJournalCatalog();

  const components = {
    ...mdxComponents,
    ShopPicks: (props: Record<string, unknown>) => (
      <ShopPicks {...(props as any)} catalog={catalog} />
    ),
  };

  const url = `${SITE_URL}/journal/${post.slug}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    inLanguage: "en-IN",
    articleSection: post.category,
    keywords: post.tags?.join(", "),
    author: {
      "@type": "Person",
      name: post.author,
      jobTitle: post.authorRole,
    },
    publisher: {
      "@type": "Organization",
      name: "Viora Jewel",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo%20compressed.png`,
      },
    },
    ...(post.coverImage
      ? { image: post.coverImage.startsWith("http") ? post.coverImage : `${SITE_URL}${post.coverImage}` }
      : {}),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Journal",
        item: `${SITE_URL}/journal`,
      },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  // Same topic first, then the newest of the rest.
  const others = getAllJournalPosts().filter((p) => p.slug !== post.slug);
  const related = [
    ...others.filter((p) => p.category === post.category),
    ...others.filter((p) => p.category !== post.category),
  ].slice(0, 3);

  const updated = post.updatedAt && post.updatedAt !== post.publishedAt ? post.updatedAt : null;

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <article className="mx-auto max-w-3xl px-4 pb-8 pt-4 md:px-8 md:pb-12 md:pt-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/journal" className="hover:text-accent">
            Journal
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-primary">{post.category}</span>
        </nav>

        <header className="mb-8 mt-4 border-b border-silver-light pb-6">
          <h1 className="font-playfair text-[30px] font-bold leading-tight text-primary md:text-5xl">
            {post.title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-gray-600 md:text-lg">
            {post.description}
          </p>
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
            <span>
              <strong className="text-primary">{post.author}</strong>
              {post.authorRole && <span> · {post.authorRole}</span>}
            </span>
            <span className="text-gray-300" aria-hidden="true">
              •
            </span>
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            {updated && (
              <>
                <span className="text-gray-300" aria-hidden="true">
                  •
                </span>
                <span>
                  Updated <time dateTime={updated}>{formatDate(updated)}</time>
                </span>
              </>
            )}
            {post.readingMinutes && (
              <>
                <span className="text-gray-300" aria-hidden="true">
                  •
                </span>
                <span>{post.readingMinutes} min read</span>
              </>
            )}
          </p>
        </header>

        <div className="prose-viora">
          <MDXRemote
            source={post.content}
            components={components as any}
            // GFM for the tables many guides use (MDX alone leaves them as raw pipes).
            options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
          />
        </div>
      </article>

      <section aria-labelledby="journal-shop-title" className="bg-primary px-4 py-10 text-white md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 id="journal-shop-title" className="font-playfair text-2xl font-bold md:text-3xl">
              Ready to find your piece?
            </h2>
            <p className="mt-1 text-sm text-white/75">
              Diamond-style sets and earrings · FREE delivery + ₹{PREPAID_DISCOUNT} off paying online · COD ₹{COD_CHARGE} ·
              48-hour exchange on damaged pieces
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/list?cat=best-sellers#product-grid"
              className="inline-flex h-12 items-center bg-white px-6 text-sm font-bold uppercase tracking-wider text-primary hover:bg-platinum"
            >
              Shop best sellers
            </Link>
            <Link
              href="/list#product-grid"
              className="inline-flex h-12 items-center border border-white/60 px-6 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/10"
            >
              All jewellery
            </Link>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="bg-platinum">
          <div className="mx-auto max-w-5xl px-4 py-12 md:px-8 md:py-16">
            <h2 className="mb-6 font-playfair text-2xl font-bold text-primary md:text-3xl">
              Keep reading
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/journal/${r.slug}`}
                  className="block border border-silver-light bg-white p-5 transition-shadow hover:shadow-premium"
                >
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
                    {r.category}
                  </p>
                  <h3 className="font-playfair text-lg font-bold leading-snug text-primary">
                    {r.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-gray-600">{r.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
