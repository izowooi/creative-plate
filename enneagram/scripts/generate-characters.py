#!/usr/bin/env python3
"""Generate the requested nine NovelAI character illustrations without storing credentials."""

import argparse
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "docs/character-prompts.md"
DESTINATION = ROOT / "public/characters"
API = "https://image.novelai.net"


def load_config():
    match = re.search(r"```json\s*\n(.*?)\n```", CONFIG.read_text(), re.S)
    if not match:
        raise ValueError("No JSON prompt configuration found")
    config = json.loads(match.group(1))
    if sorted(item["type"] for item in config["characters"]) != list(range(1, 10)):
        raise ValueError("Configuration must contain each type from 1 to 9 exactly once")
    return config


def request(token, endpoint, payload=None):
    # curl handles the service's edge network reliably; sensitive headers go through
    # stdin, never command-line arguments or a temporary curl configuration file.
    headers = ["Authorization: Bearer " + token, "Content-Type: application/json"]
    config = ["url = " + json.dumps(API + endpoint)]
    config += ["header = " + json.dumps(value) for value in headers]
    config += ["write-out = " + json.dumps("\nHTTP_STATUS:%{http_code}")]
    if payload is not None:
        config += ["request = \"POST\"", "data = " + json.dumps(json.dumps(payload))]
    result = subprocess.run(
        ["curl", "--silent", "--show-error", "--max-time", "180", "--config", "-"],
        input="\n".join(config).encode(), capture_output=True, check=False,
    )
    if result.returncode:
        # Error bodies, curl stderr and request headers are intentionally omitted.
        raise RuntimeError(f"NovelAI transport failed (curl exit {result.returncode})")
    data, _, status = result.stdout.rpartition(b"\nHTTP_STATUS:")
    if not status.isdigit() or not 200 <= int(status) < 300:
        safe_status = status.decode() if status.isdigit() else "unknown"
        raise RuntimeError(f"NovelAI HTTP {safe_status}; response body omitted")
    return data


def build_payload(config, character):
    prompt = config["common_positive"] + ", " + character["positive"]
    negative = config["common_negative"]
    if character.get("negative"):
        negative += ", " + character["negative"]
    params = {
        **config["parameters"], "seed": character["seed"], "n_samples": 1,
        "negative_prompt": negative, "qualityToggle": False, "ucPreset": 2,
        "v4_prompt": {
            "caption": {"base_caption": prompt, "char_captions": []},
            "use_coords": False, "use_order": True,
        },
        "v4_negative_prompt": {"caption": {"base_caption": negative, "char_captions": []}},
        "characterPrompts": [], "image_format": "png", "autoSmea": False,
        "legacy": False, "legacy_v3_extend": False,
        "dynamic_thresholding": False, "skip_cfg_above_sigma": None,
        "deliberate_euler_ancestral_bug": False, "prefer_brownian": True,
    }
    return {"action": "generate", "model": config["model"], "input": prompt, "parameters": params}


def save_image(data, output, expected_size):
    from PIL import Image

    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = [name for name in archive.namelist() if name.lower().endswith(".png")]
        if len(names) != 1:
            raise ValueError(f"Expected one generated PNG, received {len(names)}")
        raw = archive.read(names[0])
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        if image.size != expected_size:
            raise ValueError(f"Unexpected dimensions: {image.size}")
        # Recreate pixels to exclude PNG metadata, generation payloads and EXIF.
        clean = Image.new("RGB", image.size)
        clean.paste(image.convert("RGB"))
        clean.save(output, "WEBP", quality=90, method=6)
    return hashlib.sha256(output.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--types", type=int, nargs="+", default=list(range(1, 10)))
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--check", action="store_true", help="Validate configuration without API calls")
    args = parser.parse_args()
    config = load_config()
    if any(number not in range(1, 10) for number in args.types):
        parser.error("--types must be between 1 and 9")
    if args.check:
        for character in config["characters"]:
            build_payload(config, character)
        print("Validated nine prompts and generation parameters; no API request sent.")
        return
    from PIL import Image  # fail before calling any paid API if conversion is unavailable

    token = os.environ.get("NOVELAI_TOKEN") or getpass.getpass("NovelAI persistent token (hidden): ")
    if not token or any(character.isspace() for character in token):
        raise ValueError("Invalid token format")
    request(token, "/user/subscription")
    print("NovelAI authentication confirmed; account data omitted.", flush=True)
    DESTINATION.mkdir(parents=True, exist_ok=True)
    manifest_path = DESTINATION / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"provider": "NovelAI", "images": {}}
    for character in config["characters"]:
        number = character["type"]
        if number not in args.types:
            continue
        output = DESTINATION / f"type-{number}.webp"
        if output.exists() and not args.overwrite:
            print(f"Type {number}: existing image preserved.", flush=True)
            continue
        print(f"Type {number}: requesting one image…", flush=True)
        payload = build_payload(config, character)
        data = request(token, "/ai/generate-image", payload)
        digest = save_image(data, output, (config["parameters"]["width"], config["parameters"]["height"]))
        manifest["images"][str(number)] = {
            "file": output.name, "model": config["model"], "seed": character["seed"],
            "width": config["parameters"]["width"], "height": config["parameters"]["height"],
            "generatedAt": datetime.now(timezone.utc).isoformat(), "sha256": digest,
            "promptSha256": hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        print(f"Type {number}: saved {output.relative_to(ROOT)} ({output.stat().st_size} bytes)", flush=True)
    token = None


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
