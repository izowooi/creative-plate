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
        self.assertEqual(args.double_tap, "ctrl")

    def test_rejects_invalid_values(self):
        for argv in (["-n", "0"], ["-i", "-1"], ["--key", "1"]):
            with self.assertRaises(SystemExit):
                macro_arrow.parse_args(argv)


class DoubleTapDetectorTest(unittest.TestCase):
    def tap(self, d, at, hold=0.05):
        d.on_modifiers(True, False, at)
        return d.on_modifiers(False, False, at + hold)

    def test_two_quick_taps_trigger(self):
        d = macro_arrow.DoubleTapDetector()
        self.assertFalse(self.tap(d, 0.0))
        self.assertTrue(self.tap(d, 0.2))
        self.assertFalse(self.tap(d, 0.4))  # 세 번째 탭은 새 시퀀스의 첫 탭

    def test_slow_second_tap_does_not_trigger(self):
        d = macro_arrow.DoubleTapDetector()
        self.tap(d, 0.0)
        self.assertFalse(self.tap(d, 1.0))

    def test_long_hold_is_not_a_tap(self):
        d = macro_arrow.DoubleTapDetector()
        self.tap(d, 0.0)
        self.assertFalse(self.tap(d, 0.2, hold=0.5))

    def test_key_between_taps_cancels(self):
        d = macro_arrow.DoubleTapDetector()
        self.tap(d, 0.0)
        d.on_key()
        self.assertFalse(self.tap(d, 0.2))

    def test_shortcut_with_modifier_is_not_a_tap(self):
        d = macro_arrow.DoubleTapDetector()
        self.tap(d, 0.0)
        d.on_modifiers(True, False, 0.2)
        d.on_key()  # 예: ⌃C
        self.assertFalse(d.on_modifiers(False, False, 0.25))

    def test_other_modifier_cancels(self):
        d = macro_arrow.DoubleTapDetector()
        self.tap(d, 0.0)
        d.on_modifiers(True, True, 0.2)
        self.assertFalse(d.on_modifiers(False, False, 0.25))


if __name__ == "__main__":
    unittest.main()
