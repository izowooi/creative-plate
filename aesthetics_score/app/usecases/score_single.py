from __future__ import annotations

from dataclasses import dataclass
from typing import Generator

from PIL import Image

from app.domain.protocols import ImageScorerProtocol


@dataclass
class Progress:
    current: int
    total: int


def score_single_image(path: str, scorer: ImageScorerProtocol) -> float:
    with Image.open(path) as image:
        return scorer.score_pil_image(image.convert("RGB"))


def score_directory_average(dir_path: str, scorer: ImageScorerProtocol) -> Generator[tuple[Progress, float | None], None, float]:
    """Yield (progress, partial_avg or None) while computing average over all images.

    The final return value is the full average.
    """
    from app.utils.fs import list_image_files

    files = list_image_files(dir_path)
    total = len(files)
    if total == 0:
        yield Progress(0, 0), None
        return 0.0

    running_sum = 0.0
    for idx, file in enumerate(files, start=1):
        score = score_single_image(file, scorer)
        running_sum += score
        yield Progress(idx, total), running_sum / idx

    return running_sum / total


