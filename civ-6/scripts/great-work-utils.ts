import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export const greatWorkTypes = [
  "writing",
  "portrait",
  "landscape",
  "religious",
  "sculpture",
  "music",
] as const;

export const greatWorkPacks = [
  "Civilization VI base game",
  "Babylon Pack (New Frontier Pass)",
] as const;

export const greatWorkGameEras = [
  "Classical Era",
  "Medieval Era",
  "Renaissance Era",
  "Industrial Era",
  "Modern Era",
  "Atomic Era",
  "Information Era",
] as const;

export const greatWorkCreatorClasses = [
  "Great Writer",
  "Great Artist",
  "Great Musician",
  "Great General",
] as const;

export const greatWorkRulesetProfileKeys = [
  "writing_base_rf_4c_4t_gs_2c_2t",
  "writing_all_4c_4t",
  "art_all_3c_2t",
  "babylon_art_all_3c_4t",
  "music_all_4c_4t",
] as const;

export const greatWorkSourceKeys = [
  "civilopediaIndex",
  "greatWorksGameDataMirror",
  "greatPeopleGameDataMirror",
  "babylonPackOfficialSteamAnnouncement",
  "greatWorkRulesCrossCheck",
  "greatWriterRulesCrossCheck",
  "greatArtistRulesCrossCheck",
  "greatMusicianRulesCrossCheck",
  "tchaikovskyIdentityCrossCheck",
] as const;

export type GreatWorkType = (typeof greatWorkTypes)[number];
export type GreatWorkPack = (typeof greatWorkPacks)[number];
export type GreatWorkGameEra = (typeof greatWorkGameEras)[number];
export type GreatWorkCreatorClass = (typeof greatWorkCreatorClasses)[number];
export type GreatWorkRulesetProfileKey = (typeof greatWorkRulesetProfileKeys)[number];

export type GreatWorkCreator = {
  gameName: string;
  creatorClass: GreatWorkCreatorClass;
  entryId: string;
  entrySlug: string;
  entryPath: string;
};

export type GreatWorkRulesetYield = {
  culture: number;
  tourism: number;
};

export type GreatWorkRulesetProfile = {
  "Standard Rules": GreatWorkRulesetYield;
  "Rise and Fall": GreatWorkRulesetYield;
  "Gathering Storm": GreatWorkRulesetYield;
  note?: string;
};

export type GreatWorkCatalogRecord = {
  id: string;
  gameId: string;
  slug: string;
  path: string;
  creatorKey: string;
  workTitle: string;
  type: GreatWorkType;
  order: number;
  gameEra: GreatWorkGameEra;
  pack: GreatWorkPack;
  rulesetProfile: GreatWorkRulesetProfileKey;
  gameSource: string;
  notationNotes: string[];
};

export type GreatWorksCatalog = {
  schemaVersion: 1;
  checkedAt: string;
  scope: {
    included: string;
    excluded: string[];
  };
  sources: Record<(typeof greatWorkSourceKeys)[number], string>;
  globalNotes: string[];
  rulesetProfiles: Record<GreatWorkRulesetProfileKey, GreatWorkRulesetProfile>;
  creatorMap: Record<string, GreatWorkCreator>;
  records: GreatWorkCatalogRecord[];
};

export type GreatWorkDocumentAudit = {
  catalogTotal: number;
  present: GreatWorkCatalogRecord[];
  missing: GreatWorkCatalogRecord[];
  issues: string[];
  countsByType: Record<GreatWorkType, { present: number; total: number }>;
};

export const greatWorksCatalogPath = path.join("docs", "catalog", "civ6-great-works.json");
export const greatWorksDocumentsPath = path.join("docs", "great-works");

export const expectedGreatWorkCounts = {
  records: 166,
  creators: 71,
  notationRecords: 19,
  notationNotes: 22,
  byType: {
    writing: 59,
    portrait: 18,
    landscape: 25,
    religious: 12,
    sculpture: 14,
    music: 38,
  },
  byPack: {
    "Civilization VI base game": 143,
    "Babylon Pack (New Frontier Pass)": 23,
  },
  byGameEra: {
    "Classical Era": 11,
    "Medieval Era": 8,
    "Renaissance Era": 25,
    "Industrial Era": 38,
    "Modern Era": 37,
    "Atomic Era": 24,
    "Information Era": 23,
  },
  creatorsByClass: {
    "Great Writer": 29,
    "Great Artist": 23,
    "Great Musician": 18,
    "Great General": 1,
  },
  worksByClass: {
    "Great Writer": 58,
    "Great Artist": 69,
    "Great Musician": 38,
    "Great General": 1,
  },
} as const;

export const creatorClassSubcategory: Record<GreatWorkCreatorClass, string> = {
  "Great Writer": "writers",
  "Great Artist": "artists",
  "Great Musician": "musicians",
  "Great General": "generals",
};

const artTypes = new Set<GreatWorkType>([
  "portrait",
  "landscape",
  "religious",
  "sculpture",
]);

const rulesetNames = ["Standard Rules", "Rise and Fall", "Gathering Storm"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function sameMembers(actual: string[], expected: readonly string[]) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function addUnknownFieldErrors(
  location: string,
  value: Record<string, unknown>,
  allowed: readonly string[],
  errors: string[],
) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) errors.push(`${location}에 알 수 없는 field가 있습니다: ${extras.join(", ")}`);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function compareDistribution(
  label: string,
  actual: Record<string, number>,
  expected: Record<string, number>,
  errors: string[],
) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of [...keys].sort()) {
    const actualCount = actual[key] ?? 0;
    const expectedCount = expected[key] ?? 0;
    if (actualCount !== expectedCount) {
      errors.push(`${label}.${key}는 ${expectedCount}개여야 합니다: ${actualCount}`);
    }
  }
}

function addUniqueValue(
  label: string,
  value: unknown,
  location: string,
  seen: Map<string, string>,
  errors: string[],
) {
  if (!isNonEmptyString(value)) return;
  const first = seen.get(value);
  if (first) errors.push(`${location}.${label}가 ${first}과 중복됩니다: ${value}`);
  else seen.set(value, location);
}

function expectedRulesetProfile(
  type: GreatWorkType,
  pack: GreatWorkPack,
  creatorKey: string,
): GreatWorkRulesetProfileKey {
  if (type === "writing") {
    return creatorKey === "sun_tzu" || pack === "Babylon Pack (New Frontier Pass)"
      ? "writing_all_4c_4t"
      : "writing_base_rf_4c_4t_gs_2c_2t";
  }
  if (type === "music") return "music_all_4c_4t";
  return pack === "Babylon Pack (New Frontier Pass)"
    ? "babylon_art_all_3c_4t"
    : "art_all_3c_2t";
}

function validateDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function validateRulesetProfiles(value: unknown, errors: string[]) {
  if (!isRecord(value)) {
    errors.push("rulesetProfiles는 object여야 합니다.");
    return;
  }
  if (!sameMembers(Object.keys(value), greatWorkRulesetProfileKeys)) {
    errors.push(`rulesetProfiles는 정확히 ${greatWorkRulesetProfileKeys.join(", ")}여야 합니다.`);
  }
  for (const profileKey of greatWorkRulesetProfileKeys) {
    const profile = value[profileKey];
    const location = `rulesetProfiles.${profileKey}`;
    if (!isRecord(profile)) {
      errors.push(`${location}는 object여야 합니다.`);
      continue;
    }
    addUnknownFieldErrors(location, profile, [...rulesetNames, "note"], errors);
    for (const ruleset of rulesetNames) {
      const yields = profile[ruleset];
      if (!isRecord(yields)) {
        errors.push(`${location}.${ruleset}는 object여야 합니다.`);
        continue;
      }
      addUnknownFieldErrors(`${location}.${ruleset}`, yields, ["culture", "tourism"], errors);
      for (const field of ["culture", "tourism"] as const) {
        if (!Number.isInteger(yields[field]) || Number(yields[field]) < 0) {
          errors.push(`${location}.${ruleset}.${field}는 0 이상의 정수여야 합니다.`);
        }
      }
    }
    if (profile.note !== undefined && !isNonEmptyString(profile.note)) {
      errors.push(`${location}.note는 비어 있지 않은 string이어야 합니다.`);
    }
  }
}

export function validateGreatWorksCatalog(value: unknown) {
  const errors: string[] = [];
  if (!isRecord(value)) return ["Great Works catalog root는 object여야 합니다."];

  const rootKeys = [
    "schemaVersion",
    "checkedAt",
    "scope",
    "sources",
    "globalNotes",
    "rulesetProfiles",
    "creatorMap",
    "records",
  ];
  addUnknownFieldErrors("catalog root", value, rootKeys, errors);
  if (value.schemaVersion !== 1) {
    errors.push(`schemaVersion은 1이어야 합니다: ${String(value.schemaVersion)}`);
  }
  if (!validateDate(value.checkedAt)) errors.push("checkedAt은 실제 YYYY-MM-DD 날짜여야 합니다.");

  if (!isRecord(value.scope)) {
    errors.push("scope는 object여야 합니다.");
  } else {
    addUnknownFieldErrors("scope", value.scope, ["included", "excluded"], errors);
    if (!isNonEmptyString(value.scope.included)) errors.push("scope.included가 비어 있습니다.");
    if (!isStringArray(value.scope.excluded)) errors.push("scope.excluded는 비어 있지 않은 string array여야 합니다.");
  }

  if (!isRecord(value.sources)) {
    errors.push("sources는 object여야 합니다.");
  } else {
    if (!sameMembers(Object.keys(value.sources), greatWorkSourceKeys)) {
      errors.push(`sources는 정확히 ${greatWorkSourceKeys.join(", ")}여야 합니다.`);
    }
    for (const key of greatWorkSourceKeys) {
      const source = value.sources[key];
      if (!isNonEmptyString(source) || !isHttpUrl(source)) {
        errors.push(`sources.${key}는 HTTP(S) URL이어야 합니다.`);
      }
    }
  }

  if (!isStringArray(value.globalNotes)) {
    errors.push("globalNotes는 비어 있지 않은 string array여야 합니다.");
  } else if (new Set(value.globalNotes).size !== value.globalNotes.length) {
    errors.push("globalNotes에 중복이 있습니다.");
  }

  validateRulesetProfiles(value.rulesetProfiles, errors);

  const creatorMap = isRecord(value.creatorMap) ? value.creatorMap : {};
  if (!isRecord(value.creatorMap)) errors.push("creatorMap은 object여야 합니다.");
  if (Object.keys(creatorMap).length !== expectedGreatWorkCounts.creators) {
    errors.push(`creatorMap은 ${expectedGreatWorkCounts.creators}명이어야 합니다: ${Object.keys(creatorMap).length}`);
  }

  const creatorIds = new Map<string, string>();
  const creatorSlugs = new Map<string, string>();
  const creatorPaths = new Map<string, string>();
  const creatorClasses: string[] = [];
  for (const [creatorKey, creator] of Object.entries(creatorMap)) {
    const location = `creatorMap.${creatorKey}`;
    if (!/^[a-z0-9_]+$/.test(creatorKey)) errors.push(`${location} key는 snake_case여야 합니다.`);
    if (!isRecord(creator)) {
      errors.push(`${location}는 object여야 합니다.`);
      continue;
    }
    addUnknownFieldErrors(
      location,
      creator,
      ["gameName", "creatorClass", "entryId", "entrySlug", "entryPath"],
      errors,
    );
    for (const field of ["gameName", "entryId", "entrySlug", "entryPath"] as const) {
      if (!isNonEmptyString(creator[field])) errors.push(`${location}.${field}가 비어 있습니다.`);
    }
    if (!greatWorkCreatorClasses.includes(creator.creatorClass as GreatWorkCreatorClass)) {
      errors.push(`${location}.creatorClass가 허용 목록에 없습니다: ${String(creator.creatorClass)}`);
    } else {
      creatorClasses.push(creator.creatorClass as GreatWorkCreatorClass);
    }
    addUniqueValue("entryId", creator.entryId, location, creatorIds, errors);
    addUniqueValue("entrySlug", creator.entrySlug, location, creatorSlugs, errors);
    addUniqueValue("entryPath", creator.entryPath, location, creatorPaths, errors);
    if (isNonEmptyString(creator.entryPath) && isNonEmptyString(creator.entrySlug)) {
      const normalizedPath = creator.entryPath.replaceAll("\\", "/");
      if (!normalizedPath.startsWith("docs/great-people/") || !normalizedPath.endsWith(".md")) {
        errors.push(`${location}.entryPath는 docs/great-people 아래 Markdown이어야 합니다.`);
      }
      if (path.posix.basename(normalizedPath, ".md") !== creator.entrySlug) {
        errors.push(`${location}.entrySlug는 entryPath의 basename이어야 합니다.`);
      }
    }
  }
  compareDistribution(
    "creator class 분포",
    countBy(creatorClasses),
    expectedGreatWorkCounts.creatorsByClass,
    errors,
  );

  const records = Array.isArray(value.records) ? value.records : [];
  if (!Array.isArray(value.records)) errors.push("records는 array여야 합니다.");
  if (records.length !== expectedGreatWorkCounts.records) {
    errors.push(`records는 ${expectedGreatWorkCounts.records}개여야 합니다: ${records.length}`);
  }

  const ids = new Map<string, string>();
  const gameIds = new Map<string, string>();
  const slugs = new Map<string, string>();
  const paths = new Map<string, string>();
  const workTitles = new Map<string, string>();
  const creatorOrders = new Map<string, number[]>();
  const referencedCreators = new Set<string>();
  const types: string[] = [];
  const packs: string[] = [];
  const gameEras: string[] = [];
  const workClasses: string[] = [];
  let notationRecords = 0;
  let notationNotes = 0;

  records.forEach((record, index) => {
    const location = `records[${index}]`;
    if (!isRecord(record)) {
      errors.push(`${location}은 object여야 합니다.`);
      return;
    }
    const allowedFields = [
      "id",
      "gameId",
      "slug",
      "path",
      "creatorKey",
      "workTitle",
      "type",
      "order",
      "gameEra",
      "pack",
      "rulesetProfile",
      "gameSource",
      "notationNotes",
    ];
    addUnknownFieldErrors(location, record, allowedFields, errors);
    for (const field of [
      "id",
      "gameId",
      "slug",
      "path",
      "creatorKey",
      "workTitle",
      "type",
      "gameEra",
      "pack",
      "rulesetProfile",
      "gameSource",
    ] as const) {
      if (!isNonEmptyString(record[field])) errors.push(`${location}.${field}가 비어 있습니다.`);
    }
    if (!Number.isInteger(record.order) || Number(record.order) < 1) {
      errors.push(`${location}.order는 1 이상의 정수여야 합니다.`);
    }
    if (!isStringArray(record.notationNotes) && !(Array.isArray(record.notationNotes) && !record.notationNotes.length)) {
      errors.push(`${location}.notationNotes는 string array여야 합니다.`);
    } else if (new Set(record.notationNotes as string[]).size !== (record.notationNotes as string[]).length) {
      errors.push(`${location}.notationNotes에 중복이 있습니다.`);
    }

    addUniqueValue("id", record.id, location, ids, errors);
    addUniqueValue("gameId", record.gameId, location, gameIds, errors);
    addUniqueValue("slug", record.slug, location, slugs, errors);
    addUniqueValue("path", record.path, location, paths, errors);
    addUniqueValue("workTitle", record.workTitle, location, workTitles, errors);

    if (isNonEmptyString(record.gameId) && record.id !== `great-work:${record.gameId}`) {
      errors.push(`${location}.id는 great-work:${record.gameId}여야 합니다.`);
    }
    if (isNonEmptyString(record.gameId) && !/^GREATWORK_[A-Z0-9_]+$/.test(record.gameId)) {
      errors.push(`${location}.gameId 형식이 잘못됐습니다: ${record.gameId}`);
    }
    if (!greatWorkTypes.includes(record.type as GreatWorkType)) {
      errors.push(`${location}.type이 허용 목록에 없습니다: ${String(record.type)}`);
    } else {
      types.push(record.type as GreatWorkType);
    }
    if (!greatWorkPacks.includes(record.pack as GreatWorkPack)) {
      errors.push(`${location}.pack이 허용 목록에 없습니다: ${String(record.pack)}`);
    } else {
      packs.push(record.pack as GreatWorkPack);
    }
    if (!greatWorkGameEras.includes(record.gameEra as GreatWorkGameEra)) {
      errors.push(`${location}.gameEra가 허용 목록에 없습니다: ${String(record.gameEra)}`);
    } else {
      gameEras.push(record.gameEra as GreatWorkGameEra);
    }
    if (!greatWorkRulesetProfileKeys.includes(record.rulesetProfile as GreatWorkRulesetProfileKey)) {
      errors.push(`${location}.rulesetProfile이 존재하지 않습니다: ${String(record.rulesetProfile)}`);
    }
    if (isNonEmptyString(record.gameSource) && !isHttpUrl(record.gameSource)) {
      errors.push(`${location}.gameSource는 HTTP(S) URL이어야 합니다.`);
    }

    const creatorKey = isNonEmptyString(record.creatorKey) ? record.creatorKey : "";
    const creator = creatorMap[creatorKey];
    if (!creator) {
      if (creatorKey) errors.push(`${location}.creatorKey가 creatorMap에 없습니다: ${creatorKey}`);
    } else if (isRecord(creator)) {
      referencedCreators.add(creatorKey);
      if (isNonEmptyString(creator.entryId) && Number.isInteger(record.order)) {
        const expectedSlug = `great-work-${creator.entryId}-${record.order}`;
        if (record.slug !== expectedSlug) errors.push(`${location}.slug는 ${expectedSlug}여야 합니다.`);
        if (greatWorkTypes.includes(record.type as GreatWorkType)) {
          const expectedPath = `${record.type}/${expectedSlug}.md`;
          if (record.path !== expectedPath) errors.push(`${location}.path는 ${expectedPath}여야 합니다.`);
        }
      }
      if (greatWorkCreatorClasses.includes(creator.creatorClass as GreatWorkCreatorClass)) {
        const creatorClass = creator.creatorClass as GreatWorkCreatorClass;
        workClasses.push(creatorClass);
        const type = record.type as GreatWorkType;
        if (creatorClass === "Great Writer" && type !== "writing") {
          errors.push(`${location}: Great Writer의 작품은 writing이어야 합니다.`);
        }
        if (creatorClass === "Great Musician" && type !== "music") {
          errors.push(`${location}: Great Musician의 작품은 music이어야 합니다.`);
        }
        if (creatorClass === "Great Artist" && !artTypes.has(type)) {
          errors.push(`${location}: Great Artist의 작품은 art subtype이어야 합니다.`);
        }
        if (creatorClass === "Great General" && (creatorKey !== "sun_tzu" || type !== "writing")) {
          errors.push(`${location}: Great General 예외는 Sun Tzu의 writing 작품만 허용합니다.`);
        }
      }
    }

    if (creatorKey && Number.isInteger(record.order)) {
      const orders = creatorOrders.get(creatorKey) ?? [];
      orders.push(Number(record.order));
      creatorOrders.set(creatorKey, orders);
    }

    if (
      greatWorkTypes.includes(record.type as GreatWorkType) &&
      greatWorkPacks.includes(record.pack as GreatWorkPack) &&
      creatorKey
    ) {
      const expected = expectedRulesetProfile(
        record.type as GreatWorkType,
        record.pack as GreatWorkPack,
        creatorKey,
      );
      if (record.rulesetProfile !== expected) {
        errors.push(`${location}.rulesetProfile은 ${expected}여야 합니다.`);
      }
    }

    if (Array.isArray(record.notationNotes)) {
      const noteCount = record.notationNotes.length;
      if (noteCount) notationRecords += 1;
      notationNotes += noteCount;
    }
  });

  compareDistribution("작품 type 분포", countBy(types), expectedGreatWorkCounts.byType, errors);
  compareDistribution("작품 pack 분포", countBy(packs), expectedGreatWorkCounts.byPack, errors);
  compareDistribution("작품 gameEra 분포", countBy(gameEras), expectedGreatWorkCounts.byGameEra, errors);
  compareDistribution("작품 creator class 분포", countBy(workClasses), expectedGreatWorkCounts.worksByClass, errors);
  if (notationRecords !== expectedGreatWorkCounts.notationRecords) {
    errors.push(`notationNotes가 있는 record는 ${expectedGreatWorkCounts.notationRecords}개여야 합니다: ${notationRecords}`);
  }
  if (notationNotes !== expectedGreatWorkCounts.notationNotes) {
    errors.push(`notationNotes 총합은 ${expectedGreatWorkCounts.notationNotes}개여야 합니다: ${notationNotes}`);
  }

  if (referencedCreators.size !== expectedGreatWorkCounts.creators) {
    errors.push(`records는 creator ${expectedGreatWorkCounts.creators}명을 모두 참조해야 합니다: ${referencedCreators.size}`);
  }
  for (const creatorKey of Object.keys(creatorMap)) {
    if (!referencedCreators.has(creatorKey)) errors.push(`creatorMap.${creatorKey}를 참조하는 record가 없습니다.`);
  }
  for (const [creatorKey, orders] of creatorOrders) {
    const sorted = [...orders].sort((left, right) => left - right);
    const expected = Array.from({ length: sorted.length }, (_, index) => index + 1);
    if (sorted.some((order, index) => order !== expected[index])) {
      errors.push(`${creatorKey}의 order는 1부터 연속이어야 합니다: ${sorted.join(", ")}`);
    }
  }

  const sunTzu = creatorMap.sun_tzu;
  if (
    !isRecord(sunTzu) ||
    sunTzu.creatorClass !== "Great General" ||
    sunTzu.entryId !== "sun-tzu" ||
    sunTzu.entrySlug !== "sun-tzu" ||
    sunTzu.entryPath !== "docs/great-people/generals/sun-tzu.md"
  ) {
    errors.push("Sun Tzu creatorMap 예외가 canonical Great General 문서와 일치하지 않습니다.");
  }
  const sunRecords = records.filter((record) => isRecord(record) && record.creatorKey === "sun_tzu");
  if (
    sunRecords.length !== 1 ||
    sunRecords[0]?.type !== "writing" ||
    sunRecords[0]?.order !== 1 ||
    sunRecords[0]?.workTitle !== "The Art of War"
  ) {
    errors.push("Sun Tzu 예외는 The Art of War writing record 1개여야 합니다.");
  }

  return errors;
}

export function assertGreatWorksCatalog(value: unknown): asserts value is GreatWorksCatalog {
  const errors = validateGreatWorksCatalog(value);
  if (errors.length) throw new Error(`Great Works catalog validation failed:\n- ${errors.join("\n- ")}`);
}

export function loadGreatWorksCatalog(repoRoot = process.cwd()) {
  const catalogPath = path.join(repoRoot, greatWorksCatalogPath);
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`${greatWorksCatalogPath}이 없습니다.`);
  }
  const value: unknown = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  assertGreatWorksCatalog(value);
  return value;
}

export function validateGreatWorkCreatorDocuments(
  catalog: GreatWorksCatalog,
  repoRoot = process.cwd(),
) {
  const errors: string[] = [];
  for (const [creatorKey, creator] of Object.entries(catalog.creatorMap)) {
    const location = `creatorMap.${creatorKey}`;
    const absolutePath = path.join(repoRoot, creator.entryPath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`${location}.entryPath가 존재하지 않습니다: ${creator.entryPath}`);
      continue;
    }
    const actualSlug = path.basename(absolutePath, ".md");
    if (actualSlug !== creator.entrySlug) {
      errors.push(`${location}.entrySlug ${creator.entrySlug}가 실제 route ${actualSlug}와 다릅니다.`);
    }
    try {
      const { data } = matter(fs.readFileSync(absolutePath, "utf8"));
      if (data.id !== creator.entryId) {
        errors.push(`${location}.entryId ${creator.entryId}가 실제 id ${String(data.id)}와 다릅니다.`);
      }
      if (data.category !== "great-people") {
        errors.push(`${location}.entryPath는 great-people 문서여야 합니다.`);
      }
      const expectedSubcategory = creatorClassSubcategory[creator.creatorClass];
      if (data.subcategory !== expectedSubcategory) {
        errors.push(
          `${location}.creatorClass ${creator.creatorClass}는 실제 subcategory ${expectedSubcategory}와 연결되어야 합니다: ` +
          String(data.subcategory),
        );
      }
    } catch (error) {
      errors.push(`${location}.entryPath frontmatter를 읽을 수 없습니다: ${String(error)}`);
    }
  }
  return errors;
}

function listMarkdownFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(target);
    return entry.isFile() && entry.name.endsWith(".md") ? [target] : [];
  });
}

function posixRelative(from: string, to: string) {
  return path.relative(from, to).split(path.sep).join("/");
}

function addDocumentDuplicate(
  label: string,
  value: unknown,
  documentPath: string,
  seen: Map<string, string>,
  issues: string[],
) {
  if (!isNonEmptyString(value)) return;
  const first = seen.get(value);
  if (first) issues.push(`${documentPath}: ${label}가 ${first}과 중복됩니다: ${value}`);
  else seen.set(value, documentPath);
}

export function auditGreatWorkDocuments(
  catalog: GreatWorksCatalog,
  repoRoot = process.cwd(),
): GreatWorkDocumentAudit {
  const documentsRoot = path.join(repoRoot, greatWorksDocumentsPath);
  const catalogByPath = new Map(catalog.records.map((record) => [record.path, record]));
  const actualFiles = listMarkdownFiles(documentsRoot)
    .filter((file) => path.basename(file).toLowerCase() !== "readme.md")
    .sort();
  const actualPaths = new Set(actualFiles.map((file) => posixRelative(documentsRoot, file)));
  const present = catalog.records.filter((record) => actualPaths.has(record.path));
  const missing = catalog.records.filter((record) => !actualPaths.has(record.path));
  const issues: string[] = [];
  const documentIds = new Map<string, string>();
  const documentGameIds = new Map<string, string>();

  for (const absolutePath of actualFiles) {
    const relativePath = posixRelative(documentsRoot, absolutePath);
    const record = catalogByPath.get(relativePath);
    if (!record) {
      issues.push(`${greatWorksDocumentsPath}/${relativePath}: catalog에 없는 Markdown입니다.`);
      continue;
    }
    const creator = catalog.creatorMap[record.creatorKey];
    try {
      const { data } = matter(fs.readFileSync(absolutePath, "utf8"));
      const documentPath = `${greatWorksDocumentsPath}/${relativePath}`;
      if (data.id !== record.id) {
        issues.push(`${documentPath}: id는 ${record.id}여야 합니다: ${String(data.id)}`);
      }
      if (data.nameEn !== record.workTitle) {
        issues.push(`${documentPath}: nameEn은 ${JSON.stringify(record.workTitle)}여야 합니다: ${JSON.stringify(data.nameEn)}`);
      }
      if (data.category !== "great-works") {
        issues.push(`${documentPath}: category는 great-works여야 합니다: ${String(data.category)}`);
      }
      if (data.subcategory !== record.type) {
        issues.push(`${documentPath}: subcategory는 ${record.type}이어야 합니다: ${String(data.subcategory)}`);
      }
      if (!isRecord(data.greatWork)) {
        issues.push(`${documentPath}: greatWork object가 없습니다.`);
      } else {
        if (data.greatWork.gameId !== record.gameId) {
          issues.push(`${documentPath}: greatWork.gameId는 ${record.gameId}여야 합니다: ${String(data.greatWork.gameId)}`);
        }
        if (data.greatWork.creatorId !== creator.entryId) {
          issues.push(
            `${documentPath}: greatWork.creatorId는 canonical entry id ${creator.entryId}여야 합니다: ` +
            String(data.greatWork.creatorId),
          );
        }
        addDocumentDuplicate(
          "greatWork.gameId",
          data.greatWork.gameId,
          documentPath,
          documentGameIds,
          issues,
        );
      }
      addDocumentDuplicate("id", data.id, documentPath, documentIds, issues);
      if (path.basename(absolutePath, ".md") !== record.slug) {
        issues.push(`${documentPath}: filename은 ${record.slug}.md여야 합니다.`);
      }
    } catch (error) {
      issues.push(`${greatWorksDocumentsPath}/${relativePath}: frontmatter를 읽을 수 없습니다: ${String(error)}`);
    }
  }

  const countsByType = Object.fromEntries(greatWorkTypes.map((type) => [
    type,
    {
      present: present.filter((record) => record.type === type).length,
      total: catalog.records.filter((record) => record.type === type).length,
    },
  ])) as Record<GreatWorkType, { present: number; total: number }>;

  return {
    catalogTotal: catalog.records.length,
    present,
    missing,
    issues,
    countsByType,
  };
}

export function greatWorkDocumentAuditErrors(
  audit: GreatWorkDocumentAudit,
  options: { requireComplete?: boolean } = {},
) {
  const errors = [...audit.issues];
  if (options.requireComplete && audit.missing.length) {
    const sample = audit.missing.slice(0, 8).map((record) => record.path).join(", ");
    const remaining = audit.missing.length > 8 ? ` 외 ${audit.missing.length - 8}개` : "";
    errors.push(`Great Works Markdown ${audit.missing.length}개가 없습니다: ${sample}${remaining}`);
  }
  return errors;
}
