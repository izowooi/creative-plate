import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { loadMarkdownEntries } from "../scripts/content-utils";

const entries = loadMarkdownEntries();
const db = new DatabaseSync(path.join(process.cwd(), "data", "the-turn.db"), { readOnly: true });

after(() => db.close());

test("SQLite contains every Markdown entry and matching FTS rows", () => {
  const entryCount = db.prepare("SELECT COUNT(*) AS count FROM entries").get() as { count: number };
  const ftsCount = db.prepare("SELECT COUNT(*) AS count FROM entries_fts").get() as { count: number };
  assert.equal(entryCount.count, entries.length);
  assert.equal(ftsCount.count, entries.length);
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
});

test("database image paths are local and source URLs remain attributed", () => {
  const rows = db.prepare("SELECT slug, image, image_source FROM entries").all() as {
    slug: string;
    image: string;
    image_source: string;
  }[];
  for (const row of rows) {
    assert.equal(row.image, `/images/archive/${row.slug}.webp`);
    assert.match(row.image_source, /^https?:\/\//);
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
