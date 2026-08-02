import assert from "node:assert/strict";
import test from "node:test";
import { loadMarkdownEntries } from "../scripts/content-utils";
import { makeSummary } from "../src/lib/content";
import { imageLicenseUrl, withoutTrailingSources } from "../src/lib/presentation";

const entries = loadMarkdownEntries();

test("the editorial dataset has the expected balanced archive", () => {
  assert.equal(entries.length, 37);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(Object.groupBy(entries, (entry) => entry.category)).map(([key, value]) => [
        key,
        value?.length ?? 0,
      ]),
    ),
    { civilizations: 8, cities: 10, "great-people": 9, leaders: 10 },
  );
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
