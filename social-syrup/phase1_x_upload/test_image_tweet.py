"""
Phase 1-B: X.com 이미지 + 텍스트 트윗 테스트
OAuth 1.0a User Context 방식 사용

주의사항 (docs 참조):
- v1.1 Media Upload는 2025년 6월 이후 완전 폐기됨
- 반드시 v2 /2/media/upload 엔드포인트 사용
- Free tier: 미디어 업로드 17 requests/24h (매우 제한적)
- 이미지 최대 5MB, JPEG/PNG/GIF/WEBP 지원
"""

import os
import json
import base64
import requests
from requests_oauthlib import OAuth1
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["X_API_KEY"]
API_SECRET = os.environ["X_API_SECRET"]
ACCESS_TOKEN = os.environ["X_ACCESS_TOKEN"]
ACCESS_TOKEN_SECRET = os.environ["X_ACCESS_TOKEN_SECRET"]

auth = OAuth1(
    client_key=API_KEY,
    client_secret=API_SECRET,
    resource_owner_key=ACCESS_TOKEN,
    resource_owner_secret=ACCESS_TOKEN_SECRET,
)

MEDIA_UPLOAD_URL = "https://api.x.com/2/media/upload"
TWEETS_URL = "https://api.x.com/2/tweets"


def upload_media(image_path: str) -> str:
    """
    이미지를 X에 업로드하고 media_id 반환
    5MB 이하 이미지는 Simple Upload (base64) 방식 사용
    """
    file_size = os.path.getsize(image_path)
    if file_size > 5 * 1024 * 1024:
        raise ValueError(f"이미지 크기 초과: {file_size / 1024 / 1024:.1f}MB (최대 5MB)")

    # 파일 확장자로 MIME 타입 결정
    ext = os.path.splitext(image_path)[1].lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                ".gif": "image/gif", ".webp": "image/webp"}
    media_type = mime_map.get(ext, "image/jpeg")

    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode()

    payload = {
        "media": image_b64,
        "media_type": media_type,
        "media_category": "tweet_image",
    }

    resp = requests.post(
        MEDIA_UPLOAD_URL,
        auth=auth,
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )

    # Rate limit 확인 (Free tier는 17/24h로 매우 제한적)
    remaining = resp.headers.get("x-rate-limit-remaining", "N/A")
    print(f"미디어 업로드 Rate limit remaining: {remaining}")

    if resp.status_code == 429:
        reset = resp.headers.get("x-rate-limit-reset", "unknown")
        raise RuntimeError(f"미디어 업로드 Rate limit 초과. Reset: {reset}")

    resp.raise_for_status()
    data = resp.json()
    print(f"미디어 업로드 응답: {json.dumps(data, indent=2)}")

    # v2 응답 구조: {"data": {"id": "...", "media_key": "..."}}
    media_id = data["data"]["id"]
    return media_id


def post_tweet_with_image(text: str, image_path: str) -> dict:
    """이미지와 함께 트윗 전송"""
    print(f"[1/2] 이미지 업로드 중: {image_path}")
    media_id = upload_media(image_path)
    print(f"[1/2] 완료. media_id: {media_id}")

    print(f"[2/2] 트윗 전송 중...")
    payload = {
        "text": text,
        "media": {"media_ids": [media_id]},
    }

    resp = requests.post(
        TWEETS_URL,
        auth=auth,
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )

    remaining = resp.headers.get("x-rate-limit-remaining", "N/A")
    print(f"트윗 Rate limit remaining: {remaining}")

    if resp.status_code == 429:
        raise RuntimeError("트윗 Rate limit 초과")

    resp.raise_for_status()
    return resp.json()


def main():
    # 테스트용 샘플 이미지 생성 (Pillow 사용)
    # 실제 사용 시 이 부분을 실제 이미지 경로로 교체
    sample_image_path = "sample_test_image.png"

    try:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGB", (1080, 1080), color=(30, 30, 60))
        draw = ImageDraw.Draw(img)
        # 간단한 텍스트 그리기
        draw.text((540, 480), "🧪 Test Image", fill=(255, 255, 255), anchor="mm")
        draw.text((540, 560), "social-syrup API test", fill=(180, 180, 255), anchor="mm")
        img.save(sample_image_path)
        print(f"샘플 이미지 생성됨: {sample_image_path}")
    except Exception as e:
        print(f"샘플 이미지 생성 실패: {e}")
        print("sample_test_image.png 파일을 직접 준비해주세요.")
        return

    tweet_text = "🖼️ 이미지 포함 API 테스트입니다. #test #api"

    result = post_tweet_with_image(tweet_text, sample_image_path)
    print("\n✅ 트윗 성공!")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n트윗 URL: https://x.com/i/web/status/{result['data']['id']}")

    # 임시 파일 정리
    if os.path.exists(sample_image_path):
        os.remove(sample_image_path)


if __name__ == "__main__":
    main()
