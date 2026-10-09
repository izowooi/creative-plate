import { QUESTIONS } from "./content.js";

export const adjacentTypes = (type) => [
  type === 1 ? 9 : type - 1,
  type === 9 ? 1 : type + 1,
];

/** Equal weight, reverse-coded 1..5 items mapped to 0..100 endorsement scores.
 * Never claims a statistical probability or diagnostic confidence.
 * Ignore unknown IDs/invalid answers; an incomplete questionnaire has no inferred type.
 */
export function scoreAnswers(answers = {}) {
  const sums = Array(9).fill(0);
  const counts = Array(9).fill(0);
  for (const question of QUESTIONS) {
    const answer = answers?.[question.id];
    if (!Number.isInteger(answer) || answer < 1 || answer > 5) continue;
    sums[question.type - 1] += question.reverse ? 6 - answer : answer;
    counts[question.type - 1] += 1;
  }
  const answered = counts.reduce((sum, count) => sum + count, 0);
  const rawScores = sums.map((sum, index) =>
    counts[index] ? ((sum / counts[index] - 1) / 4) * 100 : 0,
  );
  const scores = rawScores.map((score) => Math.round(score * 10) / 10);
  const empty = {
    scores,
    primary: null,
    wing: null,
    profileKey: null,
    tiedTypes: [],
    confidence: "balanced",
    answered,
  };
  if (answered !== QUESTIONS.length) return empty;

  const max = Math.max(...rawScores);
  const min = Math.min(...rawScores);
  const tiedTypes = rawScores.flatMap((score, index) =>
    Math.abs(score - max) < 1e-9 ? [index + 1] : [],
  );
  // A spread of <= one raw item point (4.17%) does not support a useful ranking.
  if (max - min <= 100 / 24 + 1e-9) return { ...empty, tiedTypes };
  const primary = tiedTypes[0];
  const sorted = [...rawScores].sort((a, b) => b - a);
  const confidence =
    tiedTypes.length > 1 || sorted[0] - sorted[1] < 100 / 12 - 1e-9
      ? "close"
      : "clear";
  const [previous, next] = adjacentTypes(primary);
  // Do not append a wing to an ambiguous core result or when adjacent scores are equal.
  const wing =
    tiedTypes.length > 1 ||
    Math.abs(rawScores[previous - 1] - rawScores[next - 1]) < 1e-9
      ? null
      : rawScores[previous - 1] > rawScores[next - 1]
        ? previous
        : next;
  return {
    scores,
    primary,
    wing,
    profileKey: `${primary}${wing ? `w${wing}` : ""}`,
    tiedTypes,
    confidence,
    answered,
  };
}
