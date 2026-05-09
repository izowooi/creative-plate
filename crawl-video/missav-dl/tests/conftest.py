import sys
from pathlib import Path

# tests/ 위 디렉토리(missav-dl/)를 import path 에 추가해 `from downloader import ...`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
