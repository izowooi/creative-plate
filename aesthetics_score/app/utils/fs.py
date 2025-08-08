from __future__ import annotations

import os
from typing import Iterable, List, Tuple


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}


def list_image_files(dir_path: str) -> List[str]:
    if not os.path.isdir(dir_path):
        return []
    files: List[str] = []
    for name in os.listdir(dir_path):
        full = os.path.join(dir_path, name)
        if os.path.isfile(full):
            _, ext = os.path.splitext(name)
            if ext.lower() in IMAGE_EXTS:
                files.append(full)
    return files


def list_subdirectories(dir_path: str) -> List[str]:
    if not os.path.isdir(dir_path):
        return []
    return [os.path.join(dir_path, d) for d in os.listdir(dir_path) if os.path.isdir(os.path.join(dir_path, d))]


