import json
from pathlib import Path

from state import load_state, save_state


def test_load_returns_empty_when_file_missing(tmp_path: Path):
    assert load_state(tmp_path / "nope.json") == {}


def test_save_then_load_roundtrip(tmp_path: Path):
    p = tmp_path / "state.json"
    save_state(
        {"urls_text": "https://missav.ws/hmn_744\nhttps://missav.ws/hmn_745",
         "save_dir": "/Users/foo/Downloads"},
        p,
    )
    loaded = load_state(p)
    assert loaded["urls_text"].endswith("hmn_745")
    assert loaded["save_dir"] == "/Users/foo/Downloads"


def test_save_creates_parent_dirs(tmp_path: Path):
    p = tmp_path / "deep" / "nested" / "state.json"
    save_state({"save_dir": "/x"}, p)
    assert p.exists()


def test_load_ignores_invalid_json(tmp_path: Path):
    p = tmp_path / "state.json"
    p.write_text("{not json", encoding="utf-8")
    assert load_state(p) == {}


def test_load_ignores_non_dict_root(tmp_path: Path):
    p = tmp_path / "state.json"
    p.write_text(json.dumps(["a", "b"]), encoding="utf-8")
    assert load_state(p) == {}


def test_load_skips_unknown_or_wrong_typed_keys(tmp_path: Path):
    p = tmp_path / "state.json"
    p.write_text(
        json.dumps({"urls_text": 123, "save_dir": "/ok", "extra": "x"}),
        encoding="utf-8",
    )
    loaded = load_state(p)
    assert loaded == {"save_dir": "/ok"}


def test_save_unicode_round_trip(tmp_path: Path):
    p = tmp_path / "state.json"
    save_state({"urls_text": "한글 테스트"}, p)
    assert load_state(p)["urls_text"] == "한글 테스트"
