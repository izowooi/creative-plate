import test from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS, TYPES, PROFILES } from "../src/content.js";
import { scoreAnswers, adjacentTypes } from "../src/scoring.js";

const responses = (endorsement) =>
  Object.fromEntries(
    QUESTIONS.map((question) => {
      const value = endorsement(question.type, question);
      return [question.id, question.reverse ? 6 - value : value];
    }),
  );

test("54 stable original items, six per type, one reverse item each", () => {
  assert.equal(QUESTIONS.length, 54);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 54);
  for (const type of TYPES) {
    assert.equal(QUESTIONS.filter((q) => q.type === type.id).length, 6);
    assert.equal(
      QUESTIONS.filter((q) => q.type === type.id && q.reverse).length,
      1,
    );
  }
});

test("exactly 27 reusable profiles and only adjacent wings", () => {
  assert.equal(PROFILES.length, 27);
  assert.equal(new Set(PROFILES.map((p) => p.key)).size, 27);
  for (const profile of PROFILES) {
    assert.equal(
      profile.key,
      `${profile.type}${profile.wing ? `w${profile.wing}` : ""}`,
    );
    if (profile.wing)
      assert.ok(adjacentTypes(profile.type).includes(profile.wing));
    assert.ok(profile.advice.length >= 3);
  }
});

test("all equally endorsed profiles stay balanced without inventing a type", () => {
  for (const value of [1, 2, 3, 4, 5]) {
    const result = scoreAnswers(responses(() => value));
    assert.deepEqual(result.scores, Array(9).fill((value - 1) * 25));
    assert.equal(result.primary, null);
    assert.equal(result.profileKey, null);
    assert.equal(result.confidence, "balanced");
    assert.deepEqual(result.tiedTypes, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
});

test("reverse item is normalized and contributes equal weight", () => {
  const answers = responses(() => 1);
  answers.q46 = 1; // type 1 reversed: scored 5, with the other five scored 1.
  assert.equal(scoreAnswers(answers).scores[0], 16.7);
});

test("each type wins appropriately with correct wraparound wings", () => {
  for (let type = 1; type <= 9; type += 1) {
    for (const wing of adjacentTypes(type)) {
      const result = scoreAnswers(
        responses((id) => (id === type ? 5 : id === wing ? 4 : 2)),
      );
      assert.equal(result.primary, type);
      assert.equal(result.wing, wing);
      assert.equal(result.profileKey, `${type}w${wing}`);
      assert.equal(result.confidence, "clear");
      assert.ok(PROFILES.some((profile) => profile.key === result.profileKey));
    }
  }
});

test("a nonadjacent runner-up cannot become a wing", () => {
  const result = scoreAnswers(
    responses((type) => ({ 1: 5, 5: 4, 9: 3, 2: 2 })[type] ?? 1),
  );
  assert.equal(result.primary, 1);
  assert.equal(result.wing, 9);
});

test("equal adjacent scores retain the core profile", () => {
  const result = scoreAnswers(responses((type) => (type === 4 ? 5 : 2)));
  assert.equal(result.wing, null);
  assert.equal(result.profileKey, "4");
});

test("top ties are reported, stable, close, and have no inferred wing", () => {
  const result = scoreAnswers(
    responses((type) => ([3, 6].includes(type) ? 5 : 2)),
  );
  assert.equal(result.primary, 3);
  assert.deepEqual(result.tiedTypes, [3, 6]);
  assert.equal(result.confidence, "close");
  assert.equal(result.wing, null);
});

test("small score spread does not overstate a type", () => {
  const answers = responses(() => 3);
  answers.q1 = 4;
  const result = scoreAnswers(answers);
  assert.equal(result.confidence, "balanced");
  assert.equal(result.primary, null);
});

test("narrow top gap reports close without changing ranking", () => {
  const answers = responses((type) => (type === 1 ? 4 : type === 2 ? 4 : 2));
  answers.q1 = 5;
  assert.equal(scoreAnswers(answers).confidence, "close");
});

test("partial, missing, malformed, and unknown answers cannot become a complete result", () => {
  for (const answers of [
    undefined,
    null,
    {},
    { q1: 5, q2: "5", q3: 1.5, q4: 0, q5: 6, q6: NaN, extra: 5 },
  ]) {
    const result = scoreAnswers(answers);
    assert.equal(result.primary, null);
    assert.equal(result.profileKey, null);
    assert.ok(
      result.scores.every(
        (score) => Number.isFinite(score) && score >= 0 && score <= 100,
      ),
    );
  }
  assert.equal(scoreAnswers({ q1: 5, extra: 5 }).answered, 1);
  const almost = responses(() => 5);
  delete almost.q54;
  assert.equal(scoreAnswers(almost).answered, 53);
  assert.equal(scoreAnswers(almost).primary, null);
});
