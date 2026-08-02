import "server-only";

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { Category, Entry, Source } from "@/lib/content";

type EntryRow = {
  id: string;
  slug: string;
  name: string;
  name_en: string;
  category: Category;
  subcategory: string;
  era: string;
  lifespan: string;
  civilization: string;
  region: string;
  tags_json: string;
  image: string;
  image_alt: string;
  image_credit: string;
  image_license: string;
  image_source: string;
  accent: string;
  featured: number;
  quote: string;
  summary: string;
  body: string;
  related_json: string;
  sources_json: string;
  reading_minutes: number;
};

const dbPath = path.join(process.cwd(), "data", "the-turn.db");

const globalForDb = globalThis as typeof globalThis & {
  turnDb?: DatabaseSync;
};

function getDb() {
  if (!globalForDb.turnDb) {
    globalForDb.turnDb = new DatabaseSync(dbPath, { readOnly: true });
  }
  return globalForDb.turnDb;
}

function fromRow(row: EntryRow): Entry {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameEn: row.name_en,
    category: row.category,
    subcategory: row.subcategory,
    era: row.era,
    lifespan: row.lifespan,
    civilization: row.civilization,
    region: row.region,
    tags: JSON.parse(row.tags_json) as string[],
    image: row.image,
    imageAlt: row.image_alt,
    imageCredit: row.image_credit,
    imageLicense: row.image_license,
    imageSource: row.image_source,
    accent: row.accent,
    featured: Boolean(row.featured),
    quote: row.quote,
    summary: row.summary,
    body: row.body,
    related: JSON.parse(row.related_json) as string[],
    sources: JSON.parse(row.sources_json) as Source[],
    readingMinutes: row.reading_minutes,
  };
}

export function getAllEntries() {
  const rows = getDb()
    .prepare(
      `SELECT * FROM entries
       ORDER BY featured DESC, category ASC, name COLLATE NOCASE ASC`,
    )
    .all() as EntryRow[];
  return rows.map(fromRow);
}

export function getEntryBySlug(slug: string) {
  const row = getDb().prepare("SELECT * FROM entries WHERE slug = ?").get(slug) as
    | EntryRow
    | undefined;
  return row ? fromRow(row) : null;
}

export function getRelatedEntries(entry: Entry, limit = 3) {
  const explicit = entry.related
    .map((slug) => getEntryBySlug(slug))
    .filter((item): item is Entry => Boolean(item));

  if (explicit.length >= limit) return explicit.slice(0, limit);

  const exclude = new Set([entry.slug, ...explicit.map((item) => item.slug)]);
  const contextual = getAllEntries()
    .filter((item) => !exclude.has(item.slug))
    .map((item) => ({
      item,
      score:
        (item.era === entry.era ? 3 : 0) +
        (item.civilization && item.civilization === entry.civilization ? 4 : 0) +
        item.tags.filter((tag) => entry.tags.includes(tag)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);

  return [...explicit, ...contextual].slice(0, limit);
}

export function getCategoryCounts() {
  const rows = getDb()
    .prepare("SELECT category, COUNT(*) as count FROM entries GROUP BY category")
    .all() as { category: Category; count: number }[];
  return Object.fromEntries(rows.map((row) => [row.category, row.count])) as Partial<
    Record<Category, number>
  >;
}

export function searchEntries(query: string, limit = 10) {
  const tokens = query.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return getAllEntries().slice(0, limit);
  const ftsQuery = tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
  const rows = getDb()
    .prepare(
      `SELECT e.*
       FROM entries_fts AS f
       JOIN entries AS e ON e.rowid = f.rowid
       WHERE entries_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(ftsQuery, limit) as EntryRow[];
  return rows.map(fromRow);
}
