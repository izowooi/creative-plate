import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { loadMarkdownEntries } from "../scripts/content-utils";
import { loadGreatWorksCatalog } from "../scripts/great-work-utils";
import { archiveAudioPath } from "../src/lib/archive-media";

const entries = loadMarkdownEntries();
const greatWorksCatalog = loadGreatWorksCatalog();
const catalogRecordsByGameId = new Map(
  greatWorksCatalog.records.map((record) => [record.gameId, record]),
);
const db = new DatabaseSync(path.join(process.cwd(), "data", "the-turn.db"), { readOnly: true });

after(() => db.close());

test("SQLite contains every Markdown entry and matching FTS rows", () => {
  const entryCount = db.prepare("SELECT COUNT(*) AS count FROM entries").get() as { count: number };
  const ftsCount = db.prepare("SELECT COUNT(*) AS count FROM entries_fts").get() as { count: number };
  assert.equal(entryCount.count, entries.length);
  assert.equal(ftsCount.count, entries.length);
  const missingFtsRowids = db.prepare(
    `SELECT COUNT(*) AS count
     FROM entries AS e
     LEFT JOIN entries_fts AS f ON f.rowid = e.rowid
     WHERE f.rowid IS NULL`,
  ).get() as { count: number };
  assert.equal(missingFtsRowids.count, 0);
});

test("great works have one-to-one metadata rows and valid creator joins", () => {
  const greatWorks = entries.filter((entry) => entry.category === "great-works");
  const metadataCount = db.prepare("SELECT COUNT(*) AS count FROM great_works").get() as {
    count: number;
  };
  assert.equal(metadataCount.count, greatWorks.length);

  const invalidRows = db.prepare(
    `SELECT COUNT(*) AS count
     FROM great_works AS gw
     JOIN entries AS work ON work.id = gw.entry_id
     LEFT JOIN entries AS creator ON creator.id = gw.creator_id
     WHERE work.category <> 'great-works'
        OR creator.id IS NULL
        OR creator.category <> 'great-people'`,
  ).get() as { count: number };
  assert.equal(invalidRows.count, 0);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

  for (const entry of greatWorks) {
    assert.ok(entry.greatWork, `${entry.slug}: missing parsed greatWork metadata`);
    const catalogRecord = catalogRecordsByGameId.get(entry.greatWork.gameId);
    assert.ok(catalogRecord, `${entry.slug}: missing catalog record`);
    const expectedRulesets = greatWorksCatalog.rulesetProfiles[catalogRecord.rulesetProfile];
    const row = db.prepare(
      `SELECT gw.game_id, gw.creator_id, gw.game_era, gw.pack,
              gw.ruleset_profile, gw.rulesets_json,
              gw.historical_title, gw.creation_json, gw.attribution,
              gw.holding_json, gw.work_rights_json,
              gw.image_role, gw.audio_json, creator.slug AS creator_slug
       FROM great_works AS gw
       JOIN entries AS creator ON creator.id = gw.creator_id
       WHERE gw.entry_id = ?`,
    ).get(entry.id) as {
      game_id: string;
      creator_id: string;
      game_era: string;
      pack: string;
      ruleset_profile: string;
      rulesets_json: string;
      historical_title: string;
      creation_json: string;
      attribution: string;
      holding_json: string;
      work_rights_json: string;
      image_role: string;
      audio_json: string;
      creator_slug: string;
    };
    assert.equal(row.game_id, entry.greatWork.gameId);
    assert.equal(row.creator_id, entry.greatWork.creatorId);
    assert.equal(row.game_era, catalogRecord.gameEra);
    assert.equal(row.pack, catalogRecord.pack);
    assert.equal(row.ruleset_profile, catalogRecord.rulesetProfile);
    assert.deepEqual(JSON.parse(row.rulesets_json), expectedRulesets);
    assert.equal(row.historical_title, entry.greatWork.historicalTitle);
    assert.deepEqual(JSON.parse(row.creation_json), entry.greatWork.creation);
    assert.equal(row.attribution, entry.greatWork.attribution);
    assert.deepEqual(JSON.parse(row.holding_json), entry.greatWork.holding);
    assert.deepEqual(JSON.parse(row.work_rights_json), entry.greatWork.workRights);
    assert.equal(row.image_role, entry.greatWork.imageRole);
    assert.deepEqual(JSON.parse(row.audio_json), entry.greatWork.audio);
    assert.ok(row.creator_slug.length > 0);
  }
});

test("FTS prefix search resolves both Korean and English names", () => {
  const find = (query: string) =>
    db.prepare(
      `SELECT e.slug
       FROM entries_fts AS f
       JOIN entries AS e ON e.rowid = f.rowid
       WHERE entries_fts MATCH ?`,
    ).all(query) as { slug: string }[];

  assert.ok(find('"선덕"*').some((row) => row.slug === "seondeok"));
  assert.ok(find('"Seondeok"*').some((row) => row.slug === "seondeok"));
  assert.ok(find('"과학자"*').some((row) => row.slug === "galileo-galilei"));
  assert.ok(find('"Great"* AND "Scientist"*').some((row) => row.slug === "galileo-galilei"));
  assert.ok(find('"Comandante"* AND "General"*').some((row) => row.slug === "antonio-jose-de-sucre"));
  assert.ok(find('"수도"*').some((row) => row.slug === "athens"));
  assert.ok(find('"Capital"*').some((row) => row.slug === "athens"));
  assert.ok(
    find('"Atomic"* AND "Era"*').some((row) => row.slug === "great-work-claude-monet-1"),
  );
  assert.ok(
    find('"Babylon"*').some((row) => row.slug === "great-work-sun-tzu-1"),
    "ruleset yield notes should be indexed",
  );

  const firstGreatWork = entries.find((entry) => entry.greatWork);
  if (firstGreatWork?.greatWork) {
    const creator = entries.find((entry) => entry.id === firstGreatWork.greatWork?.creatorId);
    assert.ok(creator, `${firstGreatWork.slug}: creator missing`);
    const creatorQuery = (creator.nameEn.match(/[\p{L}\p{N}]+/gu) ?? [])
      .map((token) => `"${token}"*`)
      .join(" AND ");
    const historicalTitleQuery = (
      firstGreatWork.greatWork.historicalTitle.match(/[\p{L}\p{N}]+/gu) ?? []
    )
      .map((token) => `"${token}"*`)
      .join(" AND ");
    assert.ok(find(creatorQuery).some((row) => row.slug === firstGreatWork.slug));
    assert.ok(find(historicalTitleQuery).some((row) => row.slug === firstGreatWork.slug));
    assert.ok(find(`"${firstGreatWork.greatWork.gameId}"*`).some((row) => row.slug === firstGreatWork.slug));
  }
});

test("database image paths are local and source URLs remain attributed", () => {
  const rows = db.prepare("SELECT slug, image, image_source FROM entries").all() as {
    slug: string;
    image: string;
    image_source: string;
  }[];
  const entriesBySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  for (const row of rows) {
    const entry = entriesBySlug.get(row.slug);
    assert.ok(entry, row.slug);
    if (entry.image) {
      assert.equal(row.image, `/images/archive/${row.slug}.webp`);
      assert.match(row.image_source, /^https?:\/\//);
    } else {
      assert.equal(row.image, "");
      assert.equal(row.image_source, "");
      assert.equal(entry.category, "great-works");
      assert.equal(entry.greatWork?.imageRole, "none");
    }
  }
});

test("available Great Work audio resolves to a local archive asset", () => {
  const audioEntries = entries.filter((entry) => entry.greatWork?.audio.status === "available");
  assert.ok(audioEntries.length > 0);
  for (const entry of audioEntries) {
    const route = archiveAudioPath(entry);
    assert.ok(route, `${entry.slug}: unsupported audio MIME type`);
    assert.ok(
      fs.existsSync(path.join(process.cwd(), "public", route.replace(/^\//, ""))),
      `${entry.slug}: local audio is missing`,
    );
  }
});

test("the generated database is readable from an immutable deployment directory", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "the-turn-readonly-"));
  const copiedDatabase = path.join(temporaryDirectory, "the-turn.db");
  try {
    fs.copyFileSync(path.join(process.cwd(), "data", "the-turn.db"), copiedDatabase);
    fs.chmodSync(copiedDatabase, 0o444);
    fs.chmodSync(temporaryDirectory, 0o555);

    const immutableDb = new DatabaseSync(copiedDatabase, { readOnly: true });
    try {
      const journal = immutableDb.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
      const count = immutableDb.prepare("SELECT COUNT(*) AS count FROM entries").get() as { count: number };
      assert.equal(journal.journal_mode, "delete");
      assert.equal(count.count, entries.length);
    } finally {
      immutableDb.close();
    }
    assert.equal(fs.existsSync(`${copiedDatabase}-wal`), false);
    assert.equal(fs.existsSync(`${copiedDatabase}-shm`), false);
  } finally {
    fs.chmodSync(temporaryDirectory, 0o755);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
