"""
X.com (Twitter) 발행기
이미지 파일 + 텍스트 → X 트윗
"""

import base64
import requests
from pathlib import Path
from requests_oauthlib import OAuth1


class XPublisher:
    MEDIA_UPLOAD_URL = "https://api.x.com/2/media/upload"
    TWEETS_URL = "https://api.x.com/2/tweets"

    def __init__(self, api_key: str, api_secret: str, access_token: str, access_token_secret: str):
        self.auth = OAuth1(
            client_key=api_key,
            client_secret=api_secret,
            resource_owner_key=access_token,
            resource_owner_secret=access_token_secret,
        )

    def _upload_media(self, image_path: Path) -> str:
        """이미지 업로드 → media_id 반환"""
        file_size = image_path.stat().st_size
        if file_size > 5 * 1024 * 1024:
            raise ValueError(f"이미지 크기 초과: {file_size / 1024 / 1024:.1f}MB (최대 5MB)")

        ext = image_path.suffix.lower()
        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
        media_type = mime_map.get(ext, "image/jpeg")

        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode()

        resp = requests.post(
            self.MEDIA_UPLOAD_URL,
            auth=self.auth,
            headers={"Content-Type": "application/json"},
            json={"media": image_b64, "media_type": media_type, "media_category": "tweet_image"},
            timeout=60,
        )

        if resp.status_code == 429:
            reset = resp.headers.get("x-rate-limit-reset", "unknown")
            raise RuntimeError(f"미디어 업로드 Rate limit 초과. Reset: {reset}")

        resp.raise_for_status()
        return resp.json()["data"]["id"]

    def publish(self, text: str, image_path: Path) -> dict:
        """트윗 발행 → 발행된 트윗 정보 반환"""
        media_id = self._upload_media(image_path)

        resp = requests.post(
            self.TWEETS_URL,
            auth=self.auth,
            headers={"Content-Type": "application/json"},
            json={"text": text, "media": {"media_ids": [media_id]}},
            timeout=30,
        )

        if resp.status_code == 429:
            raise RuntimeError("트윗 Rate limit 초과 (Free: 500/월)")

        resp.raise_for_status()
        data = resp.json()
        tweet_id = data["data"]["id"]
        data["url"] = f"https://x.com/i/web/status/{tweet_id}"
        return data
