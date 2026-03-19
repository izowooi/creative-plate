"""
social-syrup 메인 파이프라인
테마 + 제시어 → AI 프롬프트 생성 → 이미지 생성 → X.com 업로드

사용법:
  python main.py --theme 속담 --keyword "가는 말이 고와야 오는 말이 곱다"
  python main.py --theme 멸종위기동물 --keyword "아무르 표범" --dry-run
"""

import os
import sys
import json
import argparse
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from generators.ai_generator import AIContentGenerator
from generators.image_generator import ImageGenerator
from publishers.x_publisher import XPublisher


def run_pipeline(theme: str, keyword: str, dry_run: bool = False) -> dict:
    """
    전체 파이프라인 실행
    Returns: 결과 딕셔너리
    """
    print(f"\n{'='*60}")
    print(f"🚀 파이프라인 시작")
    print(f"   테마: {theme}")
    print(f"   제시어: {keyword}")
    print(f"   Dry run: {dry_run}")
    print(f"{'='*60}\n")

    result = {
        "theme": theme,
        "keyword": keyword,
        "dry_run": dry_run,
        "timestamp": int(time.time()),
    }

    # ── Step 1: AI 콘텐츠 생성 ──────────────────────────────
    print("[1/3] Claude로 콘텐츠 생성 중...")
    generator = AIContentGenerator(api_key=os.environ["ANTHROPIC_API_KEY"])
    content = generator.generate(theme=theme, keyword=keyword)

    result["content"] = content
    print(f"✅ 프롬프트 생성 완료")
    print(f"   설명: {content['explanation']}")
    print(f"   이미지 프롬프트: {content['image_prompt'][:60]}...")
    print(f"   SNS 텍스트: {content['sns_text'][:50]}...")

    # ── Step 2: Replicate로 이미지 생성 ─────────────────────
    print("\n[2/3] Replicate로 이미지 생성 중...")
    img_gen = ImageGenerator(
        api_token=os.environ["REPLICATE_API_TOKEN"],
        model=os.environ.get("REPLICATE_MODEL", "black-forest-labs/flux-schnell"),
        output_dir=os.environ.get("OUTPUT_DIR", "./output_images"),
    )

    # 파일명: 테마_제시어_타임스탬프.jpg
    safe_keyword = keyword[:20].replace(" ", "_").replace("/", "_")
    filename = f"{theme}_{safe_keyword}_{result['timestamp']}.jpg"

    image_path = img_gen.generate(
        prompt=content["image_prompt"],
        negative_prompt=content["negative_prompt"],
        filename=filename,
    )

    result["image_path"] = str(image_path)
    print(f"✅ 이미지 저장: {image_path}")

    # ── Step 3: X.com 업로드 ────────────────────────────────
    if dry_run:
        print("\n[3/3] Dry run 모드 - X.com 업로드 건너뜀")
        result["tweet_url"] = None
    else:
        print("\n[3/3] X.com에 업로드 중...")
        publisher = XPublisher(
            api_key=os.environ["X_API_KEY"],
            api_secret=os.environ["X_API_SECRET"],
            access_token=os.environ["X_ACCESS_TOKEN"],
            access_token_secret=os.environ["X_ACCESS_TOKEN_SECRET"],
        )

        tweet_result = publisher.publish(
            text=content["full_post"],
            image_path=image_path,
        )

        result["tweet"] = tweet_result
        result["tweet_url"] = tweet_result["url"]
        print(f"✅ 트윗 발행 완료!")
        print(f"   URL: {tweet_result['url']}")

    # 결과 저장
    output_json = Path(os.environ.get("OUTPUT_DIR", "./output_images")) / f"result_{result['timestamp']}.json"
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n📄 결과 저장: {output_json}")

    return result


def main():
    parser = argparse.ArgumentParser(description="social-syrup: AI 콘텐츠 자동 SNS 업로드")
    parser.add_argument("--theme", required=True, choices=["속담", "멸종위기동물", "사자성어"],
                        help="콘텐츠 테마")
    parser.add_argument("--keyword", required=True, help="테마에 맞는 제시어")
    parser.add_argument("--dry-run", action="store_true",
                        help="이미지만 생성하고 X.com 업로드는 건너뜀")

    args = parser.parse_args()

    try:
        result = run_pipeline(
            theme=args.theme,
            keyword=args.keyword,
            dry_run=args.dry_run,
        )
        print(f"\n✨ 파이프라인 완료!")
        if result.get("tweet_url"):
            print(f"트윗: {result['tweet_url']}")

    except KeyError as e:
        print(f"\n❌ 환경변수 누락: {e}")
        print("   .env 파일에 필요한 키가 설정되어 있는지 확인하세요.")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 오류 발생: {type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
