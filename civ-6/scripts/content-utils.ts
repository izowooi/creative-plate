import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  calculateReadingMinutes,
  contentFrontmatterSchema,
  makeSummary,
  normalizeSource,
  type Entry,
} from "../src/lib/content";

const docsRoot = path.resolve(process.cwd(), "docs");

export function getMarkdownPaths() {
  if (!fs.existsSync(docsRoot)) return [];

  return fs
    .readdirSync(docsRoot, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith(".md") && item.name !== "README.md")
    .map((item) => path.join(item.parentPath, item.name))
    .sort();
}

export function loadMarkdownEntries(): Entry[] {
  return getMarkdownPaths().map((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    const parsed = matter(source);
    const frontmatter = contentFrontmatterSchema.parse(parsed.data);
    const slug = path.basename(filePath, ".md");

    return {
      ...frontmatter,
      slug,
      body: parsed.content.trim(),
      summary: makeSummary(parsed.content, frontmatter.summary),
      sources: frontmatter.sources.map(normalizeSource),
      readingMinutes: calculateReadingMinutes(parsed.content),
    };
  });
}
