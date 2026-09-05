#!/usr/bin/env python3
"""Local, provider-independent fiction build records. No network or API keys."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parent


def read(path):
    return path.read_text(encoding="utf-8")


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def identifier(value):
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,79}", value):
        raise ValueError("ID는 영문 소문자·숫자·밑줄·하이픈으로 작성하세요.")
    return value


def nonempty(path):
    value = read(path)
    if not value.strip() or "[작성 필요]" in value:
        raise ValueError(f"작성되지 않은 파일: {path.name}")
    return value


class Novel:
    def __init__(self, root):
        self.root = Path(root)
        self.book = self.root / "local/story" if (self.root / "local/story").exists() else self.root / "story"
        self.runs = self.root / "local/runs"
        self.finals = self.root / "local/final"

    def releases(self):
        result = sorted(self.finals.glob("[0-9]*/release.json"))
        for n, path in enumerate(result, 1):
            if path.parent.name != f"{n:06d}":
                raise ValueError("확정 회차 번호에 공백이 있습니다.")
        return result

    def canon(self):
        records = json.loads(read(self.book / "index.json"))
        values, meta = {}, {}
        for item in records:
            key = identifier(item["id"])
            if key in meta:
                raise ValueError(f"중복 lore ID: {key}")
            path = (self.book / item["path"]).resolve()
            if not path.is_relative_to(self.book.resolve()) or path.suffix != ".md":
                raise ValueError("설정 파일은 story 내부 Markdown이어야 합니다.")
            meta[key] = item
            values[key] = nonempty(path)
        for release in self.releases():
            for path in sorted((release.parent / "updates").glob("*.md")):
                if path.stem not in meta:
                    raise ValueError(f"index.json에 없는 lore: {path.stem}")
                values[path.stem] = nonempty(path)
        for item in records:
            for dep in item.get("requires", []):
                if dep not in meta:
                    raise ValueError(f"존재하지 않는 requires: {dep}")
        return meta, values

    def state(self):
        releases = self.releases()
        return read(releases[-1].parent / "state.md") if releases else read(self.book / "state.md")

    def fingerprint(self):
        meta, values = self.canon()
        return digest(dump({"meta": meta, "canon": values, "state": self.state(),
                            "head": len(self.releases())}))

    def verify(self):
        self.canon()
        for path in self.releases():
            release = json.loads(read(path))
            for name, expected in release["hashes"].items():
                target = (path.parent / name).resolve()
                if not target.is_relative_to(path.parent.resolve()):
                    raise ValueError("잘못된 확정본 경로")
                if digest(read(target)) != expected:
                    raise ValueError(f"확정본 변경 감지: {path.parent.name}/{name}")
            actual = {p.relative_to(path.parent).as_posix() for p in path.parent.rglob("*")
                      if p.is_file() and p.name != "release.json"}
            if actual != set(release["hashes"]):
                raise ValueError("확정본 파일 목록 변경 감지")

    def start(self, run_id, brief, selected=(), recalls=(), budget=60000):
        identifier(run_id)
        self.verify()
        if not brief.strip():
            raise ValueError("집필 요청이 비어 있습니다.")
        if (self.runs / run_id).exists():
            raise ValueError("이미 존재하는 run ID입니다. 새 ID로 재시도하세요.")
        meta, values = self.canon()
        chosen = set(selected) | {k for k, m in meta.items() if m.get("always")}
        # Keyword discovery is a suggestion; explicit IDs and dependency closure are authoritative.
        for key, item in meta.items():
            if any(word.lower() in brief.lower() for word in item.get("keywords", [])):
                chosen.add(key)
        pending = list(chosen)
        while pending:
            key = pending.pop()
            if key not in meta:
                raise ValueError(f"알 수 없는 lore ID: {key}")
            for dep in meta[key].get("requires", []):
                if dep not in chosen:
                    chosen.add(dep)
                    pending.append(dep)
        releases = self.releases()
        episodes = {len(releases)} if releases else set()
        episodes.update(recalls)
        if any(n < 1 or n > len(releases) for n in episodes):
            raise ValueError("존재하지 않는 recall 회차")
        sections = [read(self.root / "prompts/draft.md"), "# 오늘의 요청\n" + brief,
                    "# 현재 확정 상태\n" + self.state()]
        sections += [f"# Lore: {key}\n{values[key]}" for key in sorted(chosen)]
        for n in sorted(episodes):
            sections.append(f"# 확정 회차 {n} 요약\n" + read(releases[n-1].parent / "summary.md"))
        if releases:
            sections.append("# 직전 확정 원고\n" + read(releases[-1].parent / "manuscript.md"))
        packet = "\n\n".join(sections) + "\n"
        size = len(packet.encode("utf-8"))
        if size > budget:
            raise ValueError(f"context {size} bytes > budget {budget}. 관련 lore/recall을 좁히거나 상태를 압축하세요. 자동 절단하지 않습니다.")
        self.runs.mkdir(parents=True, exist_ok=True)
        stage = Path(tempfile.mkdtemp(prefix=".prepare-", dir=self.runs))
        try:
            write(stage / "brief.md", brief)
            write(stage / "context.md", packet)
            write(stage / "manifest.json", dump({"id": run_id, "base": self.fingerprint(),
                  "episode": len(releases)+1, "selected": sorted(chosen), "recalls": sorted(episodes),
                  "context_bytes": size, "budget_bytes": budget, "context_sha256": digest(packet),
                  "brief_sha256": digest(brief), "created_at": datetime.now(timezone.utc).isoformat()}))
            for name in ("draft", "review", "summary", "state"):
                write(stage / f"{name}.md", "[작성 필요]\n")
            (stage / "updates").mkdir()
            stage.rename(self.runs / run_id)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
        return self.runs / run_id

    def approve(self, run_id, approval):
        self.verify()
        run = self.runs / identifier(run_id)
        manifest = json.loads(read(run / "manifest.json"))
        if manifest["base"] != self.fingerprint():
            raise ValueError("준비 이후 정사/상태가 바뀌었습니다. 새 run에서 다시 집필·검토하세요.")
        if digest(read(run / "context.md")) != manifest["context_sha256"] or digest(read(run / "brief.md")) != manifest["brief_sha256"]:
            raise ValueError("원 요청/context가 변경되었습니다. 새 run을 만드세요.")
        if not approval.strip():
            raise ValueError("사용자의 확정 지시 문구가 필요합니다.")
        files = {"manuscript.md": nonempty(run / "draft.md"),
                 "review.md": nonempty(run / "review.md"),
                 "summary.md": nonempty(run / "summary.md"),
                 "state.md": nonempty(run / "state.md"),
                 "brief.md": read(run / "brief.md"), "context.md": read(run / "context.md"),
                 "manifest.json": read(run / "manifest.json"), "approval.md": approval}
        if not files["review.md"].startswith("verdict: PASS\n"):
            raise ValueError("review.md 첫 줄이 verdict: PASS여야 합니다.")
        meta, _ = self.canon()
        for path in sorted((run / "updates").glob("*.md")):
            if path.stem not in meta:
                raise ValueError(f"새 lore는 먼저 index에 등록하고 새 run을 준비하세요: {path.stem}")
            files[f"updates/{path.name}"] = nonempty(path)
        number = len(self.releases()) + 1
        self.finals.mkdir(parents=True, exist_ok=True)
        target = self.finals / f"{number:06d}"
        stage = Path(tempfile.mkdtemp(prefix=".publish-", dir=self.finals))
        try:
            for name, content in files.items():
                write(stage / name, content)
            write(stage / "release.json", dump({"episode": number, "run": run_id,
                  "approved_at": datetime.now(timezone.utc).isoformat(),
                  "hashes": {name: digest(content) for name, content in files.items()}}))
            # A complete nonempty directory appears at once; competing publication cannot replace it.
            stage.rename(target)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
        return target


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check")
    sub.add_parser("status")
    sub.add_parser("init")
    search = sub.add_parser("search")
    search.add_argument("query")
    start = sub.add_parser("start")
    start.add_argument("id")
    start.add_argument("--brief-file", type=Path, required=True)
    start.add_argument("--include", nargs="*", default=[])
    start.add_argument("--recall", nargs="*", type=int, default=[])
    start.add_argument("--budget-bytes", type=int, default=60000)
    approve = sub.add_parser("approve")
    approve.add_argument("id")
    approve.add_argument("--approval", required=True)
    log = sub.add_parser("log")
    log.add_argument("--request-file", type=Path, required=True)
    log.add_argument("--response-file", type=Path, required=True)
    args = parser.parse_args(argv)
    novel = Novel(args.root)
    try:
        if args.command == "init":
            target = args.root / "local/story"
            if target.exists():
                raise ValueError("local/story는 이미 존재합니다. 초기화로 덮어쓰지 않습니다.")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(args.root / "story", target)
            print(target)
        elif args.command == "start":
            print(novel.start(args.id, read(args.brief_file), args.include, args.recall, args.budget_bytes))
        elif args.command == "approve":
            print(novel.approve(args.id, args.approval))
        elif args.command == "log":
            # Caller must redact secrets before giving files to this local-only recorder.
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            path = args.root / "local/journal" / f"{stamp}.md"
            write(path, "# 사용자 요청\n\n" + read(args.request_file) + "\n\n# 응답 요약\n\n" + read(args.response_file))
            print(path)
        elif args.command == "search":
            meta, values = novel.canon()
            for key, value in values.items():
                if args.query.casefold() in (dump(meta[key]) + value).casefold():
                    print(f"lore {key}: {meta[key]['path']}")
            for path in novel.releases():
                if args.query.casefold() in read(path.parent / "summary.md").casefold():
                    print(f"episode {int(path.parent.name)}: {path.parent / 'summary.md'}")
        else:
            novel.verify()
            print(f"OK: 확정 {len(novel.releases())}회 / lore {len(novel.canon()[0])}개")
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
