import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
import io

from novel import Novel, ROOT, main, read, write


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / "story", self.root / "story")
        shutil.copytree(ROOT / "prompts", self.root / "prompts")
        self.novel = Novel(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def ready(self, name="one"):
        run = self.novel.start(name, "검증용 요청: 잃어버린 편지")
        for key, value in {"draft": "주인공은 편지를 돌려주었다.",
                           "review": "verdict: PASS\n편지 반환과 다음 상태를 대조함.",
                           "summary": "편지를 반환했다. 출처: 첫 문장.",
                           "state": "현재: 편지 반환 완료. 열린 약속: 답장을 기다림."}.items():
            write(run / f"{key}.md", value)
        return run

    def test_full_cycle_recalls_and_canon_promotion(self):
        run = self.ready()
        write(run / "updates/hero.md", "# 주인공\n편지를 반환한 사실. 출처: 1화.")
        final = self.novel.approve("one", "테스트 작가 승인")
        self.assertTrue((final / "release.json").exists())
        self.novel.verify()
        next_run = self.novel.start("two", "다음 날의 답장", recalls=[1])
        context = read(next_run / "context.md")
        self.assertIn("편지를 반환한 사실", context)
        self.assertIn("답장을 기다림", context)
        self.assertIn("직전 확정 원고", context)
        self.assertNotIn("이름 미정", context.split("# Lore: hero\n")[1].split("# Lore:")[0])

    def test_unfinished_and_failed_review_cannot_publish(self):
        run = self.novel.start("one", "요청")
        with self.assertRaises(ValueError):
            self.novel.approve("one", "승인")
        self.assertEqual([], self.novel.releases())
        other = self.ready("two")
        write(other / "review.md", "verdict: REVISE\n시점 누출")
        with self.assertRaises(ValueError):
            self.novel.approve("two", "승인")

    def test_stale_parallel_draft_is_blocked(self):
        self.ready("one")
        self.ready("two")
        self.novel.approve("one", "승인")
        with self.assertRaisesRegex(ValueError, "정사/상태"):
            self.novel.approve("two", "승인")

    def test_tamper_detection_and_duplicate_approval(self):
        self.ready()
        final = self.novel.approve("one", "승인")
        with self.assertRaises(ValueError):
            self.novel.approve("one", "승인")
        write(final / "manuscript.md", "변조")
        with self.assertRaisesRegex(ValueError, "변경 감지"):
            self.novel.verify()

    def test_budget_fails_without_partial_run(self):
        with self.assertRaisesRegex(ValueError, "budget"):
            self.novel.start("one", "요청", budget=20)
        self.assertFalse((self.novel.runs / "one").exists())

    def test_ids_and_paths(self):
        for value in ("../escape", "a/b", "", "UPPER"):
            with self.assertRaises(ValueError):
                self.novel.start(value, "요청")
        index = self.root / "story/index.json"
        data = json.loads(read(index))
        data[0]["path"] = "../../outside.md"
        write(index, json.dumps(data))
        with self.assertRaisesRegex(ValueError, "story 내부"):
            self.novel.canon()

    def test_dependencies_and_unknown_recall(self):
        index = self.root / "story/index.json"
        data = json.loads(read(index))
        data += [{"id": "city", "path": "city.md", "requires": ["forest"]},
                 {"id": "forest", "path": "forest.md", "requires": ["city"]}]
        write(index, json.dumps(data))
        write(self.root / "story/city.md", "상업도시")
        write(self.root / "story/forest.md", "숲")
        run = self.novel.start("one", "요청", selected=["city"])
        self.assertIn("forest", json.loads(read(run / "manifest.json"))["selected"])
        with self.assertRaises(ValueError):
            self.novel.start("two", "요청", recalls=[999])

    def test_context_and_base_edit_block_publish(self):
        run = self.ready()
        write(run / "context.md", "변조된 문맥")
        with self.assertRaisesRegex(ValueError, "context"):
            self.novel.approve("one", "승인")
        self.ready("two")
        write(self.root / "story/state.md", "변경된 초기 상태")
        with self.assertRaisesRegex(ValueError, "정사/상태"):
            self.novel.approve("two", "승인")

    def test_unknown_update_and_duplicate_start(self):
        run = self.ready()
        write(run / "updates/unknown.md", "알 수 없는 정사")
        with self.assertRaisesRegex(ValueError, "index"):
            self.novel.approve("one", "승인")
        with self.assertRaises(ValueError):
            self.novel.start("one", "또 다른 요청")

    def test_large_irrelevant_lore_is_not_in_context(self):
        index = self.root / "story/index.json"
        data = json.loads(read(index))
        data.append({"id": "archive", "path": "archive.md", "keywords": ["먼대륙"]})
        write(index, json.dumps(data))
        write(self.root / "story/archive.md", "아주오래된먼대륙의역사\n" * 100000)
        run = self.novel.start("one", "오늘 마을 이야기")
        self.assertLess(len(read(run / "context.md").encode()), 60000)
        self.assertNotIn("아주오래된", read(run / "context.md"))
        with self.assertRaisesRegex(ValueError, "budget"):
            self.novel.start("two", "먼대륙 탐험")

    def test_init_is_private_and_cannot_overwrite(self):
        self.assertEqual(0, main(["--root", str(self.root), "init"]))
        private = self.root / "local/story/state.md"
        write(private, "개인 설정")
        self.assertEqual("개인 설정", Novel(self.root).state())
        self.assertEqual(1, main(["--root", str(self.root), "init"]))
        self.assertEqual("개인 설정", read(private))

    def test_final_added_file_is_detected(self):
        self.ready()
        final = self.novel.approve("one", "승인")
        write(final / "updates/world.md", "임의 추가")
        with self.assertRaisesRegex(ValueError, "파일 목록"):
            self.novel.verify()

    def test_failed_publish_does_not_advance_head(self):
        self.ready()
        with patch("novel.write", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.novel.approve("one", "승인")
        self.assertEqual([], self.novel.releases())
        self.novel.approve("one", "승인")
        self.novel.verify()

    def test_journal_keeps_request_and_response(self):
        request = self.root / "request.md"
        response = self.root / "response.md"
        write(request, "내일은 편지 이야기를 써 줘.")
        write(response, "초안을 작성했고 작가의 퇴고를 기다린다.")
        with redirect_stdout(io.StringIO()):
            for _ in range(2):
                self.assertEqual(0, main(["--root", str(self.root), "log", "--request-file",
                                        str(request), "--response-file", str(response)]))
        logs = list((self.root / "local/journal").glob("*.md"))
        self.assertEqual(2, len(logs))
        self.assertIn(read(request), read(logs[0]))
        self.assertIn(read(response), read(logs[0]))

    def test_old_summary_search_and_explicit_recall(self):
        first = self.ready("one")
        write(first / "summary.md", "오래된 은빛목걸이 약속. 첫 문장 근거.")
        self.novel.approve("one", "승인")
        self.ready("two")
        self.novel.approve("two", "승인")
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(0, main(["--root", str(self.root), "search", "은빛목걸이"]))
        self.assertIn("episode 1", output.getvalue())
        run = self.novel.start("three", "약속의 회수", recalls=[1])
        self.assertIn("은빛목걸이", read(run / "context.md"))


if __name__ == "__main__":
    unittest.main()
