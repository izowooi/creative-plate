"""Check cross-platform resources and the local Firebase configuration without printing keys."""
from pathlib import Path
import json
import plistlib
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_LANGUAGES = {"en", "ko", "ja", "zh-Hans", "zh-Hant", "de", "fr", "es", "pt-BR", "it"}
messages = json.loads((ROOT / "localization/messages.json").read_text())
for key, values in messages.items():
    assert set(values) == EXPECTED_LANGUAGES, f"Incomplete localization: {key}"
    assert all(value.strip() for value in values.values()), f"Empty localization: {key}"
for path in list((ROOT / "ios/dm").glob("*.swift")) + list((ROOT / "android/app/src/main/java").rglob("*.kt")):
    for key in re.findall(r'\b(?:tr|t)\("([a-z0-9_]+)"\)', path.read_text()):
        assert key in messages, f"Unknown UI key in {path.name}: {key}"
for path in (ROOT / "android/app/src/main/res").glob("values*/strings.xml"):
    keys = {item.attrib["name"] for item in ET.parse(path).getroot().findall("string")}
    assert keys == set(messages), f"Android locale keys differ: {path}"
catalog = json.loads((ROOT / "ios/dm/Localizable.xcstrings").read_text())
assert set(catalog["strings"]) == set(messages)
for key, entry in catalog["strings"].items():
    assert set(entry["localizations"]) == EXPECTED_LANGUAGES, key

namespace = {"android": "http://schemas.android.com/apk/res/android"}
manifest = ET.parse(ROOT / "android/app/src/main/AndroidManifest.xml").getroot()
attr = "{" + namespace["android"] + "}"
permissions = {node.attrib[attr + "name"] for node in manifest.findall("uses-permission")}
assert permissions == {"android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.INTERNET"}
application = manifest.find("application")
assert application.attrib[attr + "allowBackup"] == "false"
metadata = {node.attrib[attr + "name"]: node.attrib.get(attr + "value") for node in application.findall("meta-data")}
assert metadata["firebase_crashlytics_collection_enabled"] == "false"
assert metadata["firebase_data_collection_default_enabled"] == "false"
privacy = plistlib.loads((ROOT / "ios/dm/PrivacyInfo.xcprivacy").read_bytes())
assert privacy["NSPrivacyTracking"] is False
assert privacy["NSPrivacyAccessedAPITypes"][0]["NSPrivacyAccessedAPITypeReasons"] == ["CA92.1"]

notices = (ROOT / "licenses/THIRD-PARTY-NOTICES.txt").read_bytes()
assert notices == (ROOT / "ios/dm/ThirdPartyNotices.txt").read_bytes()
assert notices == (ROOT / "android/app/src/main/assets/ThirdPartyNotices.txt").read_bytes()

android_config = ROOT / "android/app/google-services.json"
ios_config = ROOT / "ios/dm/GoogleService-Info.plist"
assert android_config.is_file() and ios_config.is_file(), "Copy your Firebase app config files into the platform folders before verification."
a = json.loads(android_config.read_bytes())
i = plistlib.loads(ios_config.read_bytes())
assert any(client["client_info"]["android_client_info"]["package_name"] == "com.izowooi.dm" for client in a["client"])
assert i["BUNDLE_ID"] == "com.izowooi.dm"
assert a["project_info"]["project_id"] == i["PROJECT_ID"]
for path in [".env", "android/app/google-services.json", "ios/dm/GoogleService-Info.plist", "signing.key", "signing.pem", "upload.jks", "AuthKey_example.p8"]:
    assert subprocess.run(["git", "check-ignore", "--quiet", "--", path], cwd=ROOT).returncode == 0, path

print(f"PASS: {len(messages)} complete UI strings in 10 languages on both platforms.")
print("PASS: microphone permissions, opt-in diagnostics, privacy manifest and bundled notices.")
print("PASS: local Firebase project/app IDs agree; credentials and signing files are excluded from Git.")
