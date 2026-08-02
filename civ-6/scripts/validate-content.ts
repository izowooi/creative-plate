import { ZodError } from "zod";
import { getMarkdownPaths, loadMarkdownEntries } from "./content-utils";
import { cityRoleMeta, greatPersonRoleMeta, greatPersonRoleSchema } from "../src/lib/content";

function fail(message: string): never {
  console.error(`\nContent validation failed: ${message}`);
  process.exit(1);
}

try {
  const paths = getMarkdownPaths();
  if (paths.length === 0) fail("docs/ 아래에 Markdown 항목이 없습니다.");

  const entries = loadMarkdownEntries();
  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id)) fail(`중복 id: ${entry.id}`);
    if (slugs.has(entry.slug)) fail(`중복 slug: ${entry.slug}`);
    if (entry.body.length < 180) fail(`${entry.slug}: 본문이 너무 짧습니다.`);
    if (!entry.summary) fail(`${entry.slug}: 요약을 만들 수 없습니다.`);
    if (entry.image && !entry.imageAlt) fail(`${entry.slug}: imageAlt가 없습니다.`);
    if (entry.image && (!entry.imageCredit || !entry.imageLicense || !entry.imageSource)) {
      fail(`${entry.slug}: 이미지 credit/license/source가 모두 필요합니다.`);
    }
    const requiredSections = ["개요", "게임에서 다시 보기", "핵심 연표/사실", "출처"];
    const actualSections = [...entry.body.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
    if (
      actualSections.length !== requiredSections.length ||
      actualSections.some((section, index) => section !== requiredSections[index])
    ) {
      fail(
        `${entry.slug}: H2 섹션은 ${requiredSections.map((section) => `"## ${section}"`).join(" → ")} ` +
        "순서로 정확히 한 번씩 있어야 합니다.",
      );
    }
    const overview = entry.body.match(/^## 개요\s+([\s\S]*?)(?=^## )/m)?.[1] ?? "";
    if (overview.replace(/\s/g, "").length < 300) fail(`${entry.slug}: 개요가 300자보다 짧습니다.`);
    if (entry.sources.length < 3) fail(`${entry.slug}: frontmatter 출처가 3개보다 적습니다.`);
    const sourceUrls = entry.sources.map((source) => source.url);
    if (new Set(sourceUrls).size !== sourceUrls.length) fail(`${entry.slug}: 중복 출처 URL이 있습니다.`);
    const sourceHosts = sourceUrls.map((url) => new URL(url).hostname.replace(/^www\./, ""));
    if (!sourceHosts.some((host) => [
      "civilization.fandom.com",
      "civilization.2k.com",
      "civilopedia.net",
    ].includes(host))) {
      fail(`${entry.slug}: Civilization VI 등장·표현을 확인할 게임 출처가 없습니다.`);
    }
    if (!sourceHosts.some((host) => ![
      "civilization.fandom.com",
      "civilization.2k.com",
      "civilopedia.net",
      "commons.wikimedia.org",
      "upload.wikimedia.org",
    ].includes(host))) {
      fail(`${entry.slug}: 게임·이미지와 독립된 역사 출처가 없습니다.`);
    }
    ids.add(entry.id);
    slugs.add(entry.slug);
  }

  const brokenRelations = entries.flatMap((entry) =>
    entry.related
      .filter((slug) => !slugs.has(slug))
      .map((slug) => `${entry.slug} -> ${slug}`),
  );
  if (brokenRelations.length) fail(`깨진 related 관계: ${brokenRelations.join(", ")}`);

  const counts = Object.groupBy(entries, (entry) => entry.category);
  console.log(`Validated ${entries.length} Markdown entries.`);
  for (const [category, items] of Object.entries(counts)) {
    console.log(`- ${category}: ${items?.length ?? 0}`);
  }
  const greatPeople = entries.filter((entry) => entry.category === "great-people");
  const roleCounts = Object.groupBy(greatPeople, (entry) => {
    const role = greatPersonRoleSchema.safeParse(entry.subcategory);
    return role.success ? greatPersonRoleMeta[role.data].label : entry.subcategory;
  });
  console.log("Great Person role counts:");
  for (const [role, items] of Object.entries(roleCounts)) {
    console.log(`  - ${role}: ${items?.length ?? 0}`);
  }
  const cityRoleCounts = new Map<string, number>();
  for (const entry of entries.filter((item) => item.category === "cities")) {
    for (const role of entry.cityRoles) {
      const label = cityRoleMeta[role].label;
      cityRoleCounts.set(label, (cityRoleCounts.get(label) ?? 0) + 1);
    }
  }
  console.log("City role counts:");
  for (const [role, count] of cityRoleCounts) console.log(`  - ${role}: ${count}`);
} catch (error) {
  if (error instanceof ZodError) {
    fail(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
  }
  throw error;
}
