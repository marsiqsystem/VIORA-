import fs from "fs";
import path from "path";
import matter from "gray-matter";

const JOURNAL_DIR = path.join(process.cwd(), "content", "journal");

export interface JournalFrontmatter {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
  updatedAt?: string;
  author: string;
  authorRole?: string;
  category: string;
  tags?: string[];
  coverImage?: string;
  readingMinutes?: number;
}

export interface JournalPost extends JournalFrontmatter {
  content: string;
}

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function getAllJournalSlugs(): string[] {
  if (!fs.existsSync(JOURNAL_DIR)) return [];
  return fs
    .readdirSync(JOURNAL_DIR)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))
    .map((f) => f.replace(/\.mdx?$/, ""));
}

export function getJournalPost(slug: string): JournalPost | null {
  const mdx = readFileIfExists(path.join(JOURNAL_DIR, `${slug}.mdx`));
  const md = mdx ?? readFileIfExists(path.join(JOURNAL_DIR, `${slug}.md`));
  if (!md) return null;

  const { data, content } = matter(md);
  const fm = data as Partial<JournalFrontmatter>;
  if (!fm.title || !fm.description || !fm.publishedAt || !fm.author || !fm.category) {
    return null;
  }
  return {
    title: fm.title,
    description: fm.description,
    slug,
    publishedAt: fm.publishedAt,
    updatedAt: fm.updatedAt,
    author: fm.author,
    authorRole: fm.authorRole,
    category: fm.category,
    tags: fm.tags,
    coverImage: fm.coverImage,
    readingMinutes: fm.readingMinutes,
    content,
  };
}

export function getAllJournalPosts(): JournalPost[] {
  return getAllJournalSlugs()
    .map((slug) => getJournalPost(slug))
    .filter((p): p is JournalPost => p !== null)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
}
