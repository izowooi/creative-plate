"""사용자 입력(저장 폴더, URL 목록)을 디스크에 영속화한다.

저장 위치: ~/.missav-dl/state.json
스키마:
    {
        "urls_text": "<text>",
        "save_dir":  "<path>"
    }
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import TypedDict

DEFAULT_STATE_PATH = Path.home() / ".missav-dl" / "state.json"


class PersistedState(TypedDict, total=False):
    urls_text: str
    save_dir: str


def load_state(path: Path = DEFAULT_STATE_PATH) -> PersistedState:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    out: PersistedState = {}
    if isinstance(data.get("urls_text"), str):
        out["urls_text"] = data["urls_text"]
    if isinstance(data.get("save_dir"), str):
        out["save_dir"] = data["save_dir"]
    return out


def save_state(state: PersistedState, path: Path = DEFAULT_STATE_PATH) -> None:
    """디스크에 best-effort 로 저장한다. 실패해도 예외를 던지지 않는다."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        pass
