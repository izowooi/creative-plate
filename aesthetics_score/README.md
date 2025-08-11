## Aesthetic Score ✨

그라디오(Gradio) UI로 이미지의 미적 점수를 예측하고, 폴더 평균 및 하위 폴더(아티스트)별 샘플링 평균을 계산하는 프로젝트입니다. 내부적으로 CLIP 기반 미적 점수 예측 모델을 사용합니다.

### 데모 🚀
- **Hugging Face Space**: [aesthetics_score 바로가기](https://huggingface.co/spaces/izowooi/aesthetics_score)

### 주요 기능 🎯
- **단일 이미지 점수**: 이미지 파일을 드롭하거나 경로를 입력해 0~10 범위의 점수 예측
- **폴더 평균 점수**: 폴더 경로를 입력해 포함된 이미지들의 평균 점수 계산(스트리밍 진행률/부분 평균 표시)
- **하위 폴더 샘플링 평균**: 베이스 폴더의 각 하위 폴더에서 지정 개수만큼 이미지를 샘플링해 평균 점수 계산 및 JSON 다운로드

### 스크린샷 🖼️
- 단일 이미지 점수

  ![단일 이미지 점수](https://raw.githubusercontent.com/izowooi/creative-plate/main/aesthetics_score/image/01.png)

- 폴더 평균 점수

  ![폴더 평균 점수](https://raw.githubusercontent.com/izowooi/creative-plate/main/aesthetics_score/image/02.png)

- 하위 폴더 샘플링 평균

  ![하위 폴더 샘플링 평균](https://raw.githubusercontent.com/izowooi/creative-plate/main/aesthetics_score/image/03.png)

### 디렉터리 구조 🗂️
```
aesthetics_score/
  app/
    services/aesthetic_scorer.py        # CLIP 기반 점수 예측 구현
    usecases/score_single.py            # 단일/폴더 평균 계산 로직
    usecases/score_hierarchical_sample.py # 하위 폴더 샘플링 평균 계산 로직
    utils/fs.py                         # 파일 시스템 유틸(이미지/하위 폴더 나열)
  app.py                                # Gradio UI 진입점
  pyproject.toml                        # 의존성(Gradio, predictor)
```

### 요구 사항
- Python 3.12+
- macOS, Linux, Windows 지원
- 기본은 CPU로 동작하며, 가능 시 GPU(CUDA) 또는 macOS의 MPS 가속을 자동 선택합니다

### 설치 🧰
`uv` 기반 설치(권장) 또는 `pip`를 사용할 수 있습니다.

#### uv 사용
```bash
# (한 번만) uv 설치: https://docs.astral.sh/uv/getting-started/installation/
# macOS/Linux 예시
curl -LsSf https://astral.sh/uv/install.sh | sh

# 프로젝트 루트에서 의존성 동기화 (pyproject.toml 사용)
uv sync

# 가상환경 활성화(선택)
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# (선택) PyTorch는 환경에 따라 별도 설치가 필요할 수 있습니다.
# 공식 가이드를 참고하거나, 예시처럼 설치하세요:
# CPU만:    uv add torch
# CUDA 예:  uv add torch --index-url https://download.pytorch.org/whl/cu121
# 자세한 내용: https://pytorch.org/get-started/locally/
```

#### pip 사용
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install --upgrade pip

# pyproject.toml의 의존성을 수동 설치하는 경우(최소):
pip install gradio simple-aesthetics-predictor

# (선택) PyTorch 설치는 환경에 맞춰 별도로 진행
```

참고: `gradio`가 설치되지 않으면 `ModuleNotFoundError: No module named 'gradio'`가 발생합니다. 위 단계로 동기화/설치를 먼저 수행하세요.

### 실행 ▶️
```bash
# uv로 실행
uv run python app.py

# 또는 활성화된 가상환경에서 직접 실행
python app.py
```
실행 후 콘솔에 표시되는 로컬 URL을 브라우저로 열면 UI를 사용할 수 있습니다.

### 사용 방법 📘
- **단일 이미지**
  - 텍스트 박스에 로컬 이미지 경로 입력 또는 이미지 파일 드래그앤드롭
  - [점수 계산] 클릭 → 0~10 범위의 점수 출력
- **폴더 평균**
  - 텍스트 박스에 이미지가 들어있는 폴더 경로 입력
  - [평균 계산] 클릭 → 진행률/현재 평균이 순차 업데이트
- **하위 폴더 샘플링**
  - 텍스트 박스에 베이스 폴더(예: artists) 경로 입력
  - 폴더당 샘플 이미지 수, (옵션) 시드를 설정 후 [샘플링 평균 계산]
  - 테이블/JSON/JSON 파일 다운로드 제공

주의: 브라우저 제약으로 “폴더 자체” 드래그앤드롭 입력은 지원하지 않습니다. 폴더는 경로를 텍스트로 입력하세요.

### 프로그래밍 방식 사용
UI 없이 코드에서 직접 호출할 수도 있습니다.

```python
from app.services.aesthetic_scorer import AestheticScorer
from app.usecases.score_single import score_single_image, score_directory_average
from app.usecases.score_hierarchical_sample import sample_folder_scores, results_to_json

scorer = AestheticScorer()

# 단일 이미지
score = score_single_image("/path/to/image.jpg", scorer)

# 폴더 평균(스트리밍)
for progress, partial_avg in score_directory_average("/path/to/folder", scorer):
    print(progress.current, progress.total, partial_avg)

# 하위 폴더 샘플링 평균(스트리밍)
for prog, partial in sample_folder_scores("/path/to/base_dir", scorer, sample_size=10, seed=42):
    print(prog.current_folder_index, prog.total_folders, prog.current_folder_name)
    if partial is not None:
        print(results_to_json(partial))
```

### 모델/성능 ⚙️
- 기본 CLIP 기반 미적 점수 예측 모델: `shunk031/aesthetics-predictor-v1-vit-large-patch14`
- 가능한 경우 GPU(CUDA) 또는 macOS MPS를 자동 사용합니다. 메모리 여유가 부족하면 CPU로 전환하세요.

### 문제 해결(Troubleshooting) 🧪
- `No module named 'gradio'`: `pip install gradio` 실행
- 모델 다운로드가 느림: 네트워크 상태를 확인하거나 사전 다운로드/캐시를 활용
- 폴더 평균/샘플링 결과가 0: 폴더 내 이미지 확장자(`.jpg/.jpeg/.png/.bmp/.tiff/.webp`) 확인
- macOS MPS 가속이 동작하지 않음: 최신 PyTorch + macOS 12.3+ 필요. CPU로 강제하고 싶으면 `AestheticScorerConfig(device="cpu")` 사용



