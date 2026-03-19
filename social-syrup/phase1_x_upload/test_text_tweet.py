"""
Phase 1-A: X.com 텍스트 트윗 테스트
OAuth 1.0a User Context 방식 사용
- 미디어 없이 텍스트만 트윗
- 성공하면 phase1-B (이미지 포함) 진행
"""

import os
import json
import requests
from requests_oauthlib import OAuth1
from dotenv import load_dotenv

load_dotenv()

# OAuth 1.0a 자격증명 로드
API_KEY = os.environ["X_API_KEY"]
API_SECRET = os.environ["X_API_SECRET"]
ACCESS_TOKEN = os.environ["X_ACCESS_TOKEN"]
ACCESS_TOKEN_SECRET = os.environ["X_ACCESS_TOKEN_SECRET"]

# OAuth1 인증 객체 생성
auth = OAuth1(
    client_key=API_KEY,
    client_secret=API_SECRET,
    resource_owner_key=ACCESS_TOKEN,
    resource_owner_secret=ACCESS_TOKEN_SECRET,
)

TWEETS_URL = "https://api.x.com/2/tweets"


def post_text_tweet(text: str) -> dict:
    """텍스트 트윗 전송"""
    payload = {"text": text}

    resp = requests.post(
        TWEETS_URL,
        auth=auth,
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )

    # Rate limit 정보 출력 (Free tier 잔여량 확인용)
    rate_limit = resp.headers.get("x-rate-limit-remaining", "N/A")
    rate_reset = resp.headers.get("x-rate-limit-reset", "N/A")
    print(f"Rate limit remaining: {rate_limit}, reset at: {rate_reset}")

    if resp.status_code == 429:
        raise RuntimeError(f"Rate limit exceeded. Reset at: {rate_reset}")

    resp.raise_for_status()
    return resp.json()


def main():
    # 테스트 트윗 내용
    test_text = "🧪 API 연동 테스트 중입니다. #test"

    print(f"트윗 전송 중: {test_text!r}")
    result = post_text_tweet(test_text)
    print("성공!")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n트윗 URL: https://x.com/i/web/status/{result['data']['id']}")


if __name__ == "__main__":
    main()
