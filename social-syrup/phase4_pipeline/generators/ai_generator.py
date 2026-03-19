"""
AI 콘텐츠 생성기 (Claude API)
테마 + 제시어 → 이미지 프롬프트 + SNS 텍스트 생성
"""

import json
import anthropic

THEME_CONFIGS = {
    "속담": {
        "description": "한국 전통 속담",
        "image_style": "traditional Korean folk art style, warm colors, illustrative, detailed",
    },
    "멸종위기동물": {
        "description": "멸종위기에 처한 동물",
        "image_style": "nature photography style, realistic, beautiful wildlife, dramatic lighting",
    },
    "사자성어": {
        "description": "한자 사자성어",
        "image_style": "East Asian ink painting style, minimalist, elegant, calligraphy inspired",
    },
}

SYSTEM_PROMPT = """당신은 SNS 콘텐츠 제작 전문가입니다.
주어진 테마와 제시어를 바탕으로 반드시 JSON 형식으로만 응답하세요. 마크다운 없이 순수 JSON만 출력합니다."""

USER_PROMPT_TEMPLATE = """테마: {theme} ({theme_description})
제시어: {keyword}

다음 JSON 형식으로 응답:
{{
  "image_prompt": "영문 이미지 생성 프롬프트 ({image_style}), high quality, detailed",
  "negative_prompt": "low quality, blurry, distorted, ugly, watermark",
  "sns_text": "X.com 본문 한국어 (150자 이내, 감성적)",
  "hashtags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "explanation": "제시어 간단 설명 (50자 이내)"
}}"""


class AIContentGenerator:
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)

    def generate(self, theme: str, keyword: str) -> dict:
        """테마 + 제시어 → 콘텐츠 딕셔너리 반환"""
        config = THEME_CONFIGS.get(theme)
        if not config:
            raise ValueError(f"지원하지 않는 테마: {theme}. 지원: {list(THEME_CONFIGS.keys())}")

        user_message = USER_PROMPT_TEMPLATE.format(
            theme=theme,
            theme_description=config["description"],
            keyword=keyword,
            image_style=config["image_style"],
        )

        message = self.client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw = message.content[0].text.strip()

        # 마크다운 코드블록 제거 (혹시 포함되어 있을 경우)
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1])

        result = json.loads(raw)

        # full_post 구성: 본문 + 해시태그
        hashtag_str = " ".join(f"#{tag.lstrip('#')}" for tag in result["hashtags"])
        result["full_post"] = f"{result['sns_text']}\n\n{hashtag_str}"
        result["theme"] = theme
        result["keyword"] = keyword

        return result
