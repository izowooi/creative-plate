import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedGreatPeopleCounts,
  loadRosterSnapshot,
  rosterGreatPersonRoles,
  validateRosterSnapshot,
} from "../scripts/roster-utils";
import { greatPersonRoleMeta, greatPersonRoleValues } from "../src/lib/content";

test("the checked-in Civilization VI roster satisfies schema v2", () => {
  assert.deepEqual(validateRosterSnapshot(loadRosterSnapshot()), []);
});

test("roster aliases cannot ambiguously cover two entries in one collection", () => {
  const roster = structuredClone(loadRosterSnapshot());
  const legacyGeneral = roster.greatPeople.generals.find((item) => item.name === "Ana Nzinga");
  assert.ok(legacyGeneral);
  legacyGeneral.aliases = [...(legacyGeneral.aliases ?? []), "Amina"];

  assert.ok(
    validateRosterSnapshot(roster).some((error) => error.includes("coverage match 충돌")),
  );
});

test("editorial and roster Great Person taxonomies cannot drift", () => {
  assert.deepEqual(greatPersonRoleValues, rosterGreatPersonRoles);
  for (const role of greatPersonRoleValues) {
    assert.equal(greatPersonRoleMeta[role].kind, expectedGreatPeopleCounts[role].kind);
  }
});
