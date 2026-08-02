import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  auditGreatWorkDocuments,
  expectedGreatWorkCounts,
  greatWorkDocumentAuditErrors,
  loadGreatWorksCatalog,
  validateGreatWorkCreatorDocuments,
  validateGreatWorksCatalog,
  type GreatWorkCatalogRecord,
} from "../scripts/great-work-utils";

const catalog = loadGreatWorksCatalog();

function distribution(values: string[]) {
  return Object.fromEntries(
    Object.entries(Object.groupBy(values, (value) => value)).map(([key, group]) => [key, group?.length ?? 0]),
  );
}

function minimalDocument(
  record: GreatWorkCatalogRecord,
  creatorId: string,
  overrides: Partial<{
    id: string;
    nameEn: string;
    category: string;
    subcategory: string;
    gameId: string;
    creatorId: string;
  }> = {},
) {
  return `---
id: "${overrides.id ?? record.id}"
nameEn: ${JSON.stringify(overrides.nameEn ?? record.workTitle)}
category: ${overrides.category ?? "great-works"}
subcategory: ${overrides.subcategory ?? record.type}
greatWork:
  gameId: ${overrides.gameId ?? record.gameId}
  creatorId: ${overrides.creatorId ?? creatorId}
---
`;
}

test("the checked-in Civilization VI Great Works catalog satisfies schema v1", () => {
  const raw: unknown = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "docs", "catalog", "civ6-great-works.json"), "utf8"),
  );
  assert.deepEqual(validateGreatWorksCatalog(raw), []);
  assert.equal(catalog.records.length, 166);
  assert.equal(Object.keys(catalog.creatorMap).length, 71);
  assert.deepEqual(distribution(catalog.records.map((record) => record.type)), expectedGreatWorkCounts.byType);
  assert.deepEqual(distribution(catalog.records.map((record) => record.pack)), expectedGreatWorkCounts.byPack);
  assert.deepEqual(distribution(catalog.records.map((record) => record.gameEra)), expectedGreatWorkCounts.byGameEra);
});

test("all 71 creator mappings match the current Great Person ids and route slugs", () => {
  assert.deepEqual(validateGreatWorkCreatorDocuments(catalog), []);
  assert.deepEqual(catalog.creatorMap.katsushika_hokusai, {
    gameName: "Katsushika Hokusai",
    creatorClass: "Great Artist",
    entryId: "katsushika-hokusai",
    entrySlug: "hokusai",
    entryPath: "docs/great-people/artists/hokusai.md",
  });
  assert.deepEqual(catalog.creatorMap.ludwig_van_beethoven, {
    gameName: "Ludwig van Beethoven",
    creatorClass: "Great Musician",
    entryId: "ludwig-van-beethoven",
    entrySlug: "beethoven",
    entryPath: "docs/great-people/musicians/beethoven.md",
  });
  assert.equal(catalog.creatorMap.edgar_allen_poe.entryId, "edgar-allan-poe");
  assert.equal(catalog.creatorMap.andrey_rublev.entryId, "andrei-rublev");
  assert.equal(catalog.creatorMap.antonio_carlos_gomez.entryId, "antonio-carlos-gomes");
});

test("record ids, slugs, paths, and creator-local order are deterministic", () => {
  const ids = new Set<string>();
  const gameIds = new Set<string>();
  const slugs = new Set<string>();
  const paths = new Set<string>();
  const orders = new Map<string, number[]>();

  for (const record of catalog.records) {
    const creator = catalog.creatorMap[record.creatorKey];
    assert.ok(creator, record.creatorKey);
    assert.equal(record.id, `great-work:${record.gameId}`);
    assert.equal(record.slug, `great-work-${creator.entryId}-${record.order}`);
    assert.equal(record.path, `${record.type}/${record.slug}.md`);
    ids.add(record.id);
    gameIds.add(record.gameId);
    slugs.add(record.slug);
    paths.add(record.path);
    const creatorOrders = orders.get(record.creatorKey) ?? [];
    creatorOrders.push(record.order);
    orders.set(record.creatorKey, creatorOrders);
  }

  assert.equal(ids.size, 166);
  assert.equal(gameIds.size, 166);
  assert.equal(slugs.size, 166);
  assert.equal(paths.size, 166);
  for (const creatorOrders of orders.values()) {
    creatorOrders.sort((left, right) => left - right);
    assert.deepEqual(creatorOrders, Array.from({ length: creatorOrders.length }, (_, index) => index + 1));
  }
});

test("Sun Tzu is an explicit Great General to writing exception", () => {
  assert.deepEqual(catalog.creatorMap.sun_tzu, {
    gameName: "Sun Tzu",
    creatorClass: "Great General",
    entryId: "sun-tzu",
    entrySlug: "sun-tzu",
    entryPath: "docs/great-people/generals/sun-tzu.md",
  });
  const records = catalog.records.filter((record) => record.creatorKey === "sun_tzu");
  assert.equal(records.length, 1);
  assert.equal(records[0].type, "writing");
  assert.equal(records[0].workTitle, "The Art of War");
  assert.equal(records[0].rulesetProfile, "writing_all_4c_4t");
});

test("catalog validation rejects duplicate routes and non-contiguous creator order", () => {
  const duplicate = structuredClone(catalog);
  duplicate.records[1].slug = duplicate.records[0].slug;
  assert.ok(validateGreatWorksCatalog(duplicate).some((error) => error.includes("slug가") && error.includes("중복")));

  const gap = structuredClone(catalog);
  const bhasa = gap.records.filter((record) => record.creatorKey === "bhasa");
  assert.equal(bhasa.length, 2);
  bhasa[1].order = 3;
  bhasa[1].slug = "great-work-bhasa-3";
  bhasa[1].path = "writing/great-work-bhasa-3.md";
  assert.ok(validateGreatWorksCatalog(gap).some((error) => error.includes("bhasa의 order는 1부터 연속")));
});

test("report mode permits missing drafts while the final gate rejects them", () => {
  const syntheticAudit = {
    catalogTotal: 166,
    present: [],
    missing: [catalog.records[0]],
    issues: [],
    countsByType: {
      writing: { present: 0, total: 59 },
      portrait: { present: 0, total: 18 },
      landscape: { present: 0, total: 25 },
      religious: { present: 0, total: 12 },
      sculpture: { present: 0, total: 14 },
      music: { present: 0, total: 38 },
    },
  };
  assert.deepEqual(greatWorkDocumentAuditErrors(syntheticAudit), []);
  assert.ok(
    greatWorkDocumentAuditErrors(syntheticAudit, { requireComplete: true })
      .some((error) => error.includes("Markdown 1개가 없습니다")),
  );
});

test("document audit compares catalog path, gameId, creatorId, nameEn, and subtype", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "civ6-great-work-test-"));
  try {
    const record = catalog.records[0];
    const creator = catalog.creatorMap[record.creatorKey];
    const documentPath = path.join(temporaryRoot, "docs", "great-works", record.path);
    fs.mkdirSync(path.dirname(documentPath), { recursive: true });
    fs.writeFileSync(documentPath, minimalDocument(record, creator.entryId));

    const validAudit = auditGreatWorkDocuments(catalog, temporaryRoot);
    assert.equal(validAudit.present.length, 1);
    assert.equal(validAudit.missing.length, 165);
    assert.deepEqual(validAudit.issues, []);

    const mismatches = [
      { label: "id는", overrides: { id: "great-work:WRONG" } },
      { label: "nameEn은", overrides: { nameEn: "Wrong title" } },
      { label: "category는", overrides: { category: "great-people" } },
      { label: "subcategory는", overrides: { subcategory: "music" } },
      { label: "greatWork.gameId", overrides: { gameId: "GREATWORK_WRONG" } },
      { label: "greatWork.creatorId", overrides: { creatorId: "wrong-route-slug" } },
    ];
    for (const mismatch of mismatches) {
      fs.writeFileSync(documentPath, minimalDocument(record, creator.entryId, mismatch.overrides));
      const invalidAudit = auditGreatWorkDocuments(catalog, temporaryRoot);
      assert.ok(invalidAudit.issues.some((error) => error.includes(mismatch.label)), mismatch.label);
    }

    fs.writeFileSync(documentPath, minimalDocument(record, creator.entryId));
    const extraPath = path.join(path.dirname(documentPath), "catalog-missing-route.md");
    fs.writeFileSync(extraPath, minimalDocument(record, creator.entryId));
    assert.ok(
      auditGreatWorkDocuments(catalog, temporaryRoot).issues
        .some((error) => error.includes("catalog에 없는 Markdown")),
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
