import fs from "node:fs";
import path from "node:path";

export const rosterGreatPersonRoles = [
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

export type RosterGreatPersonRole = (typeof rosterGreatPersonRoles)[number];
export type RosterScope = "core" | "bonus";
export type RosterAvailability = "active" | "legacy";
export type GreatPersonKind = "standard" | "special";

export type RosterItem = {
  id: string;
  name: string;
  rosterLabel: string;
  slug: string;
  scope: RosterScope;
  availability: RosterAvailability;
  aliases?: string[];
  replacedBy?: string;
};

export type GreatPersonRosterItem = RosterItem & {
  kind: GreatPersonKind;
};

export type RosterSources = {
  officialGame: string;
  officialLeaderPass: string;
  civilopedia: {
    leaders: string;
    cityStates: string;
    greatPeople: string;
  };
  wiki: {
    leaders: string;
    civilizations: string;
    capitals: string;
    cityStates: string;
    greatPeople: Record<RosterGreatPersonRole, string>;
  };
};

export type RosterSnapshot = {
  schemaVersion: 2;
  checkedAt: string;
  catalogScope: string;
  sources: RosterSources;
  leaders: RosterItem[];
  civilizations: RosterItem[];
  cities: {
    capitals: RosterItem[];
    cityStates: RosterItem[];
  };
  greatPeople: Record<RosterGreatPersonRole, GreatPersonRosterItem[]>;
};

export const rosterPath = path.join(process.cwd(), "docs", "catalog", "civ6-roster.json");

export const civilizationNamesByRosterLabel = {
  American: "America",
  Arabian: "Arabia",
  Australian: "Australia",
  Aztec: "Aztec",
  Babylonian: "Babylon",
  Brazilian: "Brazil",
  Byzantine: "Byzantium",
  Canadian: "Canada",
  Chinese: "China",
  Cree: "Cree",
  Dutch: "Netherlands",
  Egyptian: "Egypt",
  English: "England",
  Ethiopian: "Ethiopia",
  French: "France",
  Gallic: "Gaul",
  Georgian: "Georgia",
  German: "Germany",
  "Gran Colombian": "Gran Colombia",
  Greek: "Greece",
  Hungarian: "Hungary",
  Incan: "Inca",
  Indian: "India",
  Indonesian: "Indonesia",
  Japanese: "Japan",
  Khmer: "Khmer",
  Kongolese: "Kongo",
  Korean: "Korea",
  Macedonian: "Macedon",
  Malian: "Mali",
  Māori: "Māori",
  Mapuche: "Mapuche",
  Mayan: "Maya",
  Mongolian: "Mongolia",
  Norwegian: "Norway",
  Nubian: "Nubia",
  Ottoman: "Ottomans",
  Persian: "Persia",
  Phoenician: "Phoenicia",
  Polish: "Poland",
  Portuguese: "Portugal",
  Roman: "Rome",
  Russian: "Russia",
  Scottish: "Scotland",
  Scythian: "Scythia",
  Spanish: "Spain",
  Sumerian: "Sumeria",
  Swedish: "Sweden",
  Vietnamese: "Vietnam",
  Zulu: "Zulu",
} as const;

export const legacyCityStateNames = [
  "Amsterdam",
  "Antioch",
  "Babylon",
  "Carthage",
  "Jakarta",
  "Lisbon",
  "Palenque",
  "Seoul",
  "Stockholm",
  "Toronto",
] as const;

export const legacyGreatGeneralReplacements = {
  "Genghis Khan": "Timur",
  "Ana Nzinga": "Amina",
  "Simón Bolívar": "José de San Martín",
} as const;

export const expectedGreatPeopleCounts: Record<
  RosterGreatPersonRole,
  { active: number; legacy: number; kind: GreatPersonKind }
> = {
  artists: { active: 23, legacy: 0, kind: "standard" },
  writers: { active: 29, legacy: 0, kind: "standard" },
  musicians: { active: 18, legacy: 0, kind: "standard" },
  scientists: { active: 24, legacy: 0, kind: "standard" },
  engineers: { active: 21, legacy: 0, kind: "standard" },
  merchants: { active: 24, legacy: 0, kind: "standard" },
  generals: { active: 24, legacy: 3, kind: "standard" },
  admirals: { active: 23, legacy: 0, kind: "standard" },
  prophets: { active: 16, legacy: 0, kind: "standard" },
  comandantes: { active: 10, legacy: 0, kind: "special" },
};

export const rosterSourceUrls: RosterSources = {
  officialGame: "https://civilization.2k.com/civ-vi/",
  officialLeaderPass: "https://support.civilization.com/hc/en-us/articles/37658016431891-Civilization-VI-Leader-Pass",
  civilopedia: {
    leaders: "https://www.civilopedia.net/en-US/gathering-storm/civilizations/leaders_intro/",
    cityStates: "https://www.civilopedia.net/en-US/gathering-storm/citystates/intro/",
    greatPeople: "https://www.civilopedia.net/en-US/gathering-storm/greatpeople/intro/",
  },
  wiki: {
    leaders: "https://civilization.fandom.com/wiki/Leaders_(Civ6)",
    civilizations: "https://civilization.fandom.com/wiki/Civilizations_(Civ6)",
    capitals: "https://civilization.fandom.com/wiki/Capital_(Civ6)",
    cityStates: "https://civilization.fandom.com/wiki/List_of_city-states_in_Civ6",
    greatPeople: {
      artists: "https://civilization.fandom.com/wiki/Great_Artist_(Civ6)",
      writers: "https://civilization.fandom.com/wiki/Great_Writer_(Civ6)",
      musicians: "https://civilization.fandom.com/wiki/Great_Musician_(Civ6)",
      scientists: "https://civilization.fandom.com/wiki/Great_Scientist_(Civ6)",
      engineers: "https://civilization.fandom.com/wiki/Great_Engineer_(Civ6)",
      merchants: "https://civilization.fandom.com/wiki/Great_Merchant_(Civ6)",
      generals: "https://civilization.fandom.com/wiki/Great_General_(Civ6)",
      admirals: "https://civilization.fandom.com/wiki/Great_Admiral_(Civ6)",
      prophets: "https://civilization.fandom.com/wiki/Great_Prophet_(Civ6)",
      comandantes: "https://civilization.fandom.com/wiki/Comandante_General_(Civ6)",
    },
  },
};

const transliterations: Record<string, string> = {
  ß: "ss",
  Æ: "AE",
  æ: "ae",
  Œ: "OE",
  œ: "oe",
  Ø: "O",
  ø: "o",
  Ł: "L",
  ł: "l",
  Ð: "D",
  ð: "d",
  Đ: "D",
  đ: "d",
  Þ: "TH",
  þ: "th",
};

function transliterate(value: string) {
  return [...value].map((character) => transliterations[character] ?? character).join("");
}

export function slugifyRosterName(value: string) {
  return transliterate(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019'`]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9가-힯]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function normalizeRosterText(value: string) {
  return slugifyRosterName(value).replaceAll("-", "");
}

export function normalizeRosterMatch(value: string) {
  return normalizeRosterText(
    value
      .replace(/\b(queen|king|emperor|saint|the great|civilization)\b/gi, " ")
      .replace(/\b(vii|ii|iii|iv|vi|viii|ix|x)\b/gi, " "),
  )
    .replace(/^theodoreroosevelt$/, "teddyroosevelt")
    .replace(/^tokugawaieyasu$/, "tokugawa");
}

export function makeRosterItem(
  namespace: string,
  name: string,
  rosterLabel: string,
  scope: RosterScope,
  availability: RosterAvailability,
  metadata: Pick<RosterItem, "aliases" | "replacedBy"> = {},
): RosterItem {
  const slug = slugifyRosterName(name);
  if (!slug) throw new Error(`${namespace}: "${name}"에서 slug를 만들 수 없습니다.`);

  const aliases = [...new Set(metadata.aliases?.map((alias) => alias.trim()).filter(Boolean) ?? [])];
  return {
    id: `${namespace}:${slug}`,
    name,
    rosterLabel,
    slug,
    scope,
    availability,
    ...(aliases.length ? { aliases } : {}),
    ...(metadata.replacedBy ? { replacedBy: metadata.replacedBy } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => valuesEqual(item, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return sameMembers(leftKeys, rightKeys) && leftKeys.every((key) => valuesEqual(left[key], right[key]));
  }
  return false;
}

function sameMembers(actual: string[], expected: readonly string[]) {
  return actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

export function validateRosterSnapshot(value: unknown) {
  const errors: string[] = [];
  if (!isRecord(value)) return ["roster root는 object여야 합니다."];

  if (value.schemaVersion !== 2) errors.push(`schemaVersion은 2여야 합니다: ${String(value.schemaVersion)}`);
  if (typeof value.checkedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.checkedAt)) {
    errors.push("checkedAt은 YYYY-MM-DD 형식이어야 합니다.");
  } else {
    const checkedAtTime = Date.parse(`${value.checkedAt}T00:00:00Z`);
    if (
      Number.isNaN(checkedAtTime) ||
      new Date(checkedAtTime).toISOString().slice(0, 10) !== value.checkedAt
    ) {
      errors.push("checkedAt은 실제 달력 날짜여야 합니다.");
    }
  }
  if (typeof value.catalogScope !== "string" || !value.catalogScope.trim()) {
    errors.push("catalogScope가 비어 있습니다.");
  }
  if (!valuesEqual(value.sources, rosterSourceUrls)) errors.push("필수 roster source URL 구성이 일치하지 않습니다.");

  const leaders = Array.isArray(value.leaders) ? value.leaders : [];
  const civilizations = Array.isArray(value.civilizations) ? value.civilizations : [];
  const cities = isRecord(value.cities) ? value.cities : {};
  const capitals = Array.isArray(cities.capitals) ? cities.capitals : [];
  const cityStates = Array.isArray(cities.cityStates) ? cities.cityStates : [];
  const greatPeople = isRecord(value.greatPeople) ? value.greatPeople : {};

  if (!Array.isArray(value.leaders)) errors.push("leaders는 array여야 합니다.");
  if (!Array.isArray(value.civilizations)) errors.push("civilizations는 array여야 합니다.");
  if (!isRecord(value.cities)) errors.push("cities는 object여야 합니다.");
  if (!Array.isArray(cities.capitals)) errors.push("cities.capitals는 array여야 합니다.");
  if (!Array.isArray(cities.cityStates)) errors.push("cities.cityStates는 array여야 합니다.");
  if (!isRecord(value.greatPeople)) errors.push("greatPeople은 object여야 합니다.");
  const rootKeys = [
    "schemaVersion",
    "checkedAt",
    "catalogScope",
    "sources",
    "leaders",
    "civilizations",
    "cities",
    "greatPeople",
  ];
  const extraRootKeys = Object.keys(value).filter((key) => !rootKeys.includes(key));
  if (extraRootKeys.length) errors.push(`roster root에 알 수 없는 field가 있습니다: ${extraRootKeys.join(", ")}`);
  if (isRecord(value.cities)) {
    const extraCityKeys = Object.keys(value.cities).filter((key) => !["capitals", "cityStates"].includes(key));
    if (extraCityKeys.length) errors.push(`cities에 알 수 없는 field가 있습니다: ${extraCityKeys.join(", ")}`);
  }

  const actualRoles = Object.keys(greatPeople);
  if (!sameMembers(actualRoles, rosterGreatPersonRoles)) {
    errors.push(`greatPeople role은 정확히 ${rosterGreatPersonRoles.join(", ")}여야 합니다.`);
  }

  type Collection = {
    label: string;
    namespace: string;
    items: unknown[];
    scopes: readonly RosterScope[];
    availabilities: readonly RosterAvailability[];
    kind?: GreatPersonKind;
  };

  const collections: Collection[] = [
    {
      label: "leaders",
      namespace: "leader",
      items: leaders,
      scopes: ["core", "bonus"],
      availabilities: ["active"],
    },
    {
      label: "civilizations",
      namespace: "civilization",
      items: civilizations,
      scopes: ["core"],
      availabilities: ["active"],
    },
    {
      label: "cities.capitals",
      namespace: "capital",
      items: capitals,
      scopes: ["core"],
      availabilities: ["active"],
    },
    {
      label: "cities.cityStates",
      namespace: "city-state",
      items: cityStates,
      scopes: ["core"],
      availabilities: ["active", "legacy"],
    },
    ...rosterGreatPersonRoles.map((role) => ({
      label: `greatPeople.${role}`,
      namespace: `great-person:${role}`,
      items: Array.isArray(greatPeople[role]) ? greatPeople[role] as unknown[] : [],
      scopes: ["core"] as const,
      availabilities: ["active", "legacy"] as const,
      kind: expectedGreatPeopleCounts[role].kind,
    })),
  ];

  const ids = new Map<string, string>();
  const slugNames = new Map<string, { normalizedName: string; location: string }>();
  for (const collection of collections) {
    const rosterLabels = new Map<string, string>();
    const matchKeys = new Map<string, string>();
    collection.items.forEach((item, index) => {
      const location = `${collection.label}[${index}]`;
      if (!isRecord(item)) {
        errors.push(`${location}은 object여야 합니다.`);
        return;
      }

      const allowedKeys = [
        "id",
        "name",
        "rosterLabel",
        "slug",
        "scope",
        "availability",
        "aliases",
        "replacedBy",
        ...(collection.kind ? ["kind"] : []),
      ];
      const extraKeys = Object.keys(item).filter((key) => !allowedKeys.includes(key));
      if (extraKeys.length) errors.push(`${location}에 알 수 없는 field가 있습니다: ${extraKeys.join(", ")}`);

      for (const field of ["id", "name", "rosterLabel", "slug", "scope", "availability"] as const) {
        if (typeof item[field] !== "string" || !item[field].trim()) errors.push(`${location}.${field}가 비어 있습니다.`);
      }
      if (typeof item.scope === "string" && !collection.scopes.includes(item.scope as RosterScope)) {
        errors.push(`${location}.scope ${item.scope}는 이 collection에 허용되지 않습니다.`);
      }
      if (
        typeof item.availability === "string" &&
        !collection.availabilities.includes(item.availability as RosterAvailability)
      ) {
        errors.push(`${location}.availability ${item.availability}는 이 collection에 허용되지 않습니다.`);
      }
      if (typeof item.name === "string" && typeof item.slug === "string") {
        const expectedSlug = slugifyRosterName(item.name);
        if (item.slug !== expectedSlug) errors.push(`${location}.slug는 ${expectedSlug}여야 합니다.`);
      }
      if (typeof item.slug === "string" && typeof item.id === "string") {
        const expectedId = `${collection.namespace}:${item.slug}`;
        if (item.id !== expectedId) errors.push(`${location}.id는 ${expectedId}여야 합니다.`);
      }
      if (typeof item.id === "string") {
        const firstLocation = ids.get(item.id);
        if (firstLocation) errors.push(`${location}.id가 ${firstLocation}과 중복됩니다: ${item.id}`);
        else ids.set(item.id, location);
      }
      if (typeof item.rosterLabel === "string") {
        const normalizedLabel = normalizeRosterText(item.rosterLabel);
        if (!normalizedLabel) errors.push(`${location}.rosterLabel을 정규화할 수 없습니다.`);
        const firstLocation = rosterLabels.get(normalizedLabel);
        if (firstLocation) {
          errors.push(`${location}.rosterLabel이 ${firstLocation}과 중복됩니다: ${item.rosterLabel}`);
        } else {
          rosterLabels.set(normalizedLabel, location);
        }
      }
      if (typeof item.slug === "string" && typeof item.name === "string") {
        const previous = slugNames.get(item.slug);
        const normalizedName = normalizeRosterText(item.name);
        if (previous && previous.normalizedName !== normalizedName) {
          errors.push(`${location}.slug가 다른 이름인 ${previous.location}과 충돌합니다: ${item.slug}`);
        } else if (!previous) {
          slugNames.set(item.slug, { normalizedName, location });
        }
      }

      if (item.aliases !== undefined) {
        if (!Array.isArray(item.aliases) || item.aliases.some((alias) => typeof alias !== "string" || !alias.trim())) {
          errors.push(`${location}.aliases는 비어 있지 않은 string array여야 합니다.`);
        } else if (new Set(item.aliases).size !== item.aliases.length) {
          errors.push(`${location}.aliases에 중복이 있습니다.`);
        }
      }
      const itemMatchKeys = new Set(
        [item.name, item.rosterLabel, ...(Array.isArray(item.aliases) ? item.aliases : [])]
          .filter((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim()))
          .map(normalizeRosterMatch)
          .filter(Boolean),
      );
      for (const key of itemMatchKeys) {
        const firstLocation = matchKeys.get(key);
        if (firstLocation) {
          errors.push(`${location}의 name/rosterLabel/alias가 ${firstLocation}과 coverage match 충돌합니다: ${key}`);
        } else {
          matchKeys.set(key, location);
        }
      }
      if (item.replacedBy !== undefined && (typeof item.replacedBy !== "string" || !item.replacedBy.trim())) {
        errors.push(`${location}.replacedBy는 비어 있지 않은 string이어야 합니다.`);
      }
      if (
        item.replacedBy !== undefined &&
        (collection.label !== "greatPeople.generals" || item.availability !== "legacy")
      ) {
        errors.push(`${location}.replacedBy는 legacy Great General에만 사용합니다.`);
      }
      if (collection.kind && item.kind !== collection.kind) {
        errors.push(`${location}.kind는 ${collection.kind}여야 합니다.`);
      }
      if (!collection.kind && item.kind !== undefined) errors.push(`${location}.kind는 Great Person에만 사용합니다.`);
    });
  }
  for (const collection of collections) {
    collection.items.filter(isRecord).forEach((item, index) => {
      if (typeof item.replacedBy === "string" && !ids.has(item.replacedBy)) {
        errors.push(`${collection.label}[${index}].replacedBy가 존재하지 않는 id를 가리킵니다: ${item.replacedBy}`);
      }
    });
  }

  if (leaders.length !== 67) errors.push(`leaders는 67명이어야 합니다: ${leaders.length}`);
  const coreLeaders = leaders.filter((item) => isRecord(item) && item.scope === "core");
  const bonusLeaders = leaders.filter((item) => isRecord(item) && item.scope === "bonus");
  if (coreLeaders.length !== 66) errors.push(`core leader는 66명이어야 합니다: ${coreLeaders.length}`);
  if (bonusLeaders.length !== 1 || !isRecord(bonusLeaders[0]) || bonusLeaders[0].name !== "Julius Caesar") {
    errors.push("bonus leader는 Julius Caesar 1명이어야 합니다.");
  }

  if (civilizations.length !== 50) errors.push(`civilizations는 50개여야 합니다: ${civilizations.length}`);
  const civilizationPairs = civilizations
    .filter(isRecord)
    .map((item) => `${String(item.rosterLabel)}\u0000${String(item.name)}`);
  const expectedCivilizationPairs = Object.entries(civilizationNamesByRosterLabel)
    .map(([rosterLabel, name]) => `${rosterLabel}\u0000${name}`);
  if (!sameMembers(civilizationPairs, expectedCivilizationPairs)) {
    errors.push("civilization rosterLabel→canonical name 매핑이 기준 목록과 다릅니다.");
  }
  for (const item of civilizations.filter(isRecord)) {
    const expectedAlias = `${String(item.rosterLabel)} Civilization`;
    if (!Array.isArray(item.aliases) || !item.aliases.includes(expectedAlias)) {
      errors.push(`civilization ${String(item.name)}에 alias "${expectedAlias}"가 없습니다.`);
    }
  }

  if (capitals.length !== 61) errors.push(`active capital은 61개여야 합니다: ${capitals.length}`);
  if (cityStates.length !== 58) errors.push(`city-state 광의 목록은 58개여야 합니다: ${cityStates.length}`);
  const legacyCityStates = cityStates
    .filter((item) => isRecord(item) && item.availability === "legacy")
    .map((item) => String(item.name));
  if (!sameMembers(legacyCityStates, legacyCityStateNames)) {
    errors.push(`legacy city-state는 정확히 ${legacyCityStateNames.join(", ")}여야 합니다.`);
  }
  const activeCityStateCount = cityStates
    .filter((item) => isRecord(item) && item.availability === "active")
    .length;
  if (activeCityStateCount !== 48) errors.push(`active city-state는 48개여야 합니다: ${activeCityStateCount}`);

  let activeStandard = 0;
  let activeSpecial = 0;
  let legacyStandard = 0;
  for (const role of rosterGreatPersonRoles) {
    const items = Array.isArray(greatPeople[role]) ? greatPeople[role] as unknown[] : [];
    const expected = expectedGreatPeopleCounts[role];
    const active = items.filter((item) => isRecord(item) && item.availability === "active");
    const legacy = items.filter((item) => isRecord(item) && item.availability === "legacy");
    if (active.length !== expected.active) {
      errors.push(`greatPeople.${role} active는 ${expected.active}명이어야 합니다: ${active.length}`);
    }
    if (legacy.length !== expected.legacy) {
      errors.push(`greatPeople.${role} legacy는 ${expected.legacy}명이어야 합니다: ${legacy.length}`);
    }
    if (expected.kind === "standard") {
      activeStandard += active.length;
      legacyStandard += legacy.length;
    } else {
      activeSpecial += active.length;
    }
  }
  if (activeStandard !== 202) errors.push(`active standard Great People은 202명이어야 합니다: ${activeStandard}`);
  if (activeSpecial !== 10) errors.push(`active special Great People은 10명이어야 합니다: ${activeSpecial}`);
  if (legacyStandard !== 3) errors.push(`legacy standard Great People은 3명이어야 합니다: ${legacyStandard}`);

  const generals = Array.isArray(greatPeople.generals) ? greatPeople.generals.filter(isRecord) : [];
  for (const [legacyName, replacementName] of Object.entries(legacyGreatGeneralReplacements)) {
    const legacy = generals.find((item) => item.name === legacyName);
    const replacement = generals.find((item) => item.name === replacementName);
    const expectedReplacementId = replacement?.id;
    if (!legacy || legacy.availability !== "legacy") errors.push(`${legacyName}은 legacy Great General이어야 합니다.`);
    if (!replacement || replacement.availability !== "active") {
      errors.push(`${replacementName}은 active replacement Great General이어야 합니다.`);
    }
    if (!expectedReplacementId || legacy?.replacedBy !== expectedReplacementId) {
      errors.push(`${legacyName}.replacedBy는 ${replacementName}의 id여야 합니다.`);
    }
  }
  for (const item of generals) {
    if (item.availability !== "legacy" && item.replacedBy !== undefined) {
      errors.push(`${String(item.name)}은 active이므로 replacedBy를 가질 수 없습니다.`);
    }
  }

  return errors;
}

export function assertRosterSnapshot(value: unknown): asserts value is RosterSnapshot {
  const errors = validateRosterSnapshot(value);
  if (errors.length) throw new Error(`roster validation failed:\n- ${errors.join("\n- ")}`);
}

export function loadRosterSnapshot() {
  if (!fs.existsSync(rosterPath)) {
    throw new Error("docs/catalog/civ6-roster.json이 없습니다. npm run roster:sync를 실행하세요.");
  }
  const value: unknown = JSON.parse(fs.readFileSync(rosterPath, "utf8"));
  assertRosterSnapshot(value);
  return value;
}
