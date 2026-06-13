import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import BackButton from "@/components/BackButton";
import {
  getAllJournalSlugs,
  getJournalPost,
  getAllJournalPosts,
} from "@/lib/journal";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.viorajewel.in"
).replace(/\/$/, "");

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

export default function JournalArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const post = getJournalPost(params.slug);
  if (!post) notFound();

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

  const related = getAllJournalPosts()
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2);

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

      <div className="bg-platinum">
        <div className="max-w-3xl mx-auto px-4 md:px-8 pt-8 pb-4">
          <div className="flex items-center gap-2 mb-6">
            <BackButton className="bg-white shadow-sm" />
            <span className="text-sm font-medium text-gray-500">
              <Link href="/journal" className="hover:text-primary">
                ← All articles
              </Link>
            </span>
          </div>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <header className="mb-10 pb-8 border-b border-silver-light">
          <p className="text-xs uppercase tracking-[0.25em] text-accent mb-3">
            {post.category}
          </p>
          <h1 className="font-playfair text-3xl md:text-5xl font-bold text-primary leading-tight">
            {post.title}
          </h1>
          <p className="mt-5 text-lg text-gray-600 leading-relaxed">
            {post.description}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>
              <strong className="text-primary">{post.author}</strong>
              {post.authorRole && (
                <span className="text-gray-500"> · {post.authorRole}</span>
              )}
            </span>
            <span className="text-gray-300">•</span>
            <time dateTime={post.publishedAt}>
              {formatDate(post.publishedAt)}
            </time>
            {post.readingMinutes && (
              <>
                <span className="text-gray-300">•</span>
                <span>{post.readingMinutes} min read</span>
              </>
            )}
          </div>
        </header>

        <div className="prose-viora">
          <MDXRemote source={post.content} components={mdxComponents as any} />
        </div>
      </article>

      {related.length > 0 && (
        <section className="bg-platinum">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-12 md:py-16">
            <h2 className="font-playfair text-2xl md:text-3xl font-bold text-primary mb-6">
              Keep reading
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/journal/${r.slug}`}
                  className="block rounded-2xl border border-silver-light bg-white p-6 shadow-sm hover:shadow-premium transition-all"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-accent mb-2">
                    {r.category}
                  </p>
                  <h3 className="font-playfair text-xl font-bold text-primary leading-snug">
                    {r.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                    {r.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
