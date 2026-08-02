import "server-only";

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { greatWorkRulesetValues } from "@/lib/content";
import type {
  Category,
  CityRole,
  Entry,
  EntryPreview,
  EntryReference,
  GreatWorkGameContext,
  GreatWorkImageRole,
  GreatWorkMetadata,
  GreatWorkPreviewMetadata,
  Source,
} from "@/lib/content";

type JoinedGreatWorkRow = {
  great_work_game_id: string | null;
  great_work_creator_id: string | null;
  great_work_game_era: string | null;
  great_work_pack: string | null;
  great_work_ruleset_profile: string | null;
  great_work_rulesets_json: string | null;
  great_work_historical_title: string | null;
  great_work_creation_json: string | null;
  great_work_attribution: string | null;
  great_work_holding_json: string | null;
  great_work_rights_json: string | null;
  great_work_image_role: GreatWorkImageRole | null;
  great_work_audio_json: string | null;
  creator_ref_id: string | null;
  creator_ref_slug: string | null;
  creator_ref_name: string | null;
  creator_ref_name_en: string | null;
};

type EntryRow = JoinedGreatWorkRow & {
  id: string;
  slug: string;
  name: string;
  name_en: string;
  category: Category;
  subcategory: string;
  city_roles_json: string;
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

type EntryPreviewRow = {
  id: string;
  slug: string;
  name: string;
  name_en: string;
  category: Category;
  subcategory: string;
  city_roles_json: string;
  era: string;
  lifespan: string;
  civilization: string;
  region: string;
  tags_json: string;
  image: string;
  image_alt: string;
  image_credit: string;
  image_license: string;
  accent: string;
  featured: number;
  summary: string;
  reading_minutes: number;
  great_work_creator_id: string | null;
  great_work_game_era: string | null;
  great_work_pack: string | null;
  great_work_creation_label: string | null;
  great_work_year_start: number | null;
  great_work_year_end: number | null;
  great_work_image_role: GreatWorkImageRole | null;
  great_work_audio_status: "available" | "unavailable" | null;
  creator_ref_id: string | null;
  creator_ref_slug: string | null;
  creator_ref_name: string | null;
  creator_ref_name_en: string | null;
};

const dbPath = path.join(process.cwd(), "data", "the-turn.db");

const globalForDb = globalThis as typeof globalThis & {
  turnDb?: DatabaseSync;
};

const greatWorkJoins = `
  LEFT JOIN great_works AS gw ON gw.entry_id = e.id
  LEFT JOIN entries AS creator ON creator.id = gw.creator_id
`;

const joinedGreatWorkColumns = `
  gw.game_id AS great_work_game_id,
  gw.creator_id AS great_work_creator_id,
  gw.game_era AS great_work_game_era,
  gw.pack AS great_work_pack,
  gw.ruleset_profile AS great_work_ruleset_profile,
  gw.rulesets_json AS great_work_rulesets_json,
  gw.historical_title AS great_work_historical_title,
  gw.creation_json AS great_work_creation_json,
  gw.attribution AS great_work_attribution,
  gw.holding_json AS great_work_holding_json,
  gw.work_rights_json AS great_work_rights_json,
  gw.image_role AS great_work_image_role,
  gw.audio_json AS great_work_audio_json,
  creator.id AS creator_ref_id,
  creator.slug AS creator_ref_slug,
  creator.name AS creator_ref_name,
  creator.name_en AS creator_ref_name_en
`;

const previewColumns = `
  e.id,
  e.slug,
  e.name,
  e.name_en,
  e.category,
  e.subcategory,
  e.city_roles_json,
  e.era,
  e.lifespan,
  e.civilization,
  e.region,
  e.tags_json,
  e.image,
  e.image_alt,
  e.image_credit,
  e.image_license,
  e.accent,
  e.featured,
  e.summary,
  e.reading_minutes,
  gw.creator_id AS great_work_creator_id,
  gw.game_era AS great_work_game_era,
  gw.pack AS great_work_pack,
  json_extract(gw.creation_json, '$.label') AS great_work_creation_label,
  json_extract(gw.creation_json, '$.yearStart') AS great_work_year_start,
  json_extract(gw.creation_json, '$.yearEnd') AS great_work_year_end,
  gw.image_role AS great_work_image_role,
  json_extract(gw.audio_json, '$.status') AS great_work_audio_status,
  creator.id AS creator_ref_id,
  creator.slug AS creator_ref_slug,
  creator.name AS creator_ref_name,
  creator.name_en AS creator_ref_name_en
`;

function getDb() {
  if (!globalForDb.turnDb) {
    globalForDb.turnDb = new DatabaseSync(dbPath, { readOnly: true });
  }
  return globalForDb.turnDb;
}

function optionalText(value: string) {
  return value || undefined;
}

function creatorReference(row: {
  creator_ref_id: string | null;
  creator_ref_slug: string | null;
  creator_ref_name: string | null;
  creator_ref_name_en: string | null;
}): EntryReference | undefined {
  if (
    !row.creator_ref_id ||
    !row.creator_ref_slug ||
    !row.creator_ref_name ||
    !row.creator_ref_name_en
  ) return undefined;
  return {
    id: row.creator_ref_id,
    slug: row.creator_ref_slug,
    name: row.creator_ref_name,
    nameEn: row.creator_ref_name_en,
  };
}

function gameContextFromRow(row: JoinedGreatWorkRow): GreatWorkGameContext | undefined {
  if (
    !row.great_work_game_era ||
    !row.great_work_pack ||
    !row.great_work_ruleset_profile ||
    !row.great_work_rulesets_json
  ) return undefined;

  const stored = JSON.parse(row.great_work_rulesets_json) as GreatWorkGameContext["rulesets"] & {
    note?: string;
  };
  const rulesets = Object.fromEntries(
    greatWorkRulesetValues.map((ruleset) => [ruleset, stored[ruleset]]),
  ) as GreatWorkGameContext["rulesets"];
  return {
    gameEra: row.great_work_game_era,
    pack: row.great_work_pack,
    rulesetProfile: row.great_work_ruleset_profile,
    rulesets,
    note: stored.note,
  };
}

function greatWorkFromRow(row: JoinedGreatWorkRow): GreatWorkMetadata | undefined {
  if (
    !row.great_work_game_id ||
    !row.great_work_creator_id ||
    !row.great_work_historical_title ||
    !row.great_work_creation_json ||
    !row.great_work_attribution ||
    !row.great_work_holding_json ||
    !row.great_work_rights_json ||
    !row.great_work_image_role ||
    !row.great_work_audio_json
  ) return undefined;

  return {
    gameId: row.great_work_game_id,
    creatorId: row.great_work_creator_id,
    historicalTitle: row.great_work_historical_title,
    creation: JSON.parse(row.great_work_creation_json) as GreatWorkMetadata["creation"],
    attribution: row.great_work_attribution,
    holding: JSON.parse(row.great_work_holding_json) as GreatWorkMetadata["holding"],
    workRights: JSON.parse(row.great_work_rights_json) as GreatWorkMetadata["workRights"],
    imageRole: row.great_work_image_role,
    audio: JSON.parse(row.great_work_audio_json) as GreatWorkMetadata["audio"],
    creatorRef: creatorReference(row),
    gameContext: gameContextFromRow(row),
  };
}

function greatWorkPreviewFromRow(row: EntryPreviewRow): GreatWorkPreviewMetadata | undefined {
  if (
    !row.great_work_creator_id ||
    !row.great_work_game_era ||
    !row.great_work_pack ||
    !row.great_work_creation_label ||
    !row.great_work_image_role ||
    !row.great_work_audio_status
  ) return undefined;

  return {
    creatorId: row.great_work_creator_id,
    creatorRef: creatorReference(row),
    creationLabel: row.great_work_creation_label,
    yearStart: row.great_work_year_start ?? undefined,
    yearEnd: row.great_work_year_end ?? undefined,
    gameEra: row.great_work_game_era,
    pack: row.great_work_pack,
    imageRole: row.great_work_image_role,
    audioStatus: row.great_work_audio_status,
    hasAudio: row.great_work_audio_status === "available",
  };
}

function fromRow(row: EntryRow): Entry {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameEn: row.name_en,
    category: row.category,
    subcategory: row.subcategory,
    cityRoles: JSON.parse(row.city_roles_json) as CityRole[],
    era: row.era,
    lifespan: row.lifespan,
    civilization: row.civilization,
    region: row.region,
    tags: JSON.parse(row.tags_json) as string[],
    image: optionalText(row.image),
    imageAlt: optionalText(row.image_alt),
    imageCredit: optionalText(row.image_credit),
    imageLicense: optionalText(row.image_license),
    imageSource: optionalText(row.image_source),
    accent: row.accent,
    featured: Boolean(row.featured),
    quote: row.quote,
    summary: row.summary,
    body: row.body,
    related: JSON.parse(row.related_json) as string[],
    sources: JSON.parse(row.sources_json) as Source[],
    readingMinutes: row.reading_minutes,
    greatWork: greatWorkFromRow(row),
  };
}

function previewFromRow(row: EntryPreviewRow): EntryPreview {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameEn: row.name_en,
    category: row.category,
    subcategory: row.subcategory,
    cityRoles: JSON.parse(row.city_roles_json) as CityRole[],
    era: row.era,
    lifespan: row.lifespan,
    civilization: row.civilization,
    region: row.region,
    tags: JSON.parse(row.tags_json) as string[],
    image: optionalText(row.image),
    imageAlt: optionalText(row.image_alt),
    imageCredit: optionalText(row.image_credit),
    imageLicense: optionalText(row.image_license),
    accent: row.accent,
    featured: Boolean(row.featured),
    summary: row.summary,
    readingMinutes: row.reading_minutes,
    greatWork: greatWorkPreviewFromRow(row),
  };
}

function normalizedFtsQuery(query: string) {
  const tokens = query.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return null;
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
}

export function getAllEntries() {
  const rows = getDb()
    .prepare(
      `SELECT e.*, ${joinedGreatWorkColumns}
       FROM entries AS e
       ${greatWorkJoins}
       ORDER BY e.featured DESC, e.category ASC, e.name COLLATE NOCASE ASC`,
    )
    .all() as EntryRow[];
  return rows.map(fromRow);
}

export function getEntryPreviews() {
  const rows = getDb()
    .prepare(
      `SELECT ${previewColumns}
       FROM entries AS e
       ${greatWorkJoins}
       ORDER BY e.featured DESC, e.category ASC, e.name COLLATE NOCASE ASC`,
    )
    .all() as EntryPreviewRow[];
  return rows.map(previewFromRow);
}

export function getEntryBySlug(slug: string) {
  const row = getDb()
    .prepare(
      `SELECT e.*, ${joinedGreatWorkColumns}
       FROM entries AS e
       ${greatWorkJoins}
       WHERE e.slug = ?`,
    )
    .get(slug) as EntryRow | undefined;
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
        (item.id === entry.greatWork?.creatorId || entry.id === item.greatWork?.creatorId ? 8 : 0) +
        (item.greatWork?.creatorId && item.greatWork.creatorId === entry.greatWork?.creatorId ? 6 : 0) +
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
  const ftsQuery = normalizedFtsQuery(query);
  if (!ftsQuery) return getAllEntries().slice(0, limit);
  const rows = getDb()
    .prepare(
      `SELECT e.*, ${joinedGreatWorkColumns}
       FROM entries_fts AS f
       JOIN entries AS e ON e.rowid = f.rowid
       ${greatWorkJoins}
       WHERE entries_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(ftsQuery, limit) as EntryRow[];
  return rows.map(fromRow);
}

export function searchEntryPreviews(query: string, limit = 10) {
  const ftsQuery = normalizedFtsQuery(query);
  if (!ftsQuery) return getEntryPreviews().slice(0, limit);
  const rows = getDb()
    .prepare(
      `SELECT ${previewColumns}
       FROM entries_fts AS f
       JOIN entries AS e ON e.rowid = f.rowid
       ${greatWorkJoins}
       WHERE entries_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(ftsQuery, limit) as EntryPreviewRow[];
  return rows.map(previewFromRow);
}
