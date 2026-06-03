import pytest

from election_recorder.parser import parse_snapshot


def test_parse_snapshot_from_visible_text():
    text = """
    대구 개표율 14.18% 22:06 기준
    대구 시·도지사 개표현황
    기호 1 김부겸 더불어민주당 53.45% 98,735표
    14,700표차
    기호 2 추경호 국민의힘 45.49% 84,035표
    """
    s = parse_snapshot(text, collected_at="2026-06-03T22:06:00")
    assert s.region == "대구"
    assert s.counted_rate_percent == 14.18
    assert s.기준시각 == "22:06"
    assert s.first_candidate == "김부겸"
    assert s.first_vote_rate_percent == 53.45
    assert s.first_votes == 98735
    assert s.second_candidate == "추경호"
    assert s.second_vote_rate_percent == 45.49
    assert s.second_votes == 84035
    assert s.vote_gap == 14700


def test_parse_snapshot_generalizes_candidate_names_and_parties():
    text = """
    대구 개표율 64.12% 23:31 기준
    대구 시·도지사 개표현황
    기호 7 홍길동 미래연합 51.25% 312,400표
    25,100표차
    기호 4 이영희 시민의당 47.13% 287,300표
    """
    s = parse_snapshot(text, collected_at="2026-06-03T23:31:00")

    assert s.region == "대구"
    assert s.counted_rate_percent == 64.12
    assert s.기준시각 == "23:31"
    assert s.first_rank == 1
    assert s.first_candidate == "홍길동"
    assert s.first_party == "미래연합"
    assert s.first_vote_rate_percent == 51.25
    assert s.first_votes == 312400
    assert s.second_rank == 2
    assert s.second_candidate == "이영희"
    assert s.second_party == "시민의당"
    assert s.second_vote_rate_percent == 47.13
    assert s.second_votes == 287300
    assert s.vote_gap == 25100


def test_parse_snapshot_handles_realistic_multiline_candidate_cards():
    text = """
    대구 개표율
    19.50%
    22:34 기준
    대구 시·도지사 개표현황
    기호 1번
    김부겸
    더불어민주당
    54.60%
    138,681표
    1위
    VS
    26,085표차
    기호 2번
    추경호
    국민의힘
    44.33%
    112,596표
    2위
    """
    s = parse_snapshot(text, collected_at="2026-06-03T22:34:00")

    assert s.region == "대구"
    assert s.counted_rate_percent == 19.50
    assert s.기준시각 == "22:34"
    assert s.first_candidate == "김부겸"
    assert s.first_party == "더불어민주당"
    assert s.first_vote_rate_percent == 54.60
    assert s.first_votes == 138681
    assert s.second_candidate == "추경호"
    assert s.second_party == "국민의힘"
    assert s.second_vote_rate_percent == 44.33
    assert s.second_votes == 112596
    assert s.vote_gap == 26085


def test_parse_snapshot_handles_actual_naver_inner_text_order():
    text = """
    대구 개표율 20.92 % 22:45 기준
    새로고침
    전국
    대구
    대구 시·도지사 개표현황
    1위
    기호 1
    김부겸
    더불어민주당
    2위
    기호 2
    추경호
    국민의힘
    54.33%
    26,533표차
    44.59%
    148,042표
    121,509표
    3위
    이수찬 기호 4 개혁신당
    2,930표 1.07%
    """
    s = parse_snapshot(text, collected_at="2026-06-03T22:45:00")

    assert s.region == "대구"
    assert s.counted_rate_percent == 20.92
    assert s.기준시각 == "22:45"
    assert s.first_candidate == "김부겸"
    assert s.first_party == "더불어민주당"
    assert s.first_vote_rate_percent == 54.33
    assert s.first_votes == 148042
    assert s.second_candidate == "추경호"
    assert s.second_party == "국민의힘"
    assert s.second_vote_rate_percent == 44.59
    assert s.second_votes == 121509
    assert s.vote_gap == 26533


def test_parse_snapshot_uses_vote_count_gap_when_gap_label_is_missing():
    text = """
    대구 개표율 99.99% 01:05 기준
    기호 3 박첫째 무소속 49.01% 501,111표
    기호 9 최둘째 대한당 48.99% 500,900표
    """
    s = parse_snapshot(text)

    assert s.first_candidate == "박첫째"
    assert s.second_candidate == "최둘째"
    assert s.vote_gap == 211


def test_parse_snapshot_sorts_top_two_by_vote_rate():
    text = """
    대구 개표율 30.00% 22:40 기준
    기호 1 낮은후보 하나당 40.00% 40,000표
    기호 2 높은후보 둘당 55.00% 55,000표
    기호 3 세번째후보 셋당 5.00% 5,000표
    """
    s = parse_snapshot(text)

    assert s.first_candidate == "높은후보"
    assert s.first_vote_rate_percent == 55.00
    assert s.second_candidate == "낮은후보"
    assert s.second_vote_rate_percent == 40.00
    assert s.vote_gap == 15000


def test_parse_snapshot_raises_clear_error_without_two_candidate_blocks():
    text = """
    대구 개표율 14.18% 22:06 기준
    기호 1 김부겸 더불어민주당 53.45% 98,735표
    """

    with pytest.raises(ValueError, match="top two candidate blocks"):
        parse_snapshot(text)
