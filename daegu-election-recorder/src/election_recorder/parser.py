from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from datetime import datetime


@dataclass(frozen=True)
class CandidateResult:
    candidate: str
    party: str
    vote_rate_percent: float
    votes: int


@dataclass(frozen=True)
class ElectionSnapshot:
    collected_at: str
    region: str
    counted_rate_percent: float
    기준시각: str
    first_rank: int
    first_candidate: str
    first_party: str
    first_vote_rate_percent: float
    first_votes: int
    second_rank: int
    second_candidate: str
    second_party: str
    second_vote_rate_percent: float
    second_votes: int
    vote_gap: int

    def to_dict(self) -> dict:
        return asdict(self)


def _to_int(text: str) -> int:
    return int(re.sub(r"[^0-9]", "", text))


def _to_float(text: str) -> float:
    return float(re.sub(r"[^0-9.]", "", text))


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _is_party_like(text: str) -> bool:
    return text == "무소속" or text.endswith(("당", "연합", "힘"))


def _clean_candidate_label(text: str) -> str:
    return re.sub(r"\s*후보$", "", text.strip())


def _is_candidate_noise(line: str) -> bool:
    if not line:
        return True
    if line.upper() == "VS":
        return True
    if re.search(r"개표율|개표현황|기준|표차|^\d+\s*위$", line):
        return True
    if re.search(r"[0-9]+(?:\.[0-9]+)?\s*%", line):
        return True
    if re.search(r"[0-9,]+\s*표", line):
        return True
    return False


def _line_candidate_results(text: str) -> list[CandidateResult]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    marker = re.compile(r"^기호\s*\d+\s*(?:번)?\s*(?P<tail>.*)$")
    results: list[CandidateResult] = []

    for index, line in enumerate(lines):
        match = marker.match(line)
        if not match:
            continue

        block = []
        tail = match.group("tail").strip()
        if tail:
            block.append(tail)
        for next_line in lines[index + 1 :]:
            if marker.match(next_line):
                break
            block.append(next_line)

        block_text = " ".join(block)
        pct = re.search(r"(?P<pct>[0-9]+(?:\.[0-9]+)?)\s*%", block_text)
        votes = re.search(r"(?P<votes>[0-9,]+)\s*표(?!\s*차)", block_text)
        if not pct or not votes:
            continue

        labels = []
        for block_line in block:
            if re.search(r"[0-9]+(?:\.[0-9]+)?\s*%", block_line):
                break
            if not _is_candidate_noise(block_line):
                labels.append(_clean_candidate_label(block_line))

        if len(labels) < 2:
            continue

        candidate, party = labels[0], labels[1]
        if _is_party_like(candidate) and not _is_party_like(party):
            candidate, party = party, candidate
        results.append(
            CandidateResult(
                candidate=candidate,
                party=party,
                vote_rate_percent=_to_float(pct.group("pct")),
                votes=_to_int(votes.group("votes")),
            )
        )

    return results


def _first_match(pattern: str, lines: list[str], start: int) -> tuple[re.Match[str], int] | None:
    compiled = re.compile(pattern)
    for index in range(start, len(lines)):
        match = compiled.search(lines[index])
        if match:
            return match, index
    return None


def _ranked_grouped_candidate_results(text: str) -> list[CandidateResult]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    rank_pattern = re.compile(r"^(?P<rank>[12])위$")
    candidate_meta: dict[int, tuple[str, str, int]] = {}

    for index, line in enumerate(lines):
        rank_match = rank_pattern.match(line)
        if not rank_match:
            continue

        marker = _first_match(r"^기호\s*\d+\s*(?:번)?$", lines, index + 1)
        if not marker:
            continue
        _, marker_index = marker

        labels = []
        party_index = marker_index
        for label_index in range(marker_index + 1, len(lines)):
            label = _clean_candidate_label(lines[label_index])
            if rank_pattern.match(label) or re.match(r"^기호\s*\d+", label):
                break
            if not _is_candidate_noise(label):
                labels.append(label)
                party_index = label_index
            if len(labels) == 2:
                break

        if len(labels) < 2:
            continue

        candidate, party = labels[0], labels[1]
        if _is_party_like(candidate) and not _is_party_like(party):
            candidate, party = party, candidate
        candidate_meta[int(rank_match.group("rank"))] = (candidate, party, party_index)

    if 1 not in candidate_meta or 2 not in candidate_meta:
        return []

    values_start = max(candidate_meta[1][2], candidate_meta[2][2]) + 1
    values_end = len(lines)
    for index in range(values_start, len(lines)):
        if re.match(r"^3위\b", lines[index]) or "선거 개표 정보" in lines[index]:
            values_end = index
            break

    value_lines = lines[values_start:values_end]
    percentages: list[float] = []
    votes: list[int] = []
    for line in value_lines:
        percentages.extend(_to_float(match.group("pct")) for match in re.finditer(r"(?P<pct>[0-9]+(?:\.[0-9]+)?)\s*%", line))
        votes.extend(_to_int(match.group("votes")) for match in re.finditer(r"(?P<votes>[0-9,]+)\s*표(?!\s*차)", line))

    if len(percentages) < 2 or len(votes) < 2:
        return []

    return [
        CandidateResult(
            candidate=candidate_meta[1][0],
            party=candidate_meta[1][1],
            vote_rate_percent=percentages[0],
            votes=votes[0],
        ),
        CandidateResult(
            candidate=candidate_meta[2][0],
            party=candidate_meta[2][1],
            vote_rate_percent=percentages[1],
            votes=votes[1],
        ),
    ]


def _candidate_results(normalized: str) -> list[CandidateResult]:
    candidate_pattern = re.compile(
        r"기호\s*\d+\s*(?:번)?\s+"
        r"(?P<name>[^\s\d%표]+)\s+"
        r"(?P<party>.+?)\s+"
        r"(?:득표율\s*)?"
        r"(?P<pct>[0-9]+(?:\.[0-9]+)?)\s*%\s+"
        r"(?:득표수\s*)?"
        r"(?P<votes>[0-9,]+)\s*표(?!\s*차)"
    )
    results_by_candidate: dict[tuple[str, str], CandidateResult] = {}
    for match in candidate_pattern.finditer(normalized):
        candidate = match.group("name").strip()
        party = match.group("party").strip()
        result = CandidateResult(
            candidate=candidate,
            party=party,
            vote_rate_percent=_to_float(match.group("pct")),
            votes=_to_int(match.group("votes")),
        )
        results_by_candidate[(candidate, party)] = result

    return sorted(
        results_by_candidate.values(),
        key=lambda candidate: (candidate.vote_rate_percent, candidate.votes),
        reverse=True,
    )


def parse_snapshot(text: str, collected_at: str | None = None) -> ElectionSnapshot:
    """Parse visible text from the Naver election result panel.

    Designed for the current Daegu governor screen with top two candidates only,
    while avoiding hard-coded candidate names.
    """
    normalized = _normalize(text)

    header = re.search(
        r"(?P<region>[가-힣A-Za-z·]+)\s*개표율\s*"
        r"(?P<rate>[0-9]+(?:\.[0-9]+)?)\s*%\s*"
        r"(?P<time>[0-9]{1,2}:[0-9]{2})\s*기준",
        normalized,
    )
    if not header:
        raise ValueError("Could not find Daegu counted-rate header")

    candidates = _ranked_grouped_candidate_results(text)
    if not candidates:
        candidates = _line_candidate_results(text)
    if not candidates:
        candidates = _candidate_results(normalized)
    candidates = sorted(candidates, key=lambda candidate: (candidate.vote_rate_percent, candidate.votes), reverse=True)
    if len(candidates) < 2:
        raise ValueError("Could not find top two candidate blocks")

    first, second = candidates[:2]

    gap = re.search(r"(?:(?P<gap_before>[0-9,]+)\s*표\s*차|표\s*차\s*(?P<gap_after>[0-9,]+))", normalized)
    if not gap:
        gap_value = abs(first.votes - second.votes)
    else:
        gap_value = _to_int(gap.group("gap_before") or gap.group("gap_after"))

    return ElectionSnapshot(
        collected_at=collected_at or datetime.now().isoformat(timespec="seconds"),
        region=header.group("region"),
        counted_rate_percent=_to_float(header.group("rate")),
        기준시각=header.group("time"),
        first_rank=1,
        first_candidate=first.candidate,
        first_party=first.party,
        first_vote_rate_percent=first.vote_rate_percent,
        first_votes=first.votes,
        second_rank=2,
        second_candidate=second.candidate,
        second_party=second.party,
        second_vote_rate_percent=second.vote_rate_percent,
        second_votes=second.votes,
        vote_gap=gap_value,
    )
