# youtube-to-srt

YouTube URL(최대 10개)을 받아 오디오를 추출하고, 로컬 `faster-whisper`로 영어 SRT 자막을 생성하는 CLI.

## 설치

`uv`로 격리된 환경에서 실행합니다.

```bash
uv sync
```

## 사용법

### GUI (권장)

```bash
uv run youtube-to-srt-ui
# 브라우저에서 http://127.0.0.1:7860 접속
```

- URL 텍스트박스에 한 줄에 하나씩 최대 10개까지 붙여넣기
- 모드(extract/transcribe/all), Whisper 모델, 저장 폴더를 UI에서 선택
- 실행 버튼 → 실시간 진행 상태 테이블 갱신 → 완료 시 파일 다운로드 링크 제공
- 실행 중에는 버튼이 자동 비활성되어 중복 요청 방지

### CLI

세 가지 모드가 있으며 기본값은 **음성 추출만**(`extract`)입니다.

```bash
# 1) 음성만 추출 (기본) — audio/<video_id>.m4a 생성
uv run youtube-to-srt "https://www.youtube.com/watch?v=jNQXAC9IVRw"

# 2) 이미 추출된 오디오 파일을 SRT로 전사만
uv run youtube-to-srt --mode transcribe audio/jNQXAC9IVRw.m4a

# 3) 추출 + 전사 통합
uv run youtube-to-srt --mode all "https://www.youtube.com/watch?v=jNQXAC9IVRw"
```

### 여러 URL 배치 처리 (최대 10개)

CLI 인자와 `--urls-file` 파일을 섞어서 사용할 수 있습니다.

```bash
# 인자로 여러 개
uv run youtube-to-srt url1 url2 url3

# 파일에서 읽기 (한 줄에 하나, '#' 주석과 빈 줄 무시)
uv run youtube-to-srt --urls-file urls.example.txt

# 둘 조합
uv run youtube-to-srt --urls-file urls.txt url_extra
```

실패는 개별 작업 단위로 집계되며 다음 URL 처리는 계속됩니다. `zsh`에서는 `?` 및 `=`
때문에 URL을 꼭 따옴표로 감싸세요.

### 주요 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--mode` | `extract` | `extract` / `transcribe` / `all` |
| `--audio-dir` | `audio/` | 추출된 오디오 저장 폴더 |
| `--srt-dir` | `srt/` | 생성된 SRT 저장 폴더 |
| `--model` | `small` | faster-whisper 모델 이름 (`base`, `small`, `medium`, `large-v3` ...) |
| `--language` | `en` | 전사 언어 코드 |

## 테스트

단위 테스트만 (빠름, 네트워크 불필요):

```bash
uv run pytest
```

실제 네트워크 + Whisper 모델을 사용하는 통합 테스트까지:

```bash
uv run pytest -m "integration or not integration"
```

## 모듈 구조

| 파일 | 역할 |
| --- | --- |
| `src/youtube_to_srt/core.py` | CLI·UI 공유 로직 (Mode enum, URL 텍스트 파서) |
| `src/youtube_to_srt/cli.py` | CLI 인자 파싱 및 진입점 |
| `src/youtube_to_srt/extractor.py` | yt-dlp 기반 오디오 추출 |
| `src/youtube_to_srt/transcriber.py` | faster-whisper 백엔드 + SRT 저장 |
| `src/youtube_to_srt/srt_formatter.py` | Segment → SRT 문자열 |
| `src/youtube_to_srt/pipeline.py` | 배치 오케스트레이터 (`iter_batch`, `run_batch`) |
| `src/youtube_to_srt/ui_handlers.py` | Gradio 무의존 순수 핸들러 (TDD 대상) |
| `src/youtube_to_srt/ui.py` | Gradio Blocks 조립 및 진입점 |

## 향후 계획: OpenAI API 백엔드 (미구현)

`TranscriberBackend` 프로토콜(`src/youtube_to_srt/transcriber.py`)이 이미
백엔드 추상화로 설계되어 있어, 로컬 실행 대신 OpenAI Whisper API를 쓰고 싶을 때
다음과 같이 확장하면 됩니다.

1. `OpenAIWhisperBackend` 클래스를 `transcriber.py`에 추가 — `transcribe(audio_path)`
   안에서 `openai` SDK로 `audio.transcriptions.create(..., response_format="verbose_json")`
   을 호출하고 응답 `segments`를 `Segment`로 매핑.
2. CLI에 `--backend {local,openai}` 플래그 추가하고 `OPENAI_API_KEY` 환경변수 확인.
3. `cli.main()` 에서 분기하여 백엔드를 선택 (이미 `make_transcribe_fn` 으로 주입식 구성).

요청이 올 때 구현합니다.
