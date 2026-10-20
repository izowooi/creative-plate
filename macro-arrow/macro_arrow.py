#!/usr/bin/env python3
"""화면 캡처 -> 오른쪽 화살표 키 입력을 정해진 횟수만큼 반복하는 macOS 매크로."""

import argparse
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

RIGHT_ARROW_KEY_CODE = 124
# ANSI 키보드 virtual key code. 한/영 입력 상태나 Option 조합 문자(µ 등)와 무관하게 물리 키로 매칭하기 위해 사용.
LETTER_KEY_CODES = dict(zip("asdfhgzxcv", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))
LETTER_KEY_CODES.update(dict(zip("bqweryt", [11, 12, 13, 14, 15, 16, 17])))
LETTER_KEY_CODES.update({"o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46})


def capture_screen(path: Path) -> None:
    # -x: 셔터음 없이 캡처
    subprocess.run(["screencapture", "-x", str(path)], check=True)


def press_right_arrow() -> None:
    script = f'tell application "System Events" to key code {RIGHT_ARROW_KEY_CODE}'
    subprocess.run(["osascript", "-e", script], check=True, capture_output=True, text=True)


def run_macro(count, interval, out_dir: Path, capture=capture_screen, press=press_right_arrow, stop=None):
    out_dir.mkdir(parents=True, exist_ok=True)
    width = max(3, len(str(count)))
    saved = []
    for i in range(1, count + 1):
        if stop is not None and stop.is_set():
            print("중단됨", flush=True)
            break
        path = out_dir / f"shot_{i:0{width}d}.png"
        capture(path)
        saved.append(path)
        time.sleep(interval)
        press()
        time.sleep(interval)
        print(f"[{i}/{count}] {path.name}", flush=True)
    return saved


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-n", "--count", type=int, default=80, help="반복 횟수 (기본 80)")
    parser.add_argument("-i", "--interval", type=float, default=0.1, help="동작 사이 대기 초 (기본 0.1)")
    parser.add_argument("-o", "--out", type=Path, default=None, help="저장 폴더 (기본 ./shots/<시각>)")
    parser.add_argument("-d", "--delay", type=float, default=3.0, help="시작 전 대기 초. 대상 창으로 포커스를 옮길 시간 (기본 3)")
    parser.add_argument("--listen", action="store_true", help="상주하며 단축키(⌃⌥ + --key)로 시작/중단")
    parser.add_argument("--key", default="m", help="--listen 단축키 글자. ⌃⌥ 와 조합 (기본 m)")
    args = parser.parse_args(argv)
    args.key = args.key.lower()
    if args.key not in LETTER_KEY_CODES:
        parser.error(f"--key 는 다음 중 하나여야 합니다: {''.join(sorted(LETTER_KEY_CODES))}")
    if args.count < 1:
        parser.error("--count 는 1 이상이어야 합니다")
    if args.interval < 0 or args.delay < 0:
        parser.error("--interval / --delay 는 0 이상이어야 합니다")
    return args


def default_out_dir() -> Path:
    return Path("shots") / datetime.now().strftime("%Y%m%d_%H%M%S")


def listen(args) -> int:
    import Quartz
    from pynput import keyboard

    hotkey_vk = LETTER_KEY_CODES[args.key]
    hotkey_flags = Quartz.kCGEventFlagMaskControl | Quartz.kCGEventFlagMaskAlternate
    other_flags = Quartz.kCGEventFlagMaskCommand | Quartz.kCGEventFlagMaskShift
    stop = threading.Event()
    worker = None

    def wait_modifiers_released():
        # ⌃⌥ 를 누른 채로 → 를 보내면 Space 전환 등 다른 단축키가 되므로 손을 뗄 때까지 기다린다.
        deadline = time.time() + 3
        while time.time() < deadline:
            flags = Quartz.CGEventSourceFlagsState(Quartz.kCGEventSourceStateHIDSystemState)
            if not flags & hotkey_flags:
                break
            time.sleep(0.02)
        time.sleep(0.1)

    def work(out_dir):
        wait_modifiers_released()
        try:
            saved = run_macro(args.count, args.interval, out_dir, stop=stop)
            print(f"완료: {len(saved)}장 -> {out_dir.resolve()}", flush=True)
        except subprocess.CalledProcessError as e:
            print(f"실패: {' '.join(e.cmd[:2])} -> {(e.stderr or '').strip()}", file=sys.stderr, flush=True)
        print(f"대기 중: ⌃⌥{args.key.upper()} 로 다시 시작", flush=True)

    def toggle():
        nonlocal worker
        if worker is not None and worker.is_alive():
            stop.set()
            return
        stop.clear()
        out_dir = args.out or default_out_dir()
        print(f"시작: {args.count}회, 간격 {args.interval:g}초 -> {out_dir}", flush=True)
        worker = threading.Thread(target=work, args=(out_dir,), daemon=True)
        worker.start()

    # 수식키를 별도 키 이벤트가 아닌 키 이벤트의 flags 로 판정한다. 한/영 상태와 무관하게 물리 키(vk)로 매칭.
    def intercept(event_type, event):
        if event_type not in (Quartz.kCGEventKeyDown, Quartz.kCGEventKeyUp):
            return event
        vk = Quartz.CGEventGetIntegerValueField(event, Quartz.kCGKeyboardEventKeycode)
        flags = Quartz.CGEventGetFlags(event)
        if vk != hotkey_vk or flags & hotkey_flags != hotkey_flags or flags & other_flags:
            return event
        if event_type == Quartz.kCGEventKeyDown and not Quartz.CGEventGetIntegerValueField(
            event, Quartz.kCGKeyboardEventAutorepeat
        ):
            toggle()
        return None  # 단축키는 대상 앱에 전달하지 않는다

    print(f"대기 중: 대상 창에서 ⌃⌥{args.key.upper()} 를 누르면 시작, 실행 중 다시 누르면 중단. 종료: Ctrl+C", flush=True)
    with keyboard.Listener(darwin_intercept=intercept) as listener:
        try:
            listener.join()
        except KeyboardInterrupt:
            stop.set()
            print("\n종료")
    return 0


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.listen:
        return listen(args)
    out_dir = args.out or default_out_dir()

    print(f"{args.delay:g}초 후 시작합니다. 대상 창을 클릭해 활성화하세요. (중단: Ctrl+C)")
    time.sleep(args.delay)
    try:
        saved = run_macro(args.count, args.interval, out_dir)
    except KeyboardInterrupt:
        print("\n중단됨")
        return 130
    except subprocess.CalledProcessError as e:
        print(f"실패: {' '.join(e.cmd[:2])} -> {(e.stderr or '').strip()}", file=sys.stderr)
        print("시스템 설정 > 개인정보 보호 및 보안 에서 터미널 앱에 '화면 기록'과 '손쉬운 사용' 권한을 주세요.", file=sys.stderr)
        return 1
    print(f"완료: {len(saved)}장 -> {out_dir.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
