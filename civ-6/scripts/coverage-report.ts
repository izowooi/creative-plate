import { loadMarkdownEntries } from "./content-utils";
import {
  loadRosterSnapshot,
  normalizeRosterMatch,
  rosterGreatPersonRoles,
  type GreatPersonKind,
  type RosterAvailability,
  type RosterItem,
  type RosterScope,
} from "./roster-utils";

type CoverageResult = {
  covered: RosterItem[];
  missing: RosterItem[];
};

type CoverageGroup = {
  label: string;
  items: RosterItem[];
  documentNames: string[];
};

function matchesValue(rosterValue: string, documentName: string) {
  const target = normalizeRosterMatch(rosterValue);
  const candidate = normalizeRosterMatch(documentName);
  return target === candidate;
}

function matchesItem(item: RosterItem, documentName: string) {
  return [item.name, item.rosterLabel, ...(item.aliases ?? [])]
    .some((rosterValue) => matchesValue(rosterValue, documentName));
}

function coverage(items: RosterItem[], documentNames: string[]): CoverageResult {
  const covered = items.filter((item) => documentNames.some((name) => matchesItem(item, name)));
  const coveredIds = new Set(covered.map((item) => item.id));
  return { covered, missing: items.filter((item) => !coveredIds.has(item.id)) };
}

function assertDocumentsMapped(groups: CoverageGroup[]) {
  const failures: string[] = [];
  for (const group of groups) {
    const documentsByRosterId = new Map<string, string[]>();
    for (const name of group.documentNames) {
      const matches = group.items.filter((item) => matchesItem(item, name));
      if (matches.length !== 1) {
        const matchIds = matches.map((item) => item.id).join(", ") || "none";
        failures.push(`${group.label}: ${name} (${matches.length} matches: ${matchIds})`);
        continue;
      }
      const names = documentsByRosterId.get(matches[0].id) ?? [];
      names.push(name);
      documentsByRosterId.set(matches[0].id, names);
    }
    for (const [rosterId, names] of documentsByRosterId) {
      if (names.length > 1) {
        failures.push(`${group.label}: ${rosterId}에 Markdown ${names.length}개가 연결됩니다: ${names.join(", ")}`);
      }
    }
  }
  if (failures.length) {
    throw new Error(`roster에 정확히 연결되지 않은 Markdown 표제어가 있습니다:\n- ${failures.join("\n- ")}`);
  }
}

function percent(covered: number, total: number) {
  return total ? `${((covered / total) * 100).toFixed(1)}%` : "0.0%";
}

function groupLabel(
  category: string,
  scope: RosterScope,
  availability: RosterAvailability,
  kind?: GreatPersonKind,
) {
  return `${category} [scope=${scope}, availability=${availability}${kind ? `, kind=${kind}` : ""}]`;
}

function main() {
  const roster = loadRosterSnapshot();
  const entries = loadMarkdownEntries();
  const leaderDocuments = entries
    .filter((entry) => entry.category === "leaders")
    .map((entry) => entry.nameEn);
  const civilizationDocuments = entries
    .filter((entry) => entry.category === "civilizations")
    .map((entry) => entry.nameEn);
  const capitalDocuments = entries
    .filter((entry) => entry.category === "cities" && entry.cityRoles.includes("capital"))
    .map((entry) => entry.nameEn);
  const cityStateDocuments = entries
    .filter((entry) => entry.category === "cities" && entry.cityRoles.includes("city-state"))
    .map((entry) => entry.nameEn);
  const greatPersonDocuments = Object.fromEntries(rosterGreatPersonRoles.map((role) => [
    role,
    entries
      .filter((entry) => entry.category === "great-people" && entry.subcategory === role)
      .map((entry) => entry.nameEn),
  ])) as Record<(typeof rosterGreatPersonRoles)[number], string[]>;

  const coreLeaders = roster.leaders.filter((item) => item.scope === "core");
  const bonusLeaders = roster.leaders.filter((item) => item.scope === "bonus");
  const activeCityStates = roster.cities.cityStates
    .filter((item) => item.availability === "active");
  const legacyCityStates = roster.cities.cityStates
    .filter((item) => item.availability === "legacy");
  const allGreatPeople = rosterGreatPersonRoles.flatMap((role) => roster.greatPeople[role]);
  const activeStandardGreatPeople = allGreatPeople
    .filter((item) => item.availability === "active" && item.kind === "standard");
  const legacyStandardGreatPeople = allGreatPeople
    .filter((item) => item.availability === "legacy" && item.kind === "standard");
  const activeSpecialGreatPeople = allGreatPeople
    .filter((item) => item.availability === "active" && item.kind === "special");
  const allGreatPersonDocumentNames = Object.values(greatPersonDocuments).flat();

  assertDocumentsMapped([
    { label: "leaders", items: roster.leaders, documentNames: leaderDocuments },
    { label: "civilizations", items: roster.civilizations, documentNames: civilizationDocuments },
    {
      label: "capitals",
      items: roster.cities.capitals,
      documentNames: capitalDocuments,
    },
    {
      label: "city-states",
      items: roster.cities.cityStates,
      documentNames: cityStateDocuments,
    },
    ...rosterGreatPersonRoles.map((role) => ({
      label: `Great People / ${role}`,
      items: roster.greatPeople[role],
      documentNames: greatPersonDocuments[role],
    })),
  ]);

  const summaryGroups: CoverageGroup[] = [
    {
      label: groupLabel("leaders", "core", "active"),
      items: coreLeaders,
      documentNames: leaderDocuments,
    },
    {
      label: groupLabel("leaders", "bonus", "active"),
      items: bonusLeaders,
      documentNames: leaderDocuments,
    },
    {
      label: groupLabel("civilizations", "core", "active"),
      items: roster.civilizations,
      documentNames: civilizationDocuments,
    },
    {
      label: groupLabel("capitals", "core", "active"),
      items: roster.cities.capitals,
      documentNames: capitalDocuments,
    },
    {
      label: groupLabel("city-states", "core", "active"),
      items: activeCityStates,
      documentNames: cityStateDocuments,
    },
    {
      label: groupLabel("city-states", "core", "legacy"),
      items: legacyCityStates,
      documentNames: cityStateDocuments,
    },
    {
      label: groupLabel("Great People", "core", "active", "standard"),
      items: activeStandardGreatPeople,
      documentNames: allGreatPersonDocumentNames,
    },
    {
      label: groupLabel("Great People", "core", "legacy", "standard"),
      items: legacyStandardGreatPeople,
      documentNames: allGreatPersonDocumentNames,
    },
    {
      label: groupLabel("Great People", "core", "active", "special"),
      items: activeSpecialGreatPeople,
      documentNames: allGreatPersonDocumentNames,
    },
  ];

  const roleGroups: CoverageGroup[] = rosterGreatPersonRoles.flatMap((role) => {
    const roleItems = roster.greatPeople[role];
    const active = roleItems.filter((item) => item.availability === "active");
    const legacy = roleItems.filter((item) => item.availability === "legacy");
    const kind = roleItems[0]?.kind;
    return [
      {
        label: groupLabel(`Great People / ${role}`, "core", "active", kind),
        items: active,
        documentNames: greatPersonDocuments[role],
      },
      ...(legacy.length ? [{
        label: groupLabel(`Great People / ${role}`, "core" as const, "legacy" as const, kind),
        items: legacy,
        documentNames: greatPersonDocuments[role],
      }] : []),
    ];
  });

  console.log("Civilization VI editorial coverage (roster schema v2)");
  for (const group of summaryGroups) {
    const result = coverage(group.items, group.documentNames);
    console.log(`- ${group.label}: ${result.covered.length}/${group.items.length} (${percent(result.covered.length, group.items.length)})`);
  }
  console.log("Great People coverage by role");
  for (const group of roleGroups) {
    const result = coverage(group.items, group.documentNames);
    console.log(`- ${group.label}: ${result.covered.length}/${group.items.length} (${percent(result.covered.length, group.items.length)})`);
  }

  if (process.argv.includes("--missing")) {
    console.log("\nMissing roster entries by scope and availability");
    for (const group of [...summaryGroups.slice(0, 6), ...roleGroups]) {
      const result = coverage(group.items, group.documentNames);
      console.log(`- ${group.label}: ${result.missing.map((item) => item.name).join(", ") || "(none)"}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
