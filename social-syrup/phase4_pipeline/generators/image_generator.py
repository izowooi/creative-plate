"""
Replicate API 이미지 생성기
AI가 생성한 프롬프트 → 이미지 파일
"""

import time
import requests
import replicate
from pathlib import Path


class ImageGenerator:
    def __init__(self, api_token: str, model: str = "black-forest-labs/flux-schnell", output_dir: str = "./output_images"):
        self.client = replicate.Client(api_token=api_token)
        self.model = model
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _build_input(self, prompt: str, negative_prompt: str) -> dict:
        """모델별 input 파라미터 구성"""
        if "flux-schnell" in self.model:
            return {
                "prompt": prompt,
                "num_outputs": 1,
                "aspect_ratio": "1:1",
                "output_format": "jpg",
                "output_quality": 90,
            }
        elif "flux-dev" in self.model:
            return {
                "prompt": prompt,
                "num_outputs": 1,
                "aspect_ratio": "1:1",
                "output_format": "jpg",
                "output_quality": 90,
                "guidance": 3.5,
                "num_inference_steps": 28,
            }
        else:
            # SDXL 등 범용
            return {
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "width": 1024,
                "height": 1024,
                "num_outputs": 1,
            }

    def generate(self, prompt: str, negative_prompt: str = "", filename: str = None) -> Path:
        """이미지 생성 후 저장된 파일 경로 반환"""
        input_params = self._build_input(prompt, negative_prompt)

        start = time.time()
        output = self.client.run(self.model, input=input_params)
        elapsed = time.time() - start

        image_url = str(output[0])

        # 다운로드
        if filename is None:
            filename = f"generated_{int(time.time())}.jpg"

        output_path = self.output_dir / filename

        resp = requests.get(image_url, timeout=60)
        resp.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(resp.content)

        return output_path
