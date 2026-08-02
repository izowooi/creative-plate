import { loadMarkdownEntries } from "./content-utils";
import { categorySchema, type Entry } from "../src/lib/content";

const gameHosts = new Set([
  "civilization.fandom.com",
  "civilization.2k.com",
  "civilopedia.net",
]);
const imageHosts = new Set([
  "commons.wikimedia.org",
  "upload.wikimedia.org",
]);

function option(name: string) {
  return process.argv
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

function integerOption(name: string, fallback: number) {
  const raw = option(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`--${name}에는 0 이상의 정수가 필요합니다: ${raw}`);
  }
  return value;
}

function section(body: string, heading: string) {
  const marker = `## ${heading}`;
  const markerIndex = body.indexOf(marker);
  if (markerIndex === -1) return "";
  const contentStart = body.indexOf("\n", markerIndex + marker.length);
  if (contentStart === -1) return "";
  const nextHeading = body.indexOf("\n## ", contentStart + 1);
  return body.slice(contentStart + 1, nextHeading === -1 ? body.length : nextHeading).trim();
}

function compactLength(value: string) {
  return value.replace(/\s/g, "").length;
}

function hostname(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
}

function duplicatesBy(
  entries: Entry[],
  selectedSlugs: Set<string>,
  field: "image" | "imageSource",
) {
  const groups = Map.groupBy(entries, (entry) => entry[field]);
  return [...groups.entries()]
    .filter(([value, group]) => (
      Boolean(value) && group.length > 1 && group.some((entry) => selectedSlugs.has(entry.slug))
    ))
    .map(([value, group]) => ({ value, slugs: group.map((entry) => entry.slug).sort() }));
}

function main() {
  const allEntries = loadMarkdownEntries();
  const requestedSlugs = new Set(
    (option("slugs") ?? "")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean),
  );
  const requestedCategory = option("category");
  const parsedCategory = requestedCategory === undefined
    ? null
    : categorySchema.safeParse(requestedCategory);
  if (parsedCategory && !parsedCategory.success) {
    throw new Error(`알 수 없는 category: ${requestedCategory}`);
  }

  const knownSlugs = new Set(allEntries.map((entry) => entry.slug));
  const unknownSlugs = [...requestedSlugs].filter((slug) => !knownSlugs.has(slug));
  if (unknownSlugs.length) throw new Error(`알 수 없는 slug: ${unknownSlugs.join(", ")}`);

  const entries = allEntries.filter((entry) => (
    (!requestedSlugs.size || requestedSlugs.has(entry.slug)) &&
    (!parsedCategory?.success || entry.category === parsedCategory.data)
  ));
  if (!entries.length) throw new Error("감사할 Markdown 항목이 없습니다.");

  const thresholds = {
    overview: integerOption("min-overview", 300),
    game: integerOption("min-game", 100),
    timeline: integerOption("min-timeline", 4),
    sources: integerOption("min-sources", 4),
    historySources: integerOption("min-history-sources", 2),
  };
  const issues: string[] = [];
  const metrics = entries.map((entry) => {
    const overviewLength = compactLength(section(entry.body, "개요"));
    const gameLength = compactLength(section(entry.body, "게임에서 다시 보기"));
    const timeline = section(entry.body, "핵심 연표/사실");
    const timelineItems = (timeline.match(/^\s*[-*+]\s+/gm) ?? []).length;
    const distinctSources = [...new Set(entry.sources.map((source) => source.url))];
    const historySources = distinctSources.filter((url) => {
      const host = hostname(url);
      return !gameHosts.has(host) && !imageHosts.has(host);
    });

    if (overviewLength < thresholds.overview) {
      issues.push(`${entry.slug}: 개요 ${overviewLength}/${thresholds.overview}자`);
    }
    if (gameLength < thresholds.game) {
      issues.push(`${entry.slug}: 게임 설명 ${gameLength}/${thresholds.game}자`);
    }
    if (timelineItems < thresholds.timeline) {
      issues.push(`${entry.slug}: 연표 ${timelineItems}/${thresholds.timeline}개`);
    }
    if (distinctSources.length < thresholds.sources) {
      issues.push(`${entry.slug}: 고유 출처 ${distinctSources.length}/${thresholds.sources}개`);
    }
    if (historySources.length < thresholds.historySources) {
      issues.push(`${entry.slug}: 독립 역사 출처 ${historySources.length}/${thresholds.historySources}개`);
    }
    return { entry, overviewLength, gameLength, timelineItems, distinctSources, historySources };
  });

  const selectedSlugs = new Set(entries.map((entry) => entry.slug));
  for (const field of ["image", "imageSource"] as const) {
    for (const duplicate of duplicatesBy(allEntries, selectedSlugs, field)) {
      issues.push(`${field} 중복: ${duplicate.slugs.join(", ")} (${duplicate.value})`);
    }
  }

  const minimum = (values: number[]) => Math.min(...values);
  console.log("Editorial depth audit");
  console.log(`- audited: ${entries.length}`);
  console.log(`- minimum overview characters: ${minimum(metrics.map((row) => row.overviewLength))}`);
  console.log(`- minimum game-section characters: ${minimum(metrics.map((row) => row.gameLength))}`);
  console.log(`- minimum timeline items: ${minimum(metrics.map((row) => row.timelineItems))}`);
  console.log(`- minimum distinct sources: ${minimum(metrics.map((row) => row.distinctSources.length))}`);
  console.log(`- minimum independent history sources: ${minimum(metrics.map((row) => row.historySources.length))}`);
  if (issues.length) {
    console.log("- issues:");
    for (const issue of issues) console.log(`  - ${issue}`);
  } else {
    console.log("- issues: none");
  }

  if (process.argv.includes("--check") && issues.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
