import { loadMarkdownEntries } from "./content-utils";
import type { Entry } from "../src/lib/content";

type MetadataValue = { value?: string };

type CommonsPage = {
  title: string;
  missing?: boolean;
  imageinfo?: Array<{
    url?: string;
    extmetadata?: Record<string, MetadataValue>;
  }>;
};

type CommonsResponse = {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: CommonsPage[];
  };
};

const apiUrl = "https://commons.wikimedia.org/w/api.php";
const checkMode = process.argv.includes("--check");
const strictCredit = process.argv.includes("--strict-credit");
const requestedSlugs = new Set(
  process.argv
    .filter((argument) => argument.startsWith("--slugs="))
    .flatMap((argument) => argument.slice("--slugs=".length).split(","))
    .map((slug) => slug.trim())
    .filter(Boolean),
);

function chunks<T>(values: T[], size: number) {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

function fileTitle(source: string) {
  const url = new URL(source);
  if (url.protocol !== "https:" || url.hostname !== "commons.wikimedia.org") return null;
  const marker = "/wiki/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex === -1) return null;
  const title = decodeURIComponent(url.pathname.slice(markerIndex + marker.length)).replaceAll("_", " ");
  return title.startsWith("File:") ? title : null;
}

function imageFileName(source: string) {
  const url = new URL(source);
  const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const thumbIndex = segments.indexOf("thumb");
  const fileSegment = thumbIndex === -1 ? segments.at(-1) : segments[thumbIndex + 3];
  return fileSegment?.replaceAll("_", " ") ?? "";
}

function plainText(value = "") {
  return value
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replace(/\s+/g, " ")
    .trim();
}

function licenseFamily(value: string) {
  const normalized = plainText(value).toLowerCase().replaceAll("–", "-");
  if (/\bcc\s*0\b|creative commons zero/.test(normalized)) return "cc0";
  if (/public domain|\bpd[- ]/.test(normalized)) return "public-domain";
  if (/free art license|licence art libre|\bfal\b/.test(normalized)) return "free-art-license";
  if (/open government licen[cs]e|\bogl\b/.test(normalized)) return "open-government-license";

  const compact = normalized.replace(/creative commons/g, "cc").replace(/[^a-z0-9.]/g, "");
  const ccMatch = compact.match(/cc(by(?:sa)?)(\d(?:\.\d)?)/);
  if (ccMatch) return `cc-${ccMatch[1] === "bysa" ? "by-sa" : "by"}-${ccMatch[2]}`;
  return compact;
}

function followAliases(title: string, aliases: Map<string, string>) {
  let current = title;
  const visited = new Set<string>();
  while (aliases.has(current) && !visited.has(current)) {
    visited.add(current);
    current = aliases.get(current) ?? current;
  }
  return current;
}

async function queryCommons(titles: string[]) {
  const body = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    titles: titles.join("|"),
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "TheTurnHistoryArchive/0.1 (https://github.com/izowooi/creative-plate)",
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) return response.json() as Promise<CommonsResponse>;
    if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
      throw new Error(`Commons API 응답 ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, [1_500, 4_000][attempt]));
  }
  throw new Error("Commons API 재시도 한도를 초과했습니다.");
}

async function main() {
  const allEntries = loadMarkdownEntries();
  const knownSlugs = new Set(allEntries.map((entry) => entry.slug));
  const unknownSlugs = [...requestedSlugs].filter((slug) => !knownSlugs.has(slug));
  if (unknownSlugs.length) throw new Error(`알 수 없는 slug: ${unknownSlugs.join(", ")}`);

  const selectedEntries = requestedSlugs.size
    ? allEntries.filter((entry) => requestedSlugs.has(entry.slug))
    : allEntries;
  const entries = selectedEntries.filter((entry): entry is Entry & Required<Pick<
    Entry,
    "image" | "imageAlt" | "imageCredit" | "imageLicense" | "imageSource"
  >> => Boolean(
    entry.image &&
    entry.imageAlt &&
    entry.imageCredit &&
    entry.imageLicense &&
    entry.imageSource
  ));
  const issues: string[] = [];
  const warnings: string[] = [];
  const rows = entries.map((entry) => ({ entry, title: fileTitle(entry.imageSource) }));
  for (const row of rows) {
    if (!row.title) issues.push(`${row.entry.slug}: imageSource가 HTTPS Commons File 페이지가 아닙니다.`);
  }

  const titleRows = rows.filter((row): row is typeof row & { title: string } => Boolean(row.title));
  const resultByTitle = new Map<string, CommonsPage>();
  for (const batch of chunks([...new Set(titleRows.map((row) => row.title))], 40)) {
    const result = await queryCommons(batch);
    const aliases = new Map<string, string>();
    for (const item of result.query?.normalized ?? []) aliases.set(item.from, item.to);
    for (const item of result.query?.redirects ?? []) aliases.set(item.from, item.to);
    const pages = new Map((result.query?.pages ?? []).map((page) => [page.title, page]));
    for (const title of batch) {
      const canonical = followAliases(title, aliases);
      const page = pages.get(canonical);
      if (page) resultByTitle.set(title, page);
    }
  }

  let verified = 0;
  let creditVerified = 0;
  for (const row of titleRows) {
    const page = resultByTitle.get(row.title);
    const imageInfo = page?.imageinfo?.[0];
    if (!page || page.missing || !imageInfo?.url) {
      issues.push(`${row.entry.slug}: Commons 파일 페이지 또는 원본 이미지가 없습니다.`);
      continue;
    }
    if (imageFileName(row.entry.image) !== imageFileName(imageInfo.url)) {
      issues.push(`${row.entry.slug}: image URL과 imageSource Commons 파일이 서로 다릅니다.`);
      continue;
    }

    const metadata = imageInfo.extmetadata ?? {};
    const metadataLicense = metadata.LicenseShortName?.value ?? metadata.UsageTerms?.value ?? "";
    if (!metadataLicense) {
      issues.push(`${row.entry.slug}: Commons license metadata가 없습니다.`);
      continue;
    }
    if (licenseFamily(row.entry.imageLicense) !== licenseFamily(metadataLicense)) {
      issues.push(
        `${row.entry.slug}: 선언 license "${row.entry.imageLicense}"와 Commons "${plainText(metadataLicense)}"가 다릅니다.`,
      );
      continue;
    }
    verified += 1;

    const artist = plainText(metadata.Artist?.value ?? metadata.Credit?.value ?? "");
    if (!artist) {
      warnings.push(`${row.entry.slug}: Commons author/credit metadata가 없어 파일 설명을 수동 확인해야 합니다.`);
      continue;
    }
    creditVerified += 1;
  }

  console.log("Wikimedia Commons metadata audit");
  console.log(`- audited images: ${entries.length}/${selectedEntries.length} selected entries`);
  console.log(`- page, image URL, and license metadata verified: ${verified}/${entries.length}`);
  console.log(`- author/credit metadata present: ${creditVerified}/${entries.length}`);
  if (issues.length) {
    console.log("- issues:");
    for (const issue of issues) console.log(`  - ${issue}`);
  } else {
    console.log("- issues: none");
  }
  if (warnings.length) {
    console.log("- warnings:");
    for (const warning of warnings) console.log(`  - ${warning}`);
  } else {
    console.log("- warnings: none");
  }

  if (checkMode && (issues.length || (strictCredit && warnings.length))) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
