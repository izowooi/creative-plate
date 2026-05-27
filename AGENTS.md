# L2 AGENTS.md

이 문서는 `/Users/izowooi/git/creative-plate` 저장소 루트에 적용되는 지침이다.
상위 `/Users/izowooi/git/AGENTS.md`와 `~/.claude/CLAUDE.md`의 안전 규칙을 먼저 따른다.
하위 폴더에 별도 `AGENTS.md`가 있으면 그 지침을 더 구체적인 규칙으로 우선한다.
단, 상위의 secret, 브랜치, force push, 시스템 설정 관련 절대 원칙은 하위 지침으로 완화하지 않는다.

## 저장소 목적

`creative-plate`는 모험적이고 도전적인 R&D 프로젝트를 한 저장소에서 관리하는 모노레포다.
각 하위 폴더는 독립 실험 또는 도구로 취급한다.
루트에는 통합 package manager나 workspace 설정이 없으므로, 실행과 검증은 하위 프로젝트 단위로 판단한다.

## 구조

- `aesthetics_score/`: Gradio 기반 이미지 미적 점수 평가 도구.
- `auto_play/`: Python 자동 실행 실험 코드.
- `comfy-ui/`: ComfyUI 워크플로와 설치/실행 메모.
- `crawl-video/`: HLS 영상 다운로더, Chrome Extension, Claude Code 하네스.
- `fluffy-qr/`: Python QR 생성 실험.
- `gen_subtitle/`: 오디오 추출, 번역, 자막 생성 Python 스크립트.
- `pixel-palette/`: Next.js 기반 AI 이미지/영상 생성 웹앱.
- `pixel-parfait /`: Next.js 기반 AI 이미지 모델 비교 웹앱. 폴더명 끝 공백을 보존하고 shell에서 항상 quote한다.
- `ports-cli/`: macOS listening port 확인 CLI.
- `social-syrup/`: AI 이미지/텍스트 생성 후 SNS 업로드 파이프라인.
- `test_whisper/`: Whisper 관련 실험 산출물.
- `vision-pudding/`: OCR/비전 처리 Python 실험.
- `waffle-wisdom/`: Python/Flutter 기반 페르소나 또는 앱 실험.
- `youtube-to-srt/`: YouTube URL에서 로컬 Whisper 기반 SRT를 생성하는 CLI/UI 도구.

## 작업 범위

- 루트 작업은 저장소 전체에 영향을 줄 때만 수행한다.
- 특정 프로젝트 요청은 해당 하위 폴더 안에서 해결한다.
- 하위 프로젝트의 package/config/lockfile은 해당 프로젝트 소유로 본다.
- 루트의 `.gitignore`, `README.md`, `AGENTS.md` 변경은 전체 저장소 영향으로 본다.
- 루트 수준 dependency, workspace 설정, 공통 build script는 사용자가 명시적으로 요청한 경우에만 추가한다.
- 새 하위 프로젝트를 추가할 때는 기존 폴더와 목적이 겹치는지 먼저 확인한다.

## 작업 전 확인

1. 이 파일과 상위 `AGENTS.md`
2. 루트 `README.md`
3. 작업 대상 하위 폴더의 `AGENTS.md`
4. 작업 대상 하위 폴더의 `README.md` 또는 `readme.md`
5. 작업 대상 하위 폴더의 package/config 파일
6. 작업 대상 하위 폴더의 기존 테스트와 실행 스크립트

## 공통 운영 규칙

- 저장소 루트에는 공통 build/test 명령이 정의되어 있지 않다.
- 검증은 수정한 하위 프로젝트의 `README.md`, `package.json`, `pyproject.toml`, `pubspec.yaml`, `requirements.txt`를 기준으로 수행한다.
- 여러 하위 프로젝트를 동시에 수정하면 프로젝트별 변경 요약과 검증 결과를 분리한다.
- 한 하위 프로젝트의 dependency를 다른 하위 프로젝트에 전파하지 않는다.
- 공통 유틸은 실제로 2개 이상의 하위 프로젝트가 필요해진 뒤 제안한다.
- 하위 프로젝트의 명령이 문서와 config에서 서로 다르면 실제 config를 우선하고 차이를 보고한다.

## 로컬 서버와 포트

- 웹앱, Gradio, Streamlit, Next.js dev server를 실행한 경우 응답에 `cwd`, 실행 명령, URL 또는 port를 함께 남긴다.
- 검증용으로만 띄운 서버는 작업 종료 전에 종료한다.
- 사용자가 서버를 계속 켜 두라고 요청한 경우에만 유지한다.

## 루트 설정 변경 기준

다음 파일은 전체 저장소 운영에 영향을 줄 수 있으므로 변경 전후 영향 범위를 명시한다.

- `AGENTS.md`
- `README.md`
- `.gitignore`
- `.claude/commands/*`

루트에 CI/CD 파일은 현재 발견되지 않았다.
CI/CD를 새로 추가하는 작업은 저장소 전체 자동화로 보고 사용자 의도를 확인한다.

## 민감 파일

하위 프로젝트에 실제 `.env` 계열 파일이 존재할 수 있다.
내용을 읽거나 출력하지 말고, 커밋 대상에 포함하지 않는다.
샘플 파일인 `.env.example` 또는 `.env.local.example`만 안전한 템플릿으로 취급한다.

## 커밋 전 확인

- `git status --short --branch`로 현재 브랜치와 미추적 파일을 확인한다.
- 의도한 파일만 명시적으로 stage한다.
- 관련 없는 미추적 파일은 그대로 둔다.
- Git 브랜치 생성, force push, secret 취급 규칙은 상위 지침을 따른다.
