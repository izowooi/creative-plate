import { z } from "zod";

export const categoryValues = [
  "leaders",
  "civilizations",
  "cities",
  "great-people",
] as const;

export const categorySchema = z.enum(categoryValues);
export type Category = z.infer<typeof categorySchema>;

export const greatPersonRoleValues = [
  "artists",
  "writers",
  "musicians",
  "scientists",
  "engineers",
  "merchants",
  "generals",
  "admirals",
  "prophets",
  "comandantes",
] as const;

export const greatPersonRoleSchema = z.enum(greatPersonRoleValues);
export type GreatPersonRole = z.infer<typeof greatPersonRoleSchema>;

export const cityRoleValues = [
  "capital",
  "city-state",
  "civilization-city",
  "editorial-extra",
] as const;

export const cityRoleSchema = z.enum(cityRoleValues);
export type CityRole = z.infer<typeof cityRoleSchema>;

type RoleMetadata = {
  label: string;
  longLabel: string;
  englishLabel: string;
};

export const cityRoleMeta: Record<CityRole, RoleMetadata> = {
  capital: { label: "수도", longLabel: "게임 시작 수도", englishLabel: "Capital" },
  "city-state": { label: "도시국가", longLabel: "도시국가", englishLabel: "City-State" },
  "civilization-city": {
    label: "문명 도시",
    longLabel: "문명 도시 목록",
    englishLabel: "Civilization City",
  },
  "editorial-extra": {
    label: "편집 선별",
    longLabel: "편집 선별 도시",
    englishLabel: "Editorial Extra",
  },
};

type GreatPersonRoleMetadata = RoleMetadata & {
  kind: "standard" | "special";
};

export const greatPersonRoleMeta: Record<GreatPersonRole, GreatPersonRoleMetadata> = {
  artists: { label: "미술가", longLabel: "위대한 미술가", englishLabel: "Great Artist", kind: "standard" },
  writers: { label: "작가", longLabel: "위대한 작가", englishLabel: "Great Writer", kind: "standard" },
  musicians: { label: "음악가", longLabel: "위대한 음악가", englishLabel: "Great Musician", kind: "standard" },
  scientists: { label: "과학자", longLabel: "위대한 과학자", englishLabel: "Great Scientist", kind: "standard" },
  engineers: { label: "공학자", longLabel: "위대한 공학자", englishLabel: "Great Engineer", kind: "standard" },
  merchants: { label: "상인", longLabel: "위대한 상인", englishLabel: "Great Merchant", kind: "standard" },
  generals: { label: "장군", longLabel: "위대한 장군", englishLabel: "Great General", kind: "standard" },
  admirals: { label: "제독", longLabel: "위대한 제독", englishLabel: "Great Admiral", kind: "standard" },
  prophets: { label: "예언자", longLabel: "위대한 예언자", englishLabel: "Great Prophet", kind: "standard" },
  comandantes: {
    label: "코만단테",
    longLabel: "코만단테 헤네랄",
    englishLabel: "Comandante General",
    kind: "special",
  },
};

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
  cityRoles: z.array(cityRoleSchema)
    .refine((roles) => new Set(roles).size === roles.length, "cityRoles에 중복 값이 있습니다.")
    .optional()
    .default([]),
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
  sources: z.array(sourceSchema).min(3),
}).strict().superRefine((entry, context) => {
  if (entry.category === "great-people" && !greatPersonRoleSchema.safeParse(entry.subcategory).success) {
    context.addIssue({
      code: "custom",
      path: ["subcategory"],
      message: "위인 문서는 유효한 Great Person 분야가 필요합니다.",
    });
  }
  if (entry.category !== "great-people" && entry.subcategory) {
    context.addIssue({
      code: "custom",
      path: ["subcategory"],
      message: "subcategory는 위인 문서에만 사용합니다.",
    });
  }
  if (entry.category === "cities" && entry.cityRoles.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["cityRoles"],
      message: "도시 문서는 하나 이상의 게임 내 역할이 필요합니다.",
    });
  }
  if (entry.category !== "cities" && entry.cityRoles.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["cityRoles"],
      message: "cityRoles는 도시 문서에만 사용합니다.",
    });
  }
});

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
  cityRoles: CityRole[];
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
    description: "과학과 예술부터 무역과 군사까지, 시대를 움직인 인물의 삶을 따라갑니다.",
  },
};

export function normalizeSource(source: z.infer<typeof sourceSchema>): Source {
  if (typeof source === "string") {
    const hostname = new URL(source).hostname.replace(/^www\./, "");
    return { title: hostname, url: source };
  }
  return source;
}

export function entryTypeLabel(entry: Pick<Entry, "category" | "subcategory" | "cityRoles">) {
  if (entry.category === "great-people") {
    const role = greatPersonRoleSchema.safeParse(entry.subcategory);
    if (role.success) return greatPersonRoleMeta[role.data].longLabel;
  }
  if (entry.category === "cities") {
    const preferredRole = cityRoleValues.find((role) => entry.cityRoles.includes(role));
    if (preferredRole) return cityRoleMeta[preferredRole].label;
  }
  return categoryMeta[entry.category].singular;
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
