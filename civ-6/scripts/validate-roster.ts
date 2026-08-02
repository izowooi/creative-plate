import {
  loadRosterSnapshot,
  rosterGreatPersonRoles,
} from "./roster-utils";

function main() {
  const roster = loadRosterSnapshot();
  const coreLeaders = roster.leaders.filter((item) => item.scope === "core").length;
  const bonusLeaders = roster.leaders.filter((item) => item.scope === "bonus").length;
  const activeCityStates = roster.cities.cityStates
    .filter((item) => item.availability === "active").length;
  const legacyCityStates = roster.cities.cityStates
    .filter((item) => item.availability === "legacy").length;
  const greatPeople = rosterGreatPersonRoles.flatMap((role) => roster.greatPeople[role]);
  const activeStandard = greatPeople
    .filter((item) => item.availability === "active" && item.kind === "standard").length;
  const activeSpecial = greatPeople
    .filter((item) => item.availability === "active" && item.kind === "special").length;
  const legacyStandard = greatPeople
    .filter((item) => item.availability === "legacy" && item.kind === "standard").length;

  console.log("Roster schema v2 is valid.");
  console.log(`- leaders: ${coreLeaders} core + ${bonusLeaders} bonus`);
  console.log(`- civilizations: ${roster.civilizations.length} core / active`);
  console.log(`- capitals: ${roster.cities.capitals.length} core / active`);
  console.log(`- city-states: ${activeCityStates} active + ${legacyCityStates} legacy`);
  console.log(
    `- Great People: ${activeStandard} active standard + ${activeSpecial} active special + ` +
    `${legacyStandard} legacy standard`,
  );
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
