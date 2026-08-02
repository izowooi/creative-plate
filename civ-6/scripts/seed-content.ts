import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadMarkdownEntries } from "./content-utils";
import { loadGreatWorksCatalog } from "./great-work-utils";
import {
  cityRoleMeta,
  greatPersonRoleMeta,
  greatPersonRoleSchema,
  greatWorkTypeMeta,
  greatWorkTypeSchema,
} from "../src/lib/content";
import { archiveAudioPath } from "../src/lib/archive-media";

const root = process.cwd();
const dbPath = path.join(root, "data", "the-turn.db");
const nextDbPath = path.join(root, "data", "the-turn.next.db");
const schemaPath = path.resolve(root, "src/db/schema.sql");
const entries = loadMarkdownEntries();
const greatWorksCatalog = loadGreatWorksCatalog(root);
const catalogRecordsByGameId = new Map(
  greatWorksCatalog.records.map((record) => [record.gameId, record]),
);

if (entries.length === 0) {
  console.error("No Markdown entries found in docs/. Run content validation first.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
for (const suffix of ["", "-shm", "-wal"]) {
  const target = `${nextDbPath}${suffix}`;
  if (fs.existsSync(target)) fs.rmSync(target);
}

const db = new DatabaseSync(nextDbPath);
db.exec(fs.readFileSync(schemaPath, "utf8"));

const insert = db.prepare(`
  INSERT INTO entries (
    id, slug, name, name_en, category, subcategory, city_roles_json, era, lifespan,
    civilization, region, tags_json, image, image_alt, image_credit,
    image_license, image_source, accent, featured, quote, summary, body,
    related_json, sources_json, reading_minutes
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);
const insertFts = db.prepare(`
  INSERT INTO entries_fts (
    rowid, slug, name, name_en, summary, tags, civilization, region,
    subcategory, city_roles, creator, great_work
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertGreatWork = db.prepare(`
  INSERT INTO great_works (
    entry_id, game_id, creator_id, game_era, pack, ruleset_profile,
    rulesets_json, historical_title, creation_json, attribution,
    holding_json, work_rights_json, image_role, audio_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
const rowidsById = new Map<string, number | bigint>();

function subcategorySearchText(entry: (typeof entries)[number]) {
  const greatPersonRole = greatPersonRoleSchema.safeParse(entry.subcategory);
  if (greatPersonRole.success) {
    const metadata = greatPersonRoleMeta[greatPersonRole.data];
    return `${entry.subcategory} ${metadata.longLabel} ${metadata.englishLabel}`;
  }

  const greatWorkType = greatWorkTypeSchema.safeParse(entry.subcategory);
  if (greatWorkType.success) {
    const metadata = greatWorkTypeMeta[greatWorkType.data];
    return `${entry.subcategory} ${metadata.label} ${metadata.longLabel} ${metadata.englishLabel}`;
  }

  return entry.subcategory;
}

function creatorSearchText(entry: (typeof entries)[number]) {
  if (!entry.greatWork) return "";
  const creator = entriesById.get(entry.greatWork.creatorId);
  if (!creator) return entry.greatWork.creatorId;
  return [creator.id, creator.slug, creator.name, creator.nameEn].join(" ");
}

function catalogContext(entry: (typeof entries)[number]) {
  const work = entry.greatWork;
  if (!work) return null;
  const record = catalogRecordsByGameId.get(work.gameId);
  if (!record) {
    throw new Error(`${entry.slug}: catalog에 gameId가 없습니다: ${work.gameId}`);
  }
  if (record.id !== entry.id || record.slug !== entry.slug) {
    throw new Error(
      `${entry.slug}: catalog route/id가 Markdown과 다릅니다: ${record.slug}, ${record.id}`,
    );
  }
  const creator = greatWorksCatalog.creatorMap[record.creatorKey];
  if (!creator || creator.entryId !== work.creatorId) {
    throw new Error(`${entry.slug}: catalog creator mapping이 creatorId와 다릅니다.`);
  }
  return {
    record,
    rulesets: greatWorksCatalog.rulesetProfiles[record.rulesetProfile],
  };
}

function greatWorkSearchText(entry: (typeof entries)[number]) {
  const work = entry.greatWork;
  if (!work) return "";
  const context = catalogContext(entry);
  if (!context) return "";
  const audio = work.audio.status === "available"
    ? `${work.audio.title} ${work.audio.credit}`
    : "";
  const rulesetText = Object.entries(context.rulesets).flatMap(([ruleset, value]) => (
    typeof value === "string"
      ? [value]
      : [ruleset, `${value.culture} culture`, `${value.tourism} tourism`]
  ));
  return [
    work.gameId,
    work.historicalTitle,
    work.attribution,
    work.creation.label,
    work.creation.place,
    work.creation.medium,
    work.creation.note,
    work.holding.name,
    work.holding.location,
    work.holding.note,
    audio,
    context.record.gameEra,
    context.record.pack,
    context.record.rulesetProfile,
    ...rulesetText,
  ].filter(Boolean).join(" ");
}

db.exec("BEGIN");
try {
  for (const entry of entries) {
    if (entry.image) {
      const localImage = path.join(root, "public", "images", "archive", `${entry.slug}.webp`);
      if (!fs.existsSync(localImage)) {
        throw new Error(`${entry.slug}: 로컬 이미지가 없습니다. npm run images:sync를 먼저 실행하세요.`);
      }
    }
    if (entry.greatWork?.audio.status === "available") {
      const audioArchivePath = archiveAudioPath(entry);
      if (!audioArchivePath) {
        throw new Error(`${entry.slug}: 지원하지 않는 audio MIME type입니다: ${entry.greatWork.audio.mimeType}`);
      }
      const localAudio = path.join(root, "public", audioArchivePath.replace(/^\//, ""));
      if (!fs.existsSync(localAudio)) {
        throw new Error(`${entry.slug}: 로컬 audio가 없습니다. npm run audio:sync를 먼저 실행하세요.`);
      }
    }
    const displayImage = entry.image ? `/images/archive/${entry.slug}.webp` : "";
    const insertResult = insert.run(
      entry.id,
      entry.slug,
      entry.name,
      entry.nameEn,
      entry.category,
      entry.subcategory,
      JSON.stringify(entry.cityRoles),
      entry.era,
      entry.lifespan,
      entry.civilization,
      entry.region,
      JSON.stringify(entry.tags),
      displayImage,
      entry.imageAlt ?? "",
      entry.imageCredit ?? "",
      entry.imageLicense ?? "",
      entry.imageSource ?? "",
      entry.accent,
      entry.featured ? 1 : 0,
      entry.quote,
      entry.summary,
      entry.body,
      JSON.stringify(entry.related),
      JSON.stringify(entry.sources),
      entry.readingMinutes,
    );
    rowidsById.set(entry.id, insertResult.lastInsertRowid);
  }

  for (const entry of entries) {
    const work = entry.greatWork;
    if (!work) continue;
    const context = catalogContext(entry);
    if (!context) throw new Error(`${entry.slug}: catalog context가 없습니다.`);
    const creator = entriesById.get(work.creatorId);
    if (!creator) {
      throw new Error(`${entry.slug}: creatorId가 존재하지 않습니다: ${work.creatorId}`);
    }
    if (creator.category !== "great-people") {
      throw new Error(`${entry.slug}: creatorId는 위인 문서를 가리켜야 합니다: ${work.creatorId}`);
    }
    insertGreatWork.run(
      entry.id,
      work.gameId,
      work.creatorId,
      context.record.gameEra,
      context.record.pack,
      context.record.rulesetProfile,
      JSON.stringify(context.rulesets),
      work.historicalTitle,
      JSON.stringify(work.creation),
      work.attribution,
      JSON.stringify(work.holding),
      JSON.stringify(work.workRights),
      work.imageRole,
      JSON.stringify(work.audio),
    );
  }

  for (const entry of entries) {
    const rowid = rowidsById.get(entry.id);
    if (rowid === undefined) throw new Error(`${entry.slug}: entries rowid가 없습니다.`);
    insertFts.run(
      rowid,
      entry.slug,
      entry.name,
      entry.nameEn,
      entry.summary,
      entry.tags.join(" "),
      entry.civilization,
      entry.region,
      subcategorySearchText(entry),
      entry.cityRoles
        .flatMap((role) => [
          role,
          cityRoleMeta[role].label,
          cityRoleMeta[role].longLabel,
          cityRoleMeta[role].englishLabel,
        ])
        .join(" "),
      creatorSearchText(entry),
      greatWorkSearchText(entry),
    );
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}

fs.renameSync(nextDbPath, dbPath);
for (const suffix of ["-shm", "-wal"]) {
  const stale = `${dbPath}${suffix}`;
  if (fs.existsSync(stale)) fs.rmSync(stale);
}

console.log(`Seeded ${entries.length} entries into ${path.relative(root, dbPath)}.`);
