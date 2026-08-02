import { loadMarkdownEntries } from "./content-utils";
import { categoryMeta, categoryValues, type Category } from "../src/lib/content";

const gameHosts = new Set([
  "civilization.fandom.com",
  "civilization.2k.com",
  "civilopedia.net",
]);
const imageHosts = new Set([
  "commons.wikimedia.org",
  "upload.wikimedia.org",
]);

function hostname(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
}

const entries = loadMarkdownEntries();
const rows = entries.map((entry) => {
  const distinctSources = [...new Map(entry.sources.map((source) => [source.url, source])).values()];
  const historicalSources = distinctSources.filter((source) => {
    const host = hostname(source.url);
    return !gameHosts.has(host) && !imageHosts.has(host);
  });
  return {
    entry,
    distinctSources,
    historicalSources,
    meetsRecommendation: distinctSources.length >= 4 && historicalSources.length >= 2,
  };
});

const meeting = rows.filter((row) => row.meetsRecommendation);
console.log("Editorial source depth report");
console.log(`- recommended depth: ${meeting.length}/${rows.length} entries`);
console.log("- target: 4+ distinct sources, including 2+ sources independent of game/image records");

for (const category of categoryValues) {
  const categoryRows = rows.filter((row) => row.entry.category === category);
  const categoryMeeting = categoryRows.filter((row) => row.meetsRecommendation);
  console.log(
    `- ${categoryMeta[category].label}: ${categoryMeeting.length}/${categoryRows.length}`,
  );
}

const needsWork = rows.filter((row) => !row.meetsRecommendation);

if (process.argv.includes("--needs-work") && needsWork.length === 0) {
  console.log("\nNo entries are below the recommended source depth.");
}

if (process.argv.includes("--needs-work") && needsWork.length > 0) {
  console.log("\nEntries below the recommended source depth");
  const byCategory = Object.groupBy(
    needsWork,
    (row) => row.entry.category,
  ) as Partial<Record<Category, typeof rows>>;
  for (const category of categoryValues) {
    const categoryRows = byCategory[category] ?? [];
    if (!categoryRows.length) continue;
    console.log(`- ${categoryMeta[category].label}`);
    for (const row of categoryRows) {
      console.log(
        `  - ${row.entry.slug}: ${row.distinctSources.length} distinct total / ` +
        `${row.historicalSources.length} independent history`,
      );
    }
  }
}

if (process.argv.includes("--check") && needsWork.length > 0) {
  process.exitCode = 1;
}
