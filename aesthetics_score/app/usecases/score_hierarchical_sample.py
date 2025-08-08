from __future__ import annotations

import os
import json
import random
from dataclasses import dataclass, asdict
from typing import Dict, Generator, List, Tuple
from PIL import Image

from app.domain.protocols import ImageScorerProtocol
from app.utils.fs import list_image_files, list_subdirectories


@dataclass
class FolderProgress:
    current_folder_index: int
    total_folders: int
    current_folder_name: str
    last_folder_score: float | None = None


def sample_folder_scores(base_dir: str, scorer: ImageScorerProtocol, sample_size: int = 10, seed: int | None = None) -> Generator[tuple[FolderProgress, Dict[str, float] | None], None, Dict[str, float]]:
    """Randomly sample up to sample_size images per subfolder and compute averages.

    Yields progress and partial results for UI updates.
    """
    if seed is not None:
        random.seed(seed)

    subdirs = list_subdirectories(base_dir)
    total = len(subdirs)
    results: Dict[str, float] = {}

    if total == 0:
        yield FolderProgress(0, 0, current_folder_name="", last_folder_score=None), results
        return results

    for idx, subdir in enumerate(subdirs, start=1):
        files = list_image_files(subdir)
        if not files:
            avg = 0.0
        else:
            k = min(sample_size, len(files))
            sample = random.sample(files, k=k)
            running_sum = 0.0
            for file in sample:
                with Image.open(file) as im:
                    running_sum += scorer.score_pil_image(im.convert("RGB"))
            avg = running_sum / k
        artist = os.path.basename(subdir)
        results[artist] = avg
        yield FolderProgress(idx, total, current_folder_name=artist, last_folder_score=avg), dict(results)

    return results


def results_to_json(results: Dict[str, float]) -> str:
    return json.dumps(results, ensure_ascii=False, indent=2, sort_keys=True)


