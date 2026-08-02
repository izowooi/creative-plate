import assert from "node:assert/strict";
import test from "node:test";
import { loadMarkdownEntries } from "../scripts/content-utils";
import {
  cityRoleMeta,
  cityRoleSchema,
  cityRoleValues,
  entryTypeLabel,
  greatPersonRoleMeta,
  greatPersonRoleSchema,
  greatPersonRoleValues,
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

  assert.ok(entries.length >= 240);
  assert.ok(counts.civilizations >= 50);
  assert.ok(counts.cities >= 69);
  assert.ok(counts["great-people"] >= 54);
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
    assert.match(entry.image, /^https:\/\/upload\.wikimedia\.org\//);
    assert.match(entry.imageSource, /^https?:\/\//);
    if (entry.category === "great-people") {
      assert.equal(greatPersonRoleSchema.safeParse(entry.subcategory).success, true);
      assert.ok(entryTypeLabel(entry).length > 0);
    }
    if (entry.category === "cities") {
      assert.ok(entry.cityRoles.length > 0, `${entry.slug} needs a city role`);
      for (const role of entry.cityRoles) assert.equal(cityRoleSchema.safeParse(role).success, true);
      assert.ok(entryTypeLabel(entry).length > 0);
    }
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
