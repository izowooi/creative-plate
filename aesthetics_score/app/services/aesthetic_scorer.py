from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import torch
from PIL import Image
from transformers import CLIPProcessor
from aesthetics_predictor import AestheticsPredictorV1

from app.domain.protocols import ImageScorerProtocol


MODEL_ID = "shunk031/aesthetics-predictor-v1-vit-large-patch14"


@dataclass
class AestheticScorerConfig:
    model_id: str = MODEL_ID
    device: Optional[str] = None  # e.g., "cuda", "mps", "cpu"


class AestheticScorer(ImageScorerProtocol):
    """CLIP-based aesthetics predictor as a concrete implementation.

    - Single Responsibility: only handles image scoring given a PIL image
    - Open/Closed: can be extended by swapping model_id or adding new strategy
    - Liskov Substitution: conforms to ImageScorerProtocol
    - Interface Segregation: minimal protocol surface
    - Dependency Inversion: high-level modules depend on ImageScorerProtocol
    """

    def __init__(self, config: Optional[AestheticScorerConfig] = None) -> None:
        self.config = config or AestheticScorerConfig()
        prefer_device = self.config.device
        if prefer_device is None:
            if torch.cuda.is_available():
                prefer_device = "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                prefer_device = "mps"
            else:
                prefer_device = "cpu"
        self.device = prefer_device

        # Lazy initialization
        self._predictor: AestheticsPredictorV1 | None = None
        self._processor: CLIPProcessor | None = None

    def _ensure_loaded(self) -> None:
        if self._predictor is None or self._processor is None:
            self._predictor = (
                AestheticsPredictorV1.from_pretrained(self.config.model_id)
                .to(self.device)
                .eval()
            )
            self._processor = CLIPProcessor.from_pretrained(self.config.model_id)

    def score_pil_image(self, image: Image.Image) -> float:
        self._ensure_loaded()
        image = image.convert("RGB")
        assert self._processor is not None and self._predictor is not None
        inputs = self._processor(images=image, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            score = self._predictor(**inputs).logits.item()
        return float(score)


