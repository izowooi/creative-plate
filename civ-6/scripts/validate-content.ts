import { ZodError } from "zod";
import { getMarkdownPaths, loadMarkdownEntries } from "./content-utils";

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
} catch (error) {
  if (error instanceof ZodError) {
    fail(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
  }
  throw error;
}
