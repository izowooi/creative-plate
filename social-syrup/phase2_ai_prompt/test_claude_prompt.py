"""
Phase 2: Claude API로 이미지 프롬프트 + SNS 텍스트 생성 테스트

입력: 테마(theme) + 제시어(keyword)
출력:
  - image_prompt: Replicate에 넣을 영문 이미지 생성 프롬프트
  - sns_text: X.com에 올릴 한국어 텍스트 (해시태그 포함)
  - hashtags: 별도 해시태그 리스트
"""

import os
import json
import anthropic
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# 지원하는 테마와 각 테마의 시스템 컨텍스트
THEME_CONFIGS = {
    "속담": {
        "description": "한국 전통 속담",
        "context": "한국 전통 속담의 의미와 교훈을 시각적으로 표현",
        "image_style": "traditional Korean folk art style, warm colors, illustrative",
    },
    "멸종위기동물": {
        "description": "멸종위기에 처한 동물",
        "context": "멸종위기 동물의 아름다움과 보호의 필요성을 전달",
        "image_style": "nature photography style, realistic, beautiful wildlife",
    },
    "사자성어": {
        "description": "한자 사자성어",
        "context": "사자성어의 의미와 지혜를 시각적으로 표현",
        "image_style": "East Asian ink painting style, minimalist, elegant",
    },
}

SYSTEM_PROMPT = """당신은 SNS 콘텐츠 제작 전문가입니다.
주어진 테마와 제시어를 바탕으로 다음을 생성해야 합니다:
1. AI 이미지 생성용 영문 프롬프트 (Stable Diffusion / Flux 모델용)
2. X.com (트위터)에 올릴 한국어 텍스트

반드시 JSON 형식으로만 응답하세요."""

USER_PROMPT_TEMPLATE = """테마: {theme} ({theme_description})
제시어: {keyword}

다음 JSON 형식으로 응답해주세요:
{{
  "image_prompt": "영문 이미지 생성 프롬프트 (구체적이고 시각적으로 풍부하게, {image_style})",
  "negative_prompt": "피해야 할 요소 (영문)",
  "sns_text": "X.com에 올릴 한국어 본문 (150자 이내, 감성적이고 공감 가능하게)",
  "hashtags": ["해시태그1", "해시태그2", "해시태그3"],
  "explanation": "이 제시어에 대한 간단한 설명 (50자 이내)"
}}"""


def generate_content(theme: str, keyword: str) -> dict:
    """Claude API로 콘텐츠 생성"""
    config = THEME_CONFIGS.get(theme)
    if not config:
        supported = ", ".join(THEME_CONFIGS.keys())
        raise ValueError(f"지원하지 않는 테마: {theme}. 지원 테마: {supported}")

    user_message = USER_PROMPT_TEMPLATE.format(
        theme=theme,
        theme_description=config["description"],
        keyword=keyword,
        image_style=config["image_style"],
    )

    print(f"Claude API 호출 중... (테마: {theme}, 제시어: {keyword})")

    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw_response = message.content[0].text
    print(f"Raw response:\n{raw_response}\n")

    # JSON 파싱 (마크다운 코드블록 제거)
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        cleaned = "\n".join(lines[1:-1])

    result = json.loads(cleaned)

    # 해시태그를 sns_text에 합치기
    hashtag_str = " ".join(f"#{tag.lstrip('#')}" for tag in result["hashtags"])
    result["full_post"] = f"{result['sns_text']}\n\n{hashtag_str}"

    return result


def main():
    # 테스트 케이스들
    test_cases = [
        ("속담", "가는 말이 고와야 오는 말이 곱다"),
        ("멸종위기동물", "아무르 표범"),
        ("사자성어", "일석이조 (一石二鳥)"),
    ]

    for theme, keyword in test_cases:
        print("=" * 60)
        result = generate_content(theme, keyword)

        print(f"\n✅ 생성 완료!")
        print(f"설명: {result['explanation']}")
        print(f"\n[이미지 프롬프트]")
        print(result["image_prompt"])
        print(f"\n[Negative 프롬프트]")
        print(result["negative_prompt"])
        print(f"\n[SNS 포스트]")
        print(result["full_post"])
        print()

        # 결과를 JSON 파일로 저장
        output_path = f"output_{theme}_{keyword[:10]}.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"결과 저장: {output_path}")

        # 테스트용으로 첫 번째만 실행
        break


if __name__ == "__main__":
    main()
