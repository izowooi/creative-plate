import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadMarkdownEntries } from "./content-utils";
import { cityRoleMeta, greatPersonRoleMeta, greatPersonRoleSchema } from "../src/lib/content";

const root = process.cwd();
const dbPath = path.join(root, "data", "the-turn.db");
const nextDbPath = path.join(root, "data", "the-turn.next.db");
const schemaPath = path.resolve(root, "src/db/schema.sql");
const entries = loadMarkdownEntries();

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
  INSERT INTO entries_fts (rowid, slug, name, name_en, summary, tags, civilization, region, subcategory, city_roles)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.exec("BEGIN");
try {
  for (const entry of entries) {
    const localImage = path.join(root, "public", "images", "archive", `${entry.slug}.webp`);
    if (!fs.existsSync(localImage)) {
      throw new Error(`${entry.slug}: 로컬 이미지가 없습니다. npm run images:sync를 먼저 실행하세요.`);
    }
    const displayImage = `/images/archive/${entry.slug}.webp`;
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
      entry.imageAlt,
      entry.imageCredit,
      entry.imageLicense,
      entry.imageSource,
      entry.accent,
      entry.featured ? 1 : 0,
      entry.quote,
      entry.summary,
      entry.body,
      JSON.stringify(entry.related),
      JSON.stringify(entry.sources),
      entry.readingMinutes,
    );
    insertFts.run(
      insertResult.lastInsertRowid,
      entry.slug,
      entry.name,
      entry.nameEn,
      entry.summary,
      entry.tags.join(" "),
      entry.civilization,
      entry.region,
      (() => {
        const role = greatPersonRoleSchema.safeParse(entry.subcategory);
        return role.success
          ? `${entry.subcategory} ${greatPersonRoleMeta[role.data].longLabel} ${greatPersonRoleMeta[role.data].englishLabel}`
          : entry.subcategory;
      })(),
      entry.cityRoles
        .flatMap((role) => [
          role,
          cityRoleMeta[role].label,
          cityRoleMeta[role].longLabel,
          cityRoleMeta[role].englishLabel,
        ])
        .join(" "),
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
