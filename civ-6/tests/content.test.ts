import assert from "node:assert/strict";
import test from "node:test";
import { loadMarkdownEntries } from "../scripts/content-utils";
import {
  categoryMeta,
  categoryValues,
  cityRoleMeta,
  cityRoleSchema,
  cityRoleValues,
  contentFrontmatterSchema,
  entryTypeLabel,
  greatPersonRoleMeta,
  greatPersonRoleSchema,
  greatPersonRoleValues,
  greatWorkAudioSchema,
  greatWorkCreationSchema,
  greatWorkTypeMeta,
  greatWorkTypeSchema,
  greatWorkTypeValues,
  makeSummary,
} from "../src/lib/content";
import { imageLicenseUrl, withoutTrailingSources } from "../src/lib/presentation";

const entries = loadMarkdownEntries();

test("the editorial dataset preserves its balanced baseline as it expands", () => {
  const counts = Object.fromEntries(
    Object.entries(Object.groupBy(entries, (entry) => entry.category)).map(([key, value]) => [
      key,
      value?.length ?? 0,
    ]),
  );

  assert.ok(entries.length >= 448);
  assert.ok(counts.civilizations >= 50);
  assert.ok(counts.cities >= 116);
  assert.ok(counts["great-people"] >= 215);
  assert.ok(counts.leaders >= 67);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.slug)).size, entries.length);
});

test("requested Civilization VI examples are present and sourced", () => {
  const required = [
    "seondeok",
    "peter-the-great",
    "tokugawa-ieyasu",
    "saint-petersburg",
    "busan",
    "korean-civilization",
    "russian-civilization",
    "galileo-galilei",
  ];
  const slugs = new Set(entries.map((entry) => entry.slug));
  for (const slug of required) assert.ok(slugs.has(slug), `${slug} is missing`);
  for (const entry of entries) {
    assert.ok(entry.sources.length >= 3, `${entry.slug} needs at least three sources`);
    assert.ok(entry.summary.length > 0 && entry.summary.length <= 168, `${entry.slug} summary length`);
    if (entry.image) {
      assert.match(entry.image, /^https:\/\/upload\.wikimedia\.org\//);
      assert.match(entry.imageSource ?? "", /^https?:\/\//);
    } else {
      assert.equal(entry.category, "great-works", `${entry.slug}: only great works may omit images`);
      assert.equal(entry.greatWork?.imageRole, "none", `${entry.slug}: no image requires imageRole none`);
    }
    if (entry.category === "great-people") {
      assert.equal(greatPersonRoleSchema.safeParse(entry.subcategory).success, true);
      assert.ok(entryTypeLabel(entry).length > 0);
    }
    if (entry.category === "cities") {
      assert.ok(entry.cityRoles.length > 0, `${entry.slug} needs a city role`);
      for (const role of entry.cityRoles) assert.equal(cityRoleSchema.safeParse(role).success, true);
      assert.ok(entryTypeLabel(entry).length > 0);
    }
    if (entry.category === "great-works") {
      assert.equal(greatWorkTypeSchema.safeParse(entry.subcategory).success, true);
      assert.ok(entry.greatWork, `${entry.slug} needs greatWork metadata`);
      assert.ok(entryTypeLabel(entry).length > 0);
    }
  }
});

test("category taxonomy exposes metadata for every supported collection", () => {
  for (const category of categoryValues) {
    assert.ok(categoryMeta[category].label.length > 0, category);
    assert.ok(categoryMeta[category].singular.length > 0, category);
    assert.ok(categoryMeta[category].description.length > 0, category);
  }
});

test("city taxonomy exposes a Korean label for every supported role", () => {
  for (const [role, metadata] of Object.entries(cityRoleMeta)) {
    assert.ok(metadata.label.length > 0, role);
    assert.ok(metadata.longLabel.length > 0, role);
    assert.ok(metadata.englishLabel.length > 0, role);
  }
  for (const role of cityRoleValues.filter((value) => value !== "editorial-extra")) {
    assert.ok(
      entries.some((entry) => entry.category === "cities" && entry.cityRoles.includes(role)),
      `${role} needs at least one editorial profile`,
    );
  }
});

test("great-person taxonomy exposes a Korean label for every supported role", () => {
  for (const [role, metadata] of Object.entries(greatPersonRoleMeta)) {
    assert.ok(metadata.label.length > 0, role);
    assert.ok(metadata.longLabel.length > 0, role);
    assert.ok(metadata.englishLabel.length > 0, role);
    assert.ok(["standard", "special"].includes(metadata.kind), role);
  }
  assert.deepEqual(
    Object.entries(greatPersonRoleMeta)
      .filter(([, metadata]) => metadata.kind === "special")
      .map(([role]) => role),
    ["comandantes"],
  );
  for (const role of greatPersonRoleValues) {
    assert.ok(
      entries.some((entry) => entry.category === "great-people" && entry.subcategory === role),
      `${role} needs at least one editorial profile`,
    );
  }
});

test("great-work taxonomy and conditional metadata support no-image works", () => {
  for (const type of greatWorkTypeValues) {
    const metadata = greatWorkTypeMeta[type];
    assert.ok(metadata.label.length > 0, type);
    assert.ok(metadata.longLabel.length > 0, type);
    assert.ok(metadata.englishLabel.length > 0, type);
  }

  const fixture = {
    id: "great-work-schema-fixture",
    name: "스키마 작품",
    nameEn: "Schema Work",
    category: "great-works",
    subcategory: "writing",
    era: "고전 시대",
    tags: ["스키마"],
    sources: [
      "https://civilopedia.net/example",
      "https://example.com/history",
      "https://example.org/rights",
    ],
    greatWork: {
      gameId: "GREATWORK_SCHEMA_FIXTURE",
      creatorId: "creator-entry-id",
      historicalTitle: "Schema Work",
      creation: { label: "기원전 5세기", yearStart: -500, yearEnd: -400 },
      attribution: "전통적 귀속",
      holding: { status: "distributed", note: "여러 판본으로 전승" },
      workRights: { status: "public-domain", note: "원저작물 기준" },
      imageRole: "none",
      audio: { status: "unavailable", note: "적용 가능한 음원이 없음" },
    },
  };
  const parsed = contentFrontmatterSchema.parse(fixture);

  assert.equal(parsed.image, undefined);
  assert.equal(parsed.greatWork?.creatorId, "creator-entry-id");
  assert.equal(parsed.greatWork?.creation.yearStart, -500);
  const frontmatterWithGameContext = contentFrontmatterSchema.safeParse({
    ...fixture,
    greatWork: {
      ...fixture.greatWork,
      gameContext: {
        gameEra: "Classical Era",
        pack: "Civilization VI base game",
        rulesetProfile: "writing_all_4c_4t",
        rulesets: {},
      },
    },
  });
  assert.equal(
    frontmatterWithGameContext.success,
    false,
    "DB-derived gameContext must not be accepted in Markdown frontmatter",
  );
  if (!frontmatterWithGameContext.success) {
    assert.ok(frontmatterWithGameContext.error.issues.some((issue) => (
      issue.code === "unrecognized_keys" &&
      issue.path.join(".") === "greatWork" &&
      issue.keys.includes("gameContext")
    )));
  }
});

test("great-work dates and available audio enforce canonical archive sources", () => {
  assert.equal(greatWorkCreationSchema.safeParse({ label: "기원전 1년", yearStart: -1 }).success, true);
  assert.equal(greatWorkCreationSchema.safeParse({ label: "서기 1년", yearEnd: 1 }).success, true);
  assert.equal(greatWorkCreationSchema.safeParse({ label: "0년", yearStart: 0 }).success, false);
  assert.equal(greatWorkCreationSchema.safeParse({ label: "0년", yearEnd: 0 }).success, false);
  assert.equal(
    greatWorkCreationSchema.safeParse({ label: "역순", yearStart: 10, yearEnd: 5 }).success,
    false,
  );

  const audio = {
    status: "available",
    sourceFile: "https://upload.wikimedia.org/wikipedia/commons/a/a9/example.ogg",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Example.ogg",
    title: "Example recording",
    credit: "Example performer",
    license: "Public domain",
    mimeType: "audio/ogg",
  };
  assert.equal(greatWorkAudioSchema.safeParse(audio).success, true);
  assert.equal(greatWorkAudioSchema.safeParse({
    ...audio,
    sourceFile: "https://example.com/example.ogg",
  }).success, false);
  assert.equal(greatWorkAudioSchema.safeParse({
    ...audio,
    sourceFile: "http://upload.wikimedia.org/wikipedia/commons/a/a9/example.ogg",
  }).success, false);
  assert.equal(greatWorkAudioSchema.safeParse({
    ...audio,
    sourcePage: "https://commons.wikimedia.org/wiki/Category:Audio_files",
  }).success, false);
  assert.equal(greatWorkAudioSchema.safeParse({
    ...audio,
    sourcePage: "https://example.com/wiki/File:Example.ogg",
  }).success, false);
});

test("presentation helpers remove duplicate source prose and map common licenses", () => {
  assert.equal(withoutTrailingSources("본문\n\n## 출처\n\n- 링크"), "본문");
  assert.equal(imageLicenseUrl("CC BY-SA 4.0"), "https://creativecommons.org/licenses/by-sa/4.0/");
  assert.equal(imageLicenseUrl("Public domain"), "https://creativecommons.org/publicdomain/mark/1.0/");
});

test("generated summaries prefer a complete sentence over a mid-sentence ellipsis", () => {
  const summary = makeSummary(
    `## 개요\n\n${"첫 문장은 역사적 맥락을 충분히 설명하고 여기에서 완결됩니다. ".repeat(3)}뒤 문장은 길게 이어집니다.`,
  );
  assert.ok(summary.length <= 168);
  assert.match(summary, /\.$/);
});
