import type { Entry } from "@/lib/content";

export const accentColors: Record<string, string> = {
  cobalt: "#2f6ff2",
  jade: "#16866f",
  vermilion: "#c9583d",
  violet: "#7656d8",
  amber: "#b97820",
  slate: "#667085",
};

export function entryAccent(entry: Pick<Entry, "accent">) {
  return accentColors[entry.accent] ?? accentColors.cobalt;
}

export function extractHeadings(markdown: string) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => ({
    title: match[1].replace(/[*_`]/g, "").trim(),
    id: headingId(match[1]),
  }));
}

export function headingId(value: string) {
  return value
    .toLowerCase()
    .replace(/[*_`]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function relationReason(current: Entry, related: Entry) {
  if (current.civilization && current.civilization === related.civilization) {
    return "같은 문명의 이야기";
  }
  if (current.era === related.era) return "같은 시대의 이야기";
  const sharedTag = related.tags.find((tag) => current.tags.includes(tag));
  return sharedTag ? `${sharedTag} 키워드로 연결` : "함께 읽으면 좋은 이야기";
}

export function withoutTrailingSources(markdown: string) {
  return markdown.replace(/\n##\s+출처\s*[\s\S]*$/m, "").trim();
}

export function imageLicenseUrl(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("cc0")) return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (normalized.includes("public domain")) return "https://creativecommons.org/publicdomain/mark/1.0/";
  const version = normalized.match(/(4\.0|3\.0|2\.5|2\.0)/)?.[1] ?? "4.0";
  if (normalized.includes("by-sa")) return `https://creativecommons.org/licenses/by-sa/${version}/`;
  if (normalized.includes("cc by")) return `https://creativecommons.org/licenses/by/${version}/`;
  return "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia";
}
