import { z } from "zod";

export const categoryValues = [
  "leaders",
  "civilizations",
  "cities",
  "great-people",
] as const;

export const categorySchema = z.enum(categoryValues);
export type Category = z.infer<typeof categorySchema>;

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "HTTP(S) URL만 허용됩니다.");

const commonsImageSchema = httpUrlSchema.refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "upload.wikimedia.org";
}, "이미지는 HTTPS Wikimedia upload URL이어야 합니다.");

export const sourceSchema = z.union([
  httpUrlSchema,
  z.object({
    title: z.string().min(1),
    url: httpUrlSchema,
  }).strict(),
]);

export const contentFrontmatterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameEn: z.string().min(1),
  category: categorySchema,
  subcategory: z.string().optional().default(""),
  era: z.string().min(1),
  lifespan: z.string().optional().default(""),
  civilization: z.string().optional().default(""),
  region: z.string().optional().default(""),
  tags: z.array(z.string().min(1)).min(1),
  image: commonsImageSchema,
  imageAlt: z.string().min(1),
  imageCredit: z.string().min(1),
  imageLicense: z.string().min(1),
  imageSource: httpUrlSchema,
  accent: z.string().optional().default("cobalt"),
  featured: z.boolean().optional().default(false),
  quote: z.string().optional().default(""),
  summary: z.string().optional().default(""),
  related: z.array(z.string()).optional().default([]),
  sources: z.array(sourceSchema).min(1),
}).strict();

export type ContentFrontmatter = z.infer<typeof contentFrontmatterSchema>;

export type Source = {
  title: string;
  url: string;
};

export type Entry = {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  category: Category;
  subcategory: string;
  era: string;
  lifespan: string;
  civilization: string;
  region: string;
  tags: string[];
  image: string;
  imageAlt: string;
  imageCredit: string;
  imageLicense: string;
  imageSource: string;
  accent: string;
  featured: boolean;
  quote: string;
  summary: string;
  body: string;
  related: string[];
  sources: Source[];
  readingMinutes: number;
};

export const categoryMeta: Record<
  Category,
  { label: string; singular: string; description: string }
> = {
  leaders: {
    label: "지도자",
    singular: "지도자",
    description: "한 사람의 선택이 제도와 시대를 어떻게 바꾸었는지 살펴봅니다.",
  },
  civilizations: {
    label: "문명",
    singular: "문명",
    description: "게임의 한 문명 안에 겹쳐 있는 긴 시간과 다양한 사람들을 만납니다.",
  },
  cities: {
    label: "도시",
    singular: "도시",
    description: "지도 위의 이름을 거리와 항구, 기억이 있는 실제 장소로 되돌립니다.",
  },
  "great-people": {
    label: "위인",
    singular: "위인",
    description: "과학과 예술, 글과 음악을 움직인 창작자의 삶을 따라갑니다.",
  },
};

export function normalizeSource(source: z.infer<typeof sourceSchema>): Source {
  if (typeof source === "string") {
    const hostname = new URL(source).hostname.replace(/^www\./, "");
    return { title: hostname, url: source };
  }
  return source;
}

export function makeSummary(markdown: string, explicit = "") {
  const candidate = explicit.trim() || (
    markdown
      .replace(/^---[\s\S]*?---/m, "")
      .replace(/^#{1,6}\s+.*$/gm, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[>*_`#-]/g, "")
      .split(/\n\s*\n/)
      .map((part) => part.replace(/\s+/g, " ").trim())
      .find((part) => part.length >= 40) ?? ""
  );
  if (candidate.length <= 168) return candidate;

  const excerpt = candidate.slice(0, 168);
  const sentenceEnd = [...excerpt.matchAll(/[.!?。！？](?=\s|$)/g)].at(-1)?.index;
  if (sentenceEnd !== undefined && sentenceEnd >= 72) {
    return excerpt.slice(0, sentenceEnd + 1).trimEnd();
  }

  const wordBoundary = excerpt.lastIndexOf(" ");
  const cutoff = wordBoundary >= 120 ? wordBoundary : 167;
  return `${excerpt.slice(0, cutoff).trimEnd()}…`;
}

export function calculateReadingMinutes(markdown: string) {
  const characters = markdown.replace(/\s/g, "").length;
  return Math.max(1, Math.ceil(characters / 500));
}
