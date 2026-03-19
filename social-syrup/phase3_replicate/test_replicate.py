"""
Phase 3: Replicate API로 이미지 생성 테스트

지원 모델:
- black-forest-labs/flux-schnell  (빠름, 저렴, 테스트 추천)
- black-forest-labs/flux-dev      (고품질, 느림)
- stability-ai/sdxl               (다양한 스타일)

과금: https://replicate.com/pricing 참조
Flux Schnell 기준 약 $0.003/이미지 (매우 저렴)
"""

import os
import time
import requests
import replicate
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Replicate 클라이언트 초기화 (환경변수 REPLICATE_API_TOKEN 자동 사용)
client = replicate.Client(api_token=os.environ["REPLICATE_API_TOKEN"])

OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "./output_images"))
OUTPUT_DIR.mkdir(exist_ok=True)


def generate_image(
    prompt: str,
    negative_prompt: str = "",
    model: str = "black-forest-labs/flux-schnell",
    width: int = 1024,
    height: int = 1024,
    output_filename: str = None,
) -> Path:
    """
    Replicate API로 이미지 생성 후 로컬에 저장
    Returns: 저장된 이미지 파일 경로
    """
    print(f"이미지 생성 중...")
    print(f"모델: {model}")
    print(f"프롬프트: {prompt[:80]}...")

    start_time = time.time()

    # 모델별 input 파라미터가 다름
    if "flux-schnell" in model:
        input_params = {
            "prompt": prompt,
            "num_outputs": 1,
            "aspect_ratio": "1:1",
            "output_format": "jpg",
            "output_quality": 90,
        }
    elif "flux-dev" in model:
        input_params = {
            "prompt": prompt,
            "num_outputs": 1,
            "aspect_ratio": "1:1",
            "output_format": "jpg",
            "output_quality": 90,
            "guidance": 3.5,
            "num_inference_steps": 28,
        }
    else:
        # SDXL 또는 기타
        input_params = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "width": width,
            "height": height,
            "num_outputs": 1,
        }

    # 동기 방식으로 실행 (완료될 때까지 대기)
    output = client.run(model, input=input_params)

    elapsed = time.time() - start_time
    print(f"생성 완료! ({elapsed:.1f}초 소요)")

    # output은 URL 리스트 또는 FileOutput 리스트
    image_url = str(output[0])
    print(f"이미지 URL: {image_url}")

    # 이미지 다운로드
    if output_filename is None:
        output_filename = f"generated_{int(time.time())}.jpg"

    output_path = OUTPUT_DIR / output_filename

    resp = requests.get(image_url, timeout=60)
    resp.raise_for_status()

    with open(output_path, "wb") as f:
        f.write(resp.content)

    file_size_kb = output_path.stat().st_size / 1024
    print(f"이미지 저장: {output_path} ({file_size_kb:.1f}KB)")

    return output_path


def main():
    # Phase 2에서 생성될 이미지 프롬프트 예시로 테스트
    test_prompts = [
        {
            "prompt": (
                "Traditional Korean folk art depicting two birds speaking to each other, "
                "one red crane and one blue magpie, surrounded by autumn leaves and mountains, "
                "warm earthy tones, ilustrative style, peaceful atmosphere"
            ),
            "negative_prompt": "ugly, blurry, distorted, modern, western",
            "filename": "test_속담_가는말.jpg",
        },
        {
            "prompt": (
                "A majestic Amur leopard resting on a snowy rock in a winter forest, "
                "golden eyes, spotted fur, photorealistic, dramatic lighting, "
                "nature photography style"
            ),
            "negative_prompt": "cartoon, anime, unrealistic",
            "filename": "test_멸종위기_아무르표범.jpg",
        },
    ]

    model = os.environ.get("REPLICATE_MODEL", "black-forest-labs/flux-schnell")

    for i, test in enumerate(test_prompts):
        print(f"\n{'='*60}")
        print(f"테스트 {i+1}/{len(test_prompts)}")

        output_path = generate_image(
            prompt=test["prompt"],
            negative_prompt=test["negative_prompt"],
            model=model,
            output_filename=test["filename"],
        )

        print(f"✅ 완료: {output_path}")

        # 첫 번째만 테스트 (비용 절약)
        break

    print(f"\n생성된 이미지: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
