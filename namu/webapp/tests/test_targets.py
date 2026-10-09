import pytest

from namu_crawler.targets import parse_entry, parse_targets, title_to_url


def test_percent_encoded_url():
    t = parse_entry("https://namu.wiki/w/%EC%A0%84%EC%83%9D%EA%B2%80%EC%8B%A0")
    assert t.title == "전생검신"
    assert t.url == "https://namu.wiki/w/%EC%A0%84%EC%83%9D%EA%B2%80%EC%8B%A0"


def test_raw_korean_url_and_subdocument():
    assert parse_entry("https://namu.wiki/w/전생검신/등장인물").title == "전생검신/등장인물"


def test_fragment_and_query_are_dropped():
    assert parse_entry("https://namu.wiki/w/전생검신?from=전검#개요").title == "전생검신"


def test_schemeless_and_mobile_host():
    assert parse_entry("namu.wiki/w/전생검신").title == "전생검신"
    assert parse_entry("https://m.namu.wiki/w/전생검신").title == "전생검신"


def test_bare_title_keeps_special_characters():
    assert parse_entry("리그 오브 레전드").title == "리그 오브 레전드"
    assert parse_entry("C#").title == "C#"
    assert title_to_url("C++") == "https://namu.wiki/w/C%2B%2B"
    assert title_to_url("우리말?") == "https://namu.wiki/w/%EC%9A%B0%EB%A6%AC%EB%A7%90%3F"


def test_encoded_hash_in_url_is_part_of_title():
    assert parse_entry("https://namu.wiki/w/C%23").title == "C#"


@pytest.mark.parametrize("bad", ["https://example.com/w/abc", "https://namu.wiki/RecentChanges",
                                 "https://namu.wiki/w/", "   "])
def test_rejects_unsupported(bad):
    with pytest.raises(ValueError):
        parse_entry(bad)


def test_parse_targets_dedup_and_errors():
    text = """
    https://namu.wiki/w/전생검신
    전생검신

    https://example.com/x
    리그 오브 레전드
    """
    targets, errors = parse_targets(text)
    assert [t.title for t in targets] == ["전생검신", "리그 오브 레전드"]
    assert len(errors) == 1 and "example.com" in errors[0][0]


def test_several_urls_on_one_line():
    targets, _ = parse_targets("https://namu.wiki/w/가 https://namu.wiki/w/나")
    assert [t.title for t in targets] == ["가", "나"]
