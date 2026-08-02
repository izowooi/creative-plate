import fs from "node:fs";
import path from "node:path";
import {
  assertRosterSnapshot,
  civilizationNamesByRosterLabel,
  expectedGreatPeopleCounts,
  legacyCityStateNames,
  legacyGreatGeneralReplacements,
  makeRosterItem,
  rosterGreatPersonRoles,
  rosterPath,
  rosterSourceUrls,
  slugifyRosterName,
  type GreatPersonRosterItem,
  type RosterGreatPersonRole,
  type RosterSnapshot,
} from "./roster-utils";

const apiUrl = "https://civilization.fandom.com/api.php";
const userAgent = "TheTurnHistoryArchive/0.2 (https://github.com/izowooi/creative-plate)";

const greatPersonPages: Record<RosterGreatPersonRole, string> = {
  artists: "Great Artist (Civ6)",
  writers: "Great Writer (Civ6)",
  musicians: "Great Musician (Civ6)",
  scientists: "Great Scientist (Civ6)",
  engineers: "Great Engineer (Civ6)",
  merchants: "Great Merchant (Civ6)",
  generals: "Great General (Civ6)",
  admirals: "Great Admiral (Civ6)",
  prophets: "Great Prophet (Civ6)",
  comandantes: "Comandante General (Civ6)",
};

const leaderAliases: Record<string, string[]> = {
  Alexander: ["Alexander the Great"],
  "Catherine de Medici": ["Catherine de' Medici"],
  Chandragupta: ["Chandragupta Maurya"],
  Cleopatra: ["Cleopatra VII"],
  Cyrus: ["Cyrus II", "Cyrus the Great"],
  Gandhi: ["Mahatma Gandhi"],
  Montezuma: ["Montezuma I"],
  Peter: ["Peter the Great"],
  Seondeok: ["Queen Seondeok"],
  "Teddy Roosevelt": ["Theodore Roosevelt"],
  Tokugawa: ["Tokugawa Ieyasu"],
  Victoria: ["Queen Victoria"],
};

const capitalAliases: Record<string, string[]> = {
  "St. Petersburg": ["Saint Petersburg"],
  Thebes: ["Thebes, Egypt"],
  Washington: ["Washington, D.C."],
};

const greatPersonAliases: Record<string, string[]> = {
  "Emilie du Chatelet": ["Émilie du Châtelet"],
  "Janaki Ammal": ["E. K. Janaki Ammal"],
  "Karel Capek": ["Karel Čapek"],
  "O no Yasumaro": ["Ō no Yasumaro"],
  "Togo Heihachiro": ["Tōgō Heihachirō"],
  "Yatsuhashi Kengyo": ["Yatsuhashi Kengyō"],
};

async function fetchWikiText(page: string) {
  const url = new URL(apiUrl);
  url.search = new URLSearchParams({
    action: "parse",
    page,
    prop: "wikitext",
    format: "json",
    origin: "*",
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": userAgent, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${page}: MediaWiki API ${response.status}`);
  const payload = await response.json() as {
    error?: { info?: string };
    parse?: { title?: string; wikitext?: { "*"?: string } };
  };
  const wikitext = payload.parse?.wikitext?.["*"];
  if (!wikitext) throw new Error(`${page}: ${payload.error?.info ?? "wikitext가 없습니다."}`);
  if (payload.parse?.title !== page) {
    throw new Error(`${page}: 예상하지 못한 page title ${payload.parse?.title ?? "(missing)"}`);
  }
  return wikitext;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseLeaders(wikitext: string) {
  if (!wikitext.includes("{{Civ6Nav}}") || !wikitext.includes("SurePageIconLineBreak6")) {
    throw new Error("Leaders (Civ6): 예상한 navigation/template 구조가 없습니다.");
  }
  return unique(
    [...wikitext.matchAll(/\{\{SurePageIconLineBreak6\|([^}|]+)/g)].map((match) => match[1]),
  ).filter((name) => !name.includes(" ("));
}

function firstTemplateName(row: string) {
  const firstCell = row.split("\n").find((line) => /^\|[^-}]/.test(line.trimStart()));
  return firstCell?.match(/\{\{SurePageIconLineBreak6\|([^}|]+)/)?.[1]?.trim() ?? "";
}

function parseCivilizations(wikitext: string) {
  const mainTable = wikitext.match(/<onlyinclude>([\s\S]*?)<\/onlyinclude>/)?.[1];
  if (!mainTable) throw new Error("Civilizations (Civ6): main table을 찾을 수 없습니다.");
  const [playableTable, scenarioSection] = mainTable.split(/\n==\s*Scenario-specific civilizations\s*==/);
  if (!scenarioSection) throw new Error("Civilizations (Civ6): scenario 경계를 찾을 수 없습니다.");
  return unique(
    playableTable
      .split(/\n\|-\s*\n/)
      .slice(1)
      .filter((row) => row.split("\n").filter((line) => /^\|[^-}]/.test(line.trimStart())).length >= 4)
      .map(firstTemplateName),
  );
}

function parseLinkedName(cell: string) {
  const template = cell.match(/\{\{(?:Link6|SurePageIconLineBreak6)\|([^}|]+)/)?.[1];
  if (template) return template.trim();
  const link = cell.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  return (link?.[2] ?? link?.[1] ?? "").replace(/\s*\(Civ6\)\s*$/, "").trim();
}

function tableRows(wikitext: string, heading: RegExp) {
  const section = wikitext.split(heading)[1]?.split(/\n==\s*[^=]/)[0];
  const table = section?.match(/\{\|[^\n]*\n[\s\S]*?\n\|\}/)?.[0];
  if (!table) throw new Error(`table을 찾을 수 없습니다: ${heading}`);
  return table.split(/\n\|-\s*\n/).slice(1);
}

function parseCapitals(wikitext: string) {
  return unique(tableRows(wikitext, /\n==\s*List of capitals\s*==\n/).map((row) => {
    const cells = row.split("\n").filter((line) => /^\|[^-}]/.test(line.trimStart()));
    return parseLinkedName(cells[1] ?? "");
  }));
}

function parseCityStates(wikitext: string) {
  const [mainSection, scenarioSection] = wikitext.split(/\n==\s*Scenario-specific city-states\s*==/);
  if (!scenarioSection) throw new Error("City-state: scenario 경계를 찾을 수 없습니다.");
  const table = mainSection.match(/<table-progress-tracking[\s\S]*?\n(\{\|[\s\S]*?\n\|\})/)?.[1];
  if (!table) throw new Error("City-state main table을 찾을 수 없습니다.");
  return unique(table.split(/\n\|-\s*\n/).slice(1).map((row) => {
    const cells = row.split("\n").filter((line) => /^\|[^-}]/.test(line.trimStart()));
    return parseLinkedName(cells[1] ?? "");
  }));
}

function parseGreatPeople(wikitext: string, role: RosterGreatPersonRole) {
  const trackedTable = role === "prophets"
    ? wikitext
      .split(/\n==\s*Great Prophets\s*==\n/)[1]
      ?.match(/\{\|[^\n]*\n[\s\S]*?\n\|\}/)?.[0]
    : wikitext
      .match(/<table-progress-tracking[\s\S]*?\n(\{\|[\s\S]*?\n\|\})[\s\S]*?<\/table-progress-tracking>/)?.[1];
  if (!trackedTable) {
    const structure = role === "prophets" ? "Great Prophets section" : "table-progress-tracking";
    throw new Error(`${role}: ${structure}의 main table을 찾을 수 없습니다.`);
  }
  return unique(
    trackedTable
      .split(/\n\|-\s*\n/)
      .slice(1)
      .map((row) => row.split("\n").find((line) => /^\|[^-}]/.test(line.trimStart())) ?? "")
      .map(parseLinkedName),
  );
}

function requireCount(label: string, values: string[], expected: number) {
  if (values.length !== expected) {
    throw new Error(`${label}: ${expected}개를 예상했지만 ${values.length}개를 찾았습니다.`);
  }
}

function requireMembers(label: string, values: string[], expected: readonly string[]) {
  const missing = expected.filter((name) => !values.includes(name));
  const unexpected = values.filter((name) => !expected.includes(name));
  if (missing.length || unexpected.length) {
    throw new Error(
      `${label}: 기준 목록과 다릅니다.` +
      `${missing.length ? ` missing=[${missing.join(", ")}]` : ""}` +
      `${unexpected.length ? ` unexpected=[${unexpected.join(", ")}]` : ""}`,
    );
  }
}

function greatPersonItem(role: RosterGreatPersonRole, rosterLabel: string): GreatPersonRosterItem {
  const legacyReplacement = role === "generals"
    ? legacyGreatGeneralReplacements[rosterLabel as keyof typeof legacyGreatGeneralReplacements]
    : undefined;
  const base = makeRosterItem(
    `great-person:${role}`,
    rosterLabel,
    rosterLabel,
    "core",
    legacyReplacement ? "legacy" : "active",
    {
      aliases: greatPersonAliases[rosterLabel],
      replacedBy: legacyReplacement
        ? `great-person:generals:${slugifyRosterName(legacyReplacement)}`
        : undefined,
    },
  );
  return { ...base, kind: expectedGreatPeopleCounts[role].kind };
}

async function main() {
  const leaderPage = "Leaders (Civ6)";
  const civilizationPage = "Civilizations (Civ6)";
  const capitalPage = "Capital (Civ6)";
  const cityStatePage = "List of city-states in Civ6";
  const [leaderText, civilizationText, capitalText, cityStateText, ...greatPeopleText] = await Promise.all([
    fetchWikiText(leaderPage),
    fetchWikiText(civilizationPage),
    fetchWikiText(capitalPage),
    fetchWikiText(cityStatePage),
    ...rosterGreatPersonRoles.map((role) => fetchWikiText(greatPersonPages[role])),
  ]);

  const leaderNames = parseLeaders(leaderText);
  const civilizationLabels = parseCivilizations(civilizationText);
  const capitalNames = parseCapitals(capitalText);
  const cityStateNames = parseCityStates(cityStateText);
  const greatPersonNames = Object.fromEntries(
    rosterGreatPersonRoles.map((role, index) => [role, parseGreatPeople(greatPeopleText[index], role)]),
  ) as Record<RosterGreatPersonRole, string[]>;

  requireCount("leaders", leaderNames, 67);
  requireMembers("bonus leaders", leaderNames.filter((name) => name === "Julius Caesar"), ["Julius Caesar"]);
  requireMembers("civilizations", civilizationLabels, Object.keys(civilizationNamesByRosterLabel));
  requireCount("capitals", capitalNames, 61);
  requireCount("city-states", cityStateNames, 58);
  requireMembers(
    "legacy city-states",
    cityStateNames.filter((name) => legacyCityStateNames.includes(name as typeof legacyCityStateNames[number])),
    legacyCityStateNames,
  );
  for (const role of rosterGreatPersonRoles) {
    const expected = expectedGreatPeopleCounts[role];
    requireCount(`greatPeople.${role}`, greatPersonNames[role], expected.active + expected.legacy);
  }
  requireMembers(
    "legacy Great Generals",
    greatPersonNames.generals.filter((name) => Object.hasOwn(legacyGreatGeneralReplacements, name)),
    Object.keys(legacyGreatGeneralReplacements),
  );
  requireMembers(
    "Great General replacements",
    greatPersonNames.generals.filter((name) => Object.values(legacyGreatGeneralReplacements).includes(
      name as typeof legacyGreatGeneralReplacements[keyof typeof legacyGreatGeneralReplacements],
    )),
    Object.values(legacyGreatGeneralReplacements),
  );

  const snapshot: RosterSnapshot = {
    schemaVersion: 2,
    checkedAt: new Date().toISOString().slice(0, 10),
    catalogScope: "Civilization VI Anthology and Leader Pass non-scenario rosters, including marked bonus and legacy entries",
    sources: rosterSourceUrls,
    leaders: leaderNames.map((name) => makeRosterItem(
      "leader",
      name,
      name,
      name === "Julius Caesar" ? "bonus" : "core",
      "active",
      { aliases: leaderAliases[name] },
    )),
    civilizations: civilizationLabels.map((rosterLabel) => {
      const name = civilizationNamesByRosterLabel[rosterLabel as keyof typeof civilizationNamesByRosterLabel];
      if (!name) throw new Error(`civilization canonical name이 없습니다: ${rosterLabel}`);
      return makeRosterItem("civilization", name, rosterLabel, "core", "active", {
        aliases: [`${rosterLabel} Civilization`],
      });
    }),
    cities: {
      capitals: capitalNames.map((name) => makeRosterItem(
        "capital",
        name,
        name,
        "core",
        "active",
        { aliases: capitalAliases[name] },
      )),
      cityStates: cityStateNames.map((name) => makeRosterItem(
        "city-state",
        name,
        name,
        "core",
        legacyCityStateNames.includes(name as typeof legacyCityStateNames[number]) ? "legacy" : "active",
      )),
    },
    greatPeople: Object.fromEntries(
      rosterGreatPersonRoles.map((role) => [
        role,
        greatPersonNames[role].map((name) => greatPersonItem(role, name)),
      ]),
    ) as Record<RosterGreatPersonRole, GreatPersonRosterItem[]>,
  };

  assertRosterSnapshot(snapshot);

  fs.mkdirSync(path.dirname(rosterPath), { recursive: true });
  const temporaryPath = `${rosterPath}.next`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    fs.renameSync(temporaryPath, rosterPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }

  const activeStandard = rosterGreatPersonRoles.reduce((total, role) => (
    total + snapshot.greatPeople[role]
      .filter((item) => item.kind === "standard" && item.availability === "active").length
  ), 0);
  const activeSpecial = snapshot.greatPeople.comandantes.length;
  console.log(
    `Synced roster v2: ${snapshot.leaders.length} leaders, ${snapshot.civilizations.length} civilizations, ` +
    `${snapshot.cities.capitals.length} capitals, ${snapshot.cities.cityStates.length} city-states, ` +
    `${activeStandard} active standard + ${activeSpecial} active special Great People.`,
  );
  for (const role of rosterGreatPersonRoles) {
    const active = snapshot.greatPeople[role].filter((item) => item.availability === "active").length;
    const legacy = snapshot.greatPeople[role].filter((item) => item.availability === "legacy").length;
    console.log(`- ${role}: ${active} active${legacy ? ` + ${legacy} legacy` : ""}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
