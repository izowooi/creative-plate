import tempfile
import threading
import unittest
from pathlib import Path

import macro_arrow


class RunMacroTest(unittest.TestCase):
    def test_alternates_capture_and_press_for_count(self):
        events = []
        with tempfile.TemporaryDirectory() as tmp:
            saved = macro_arrow.run_macro(
                3, 0, Path(tmp),
                capture=lambda p: events.append(("capture", p.name)),
                press=lambda: events.append(("press",)),
            )
        self.assertEqual(events, [
            ("capture", "shot_001.png"), ("press",),
            ("capture", "shot_002.png"), ("press",),
            ("capture", "shot_003.png"), ("press",),
        ])
        self.assertEqual(len(saved), 3)

    def test_stops_when_event_set(self):
        stop = threading.Event()
        presses = []

        def press():
            presses.append(1)
            if len(presses) == 2:
                stop.set()

        with tempfile.TemporaryDirectory() as tmp:
            saved = macro_arrow.run_macro(10, 0, Path(tmp), capture=lambda p: None, press=press, stop=stop)
        self.assertEqual(len(saved), 2)

    def test_defaults(self):
        args = macro_arrow.parse_args([])
        self.assertEqual(args.count, 80)
        self.assertEqual(args.interval, 0.1)
        self.assertEqual(args.key, "m")

    def test_rejects_invalid_values(self):
        for argv in (["-n", "0"], ["-i", "-1"], ["--key", "1"]):
            with self.assertRaises(SystemExit):
                macro_arrow.parse_args(argv)


if __name__ == "__main__":
    unittest.main()
