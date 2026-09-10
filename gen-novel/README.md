# gen-novel — 매일 한 편을 위한 소설 작업실

한국어로 요청하면 AI가 관련 설정을 찾아 초안을 쓰고, 작가가 퇴고한 회차만 다음 집필의 기억으로 남기는 작업실입니다.
처음부터 방대한 세계관을 만들지 않습니다. **주인공의 욕망 + 관계 + 시작 장소 + 첫 사건**으로 시작합니다.

## 모바일 웹앱으로 읽기

[책갈피 웹앱](web/README.md)은 Next.js + Tailwind로 만든 소설 뷰어입니다.
**모바일·맥북 접속: https://gen-novel-reader.izowooi.workers.dev**
원고는 fresh-mint Supabase의 gn_ 테이블에 동기화되며 Git push 후 최신 회차를 읽을 수 있습니다.
처음이라면 [매일 집필하는 법](docs/daily-writing.md)부터 읽어 주세요.
`web/`에서 `npm ci` 후 `npm run dev`를 실행하면 http://localhost:3100 에서 읽을 수 있습니다.
같은 Wi-Fi의 휴대폰에서는 컴퓨터의 LAN IP와 3100 포트를 사용합니다.
서재·회차 목록·글자 크기·줄 간격·배경색·읽던 위치 저장을 지원합니다. 로컬 개발은 Git 원고, 운영 사이트는 DB를 읽습니다.
`web/out/`과 읽기 API Worker를 함께 배포했습니다. [DB 동기화와 배포 안내](docs/supabase-sync.md)를 참고하세요.

## 지금 할 일

[작가 인터뷰와 답변](interviews/01-author.md)을 반영한 [작품 색인](local/story/index.md)과
[1화 초안](local/runs/ep001-v1/draft.md)을 읽을 수 있습니다.
첫 화는 퇴고 전 초안이며 회차 확정과 공개 저장은 별개입니다.

2026-09-09 사용자가 학술 목적으로 작품·인터뷰의 Public 공개를 승인했습니다.
작품 설정·기획·초안·검토·인터뷰·프롬프트와 응답 기록을 기존 공개 모노레포에서 추적합니다.
이 공개 결정은 기존 안내의 Git 제외·공개 보류 내용을 대체합니다.
과거 대화와 context/manifest는 당시 기록으로 보존하며 현재 정책은 이 안내를 따릅니다.

## 매일 쓰는 방법

아침에는 이 프로젝트를 연 대화에서 다음처럼 말하면 됩니다.

> 다음 회차를 써 줘. 오늘은 주인공이 사소한 약속 때문에 중요한 일을 늦추는 이야기면 좋겠어.
> 직전 확정본에 이어 쓰고, 저녁에 읽을 초안과 검토 결과를 남겨 줘.

저녁에는 마음에 들지 않는 문장이나 장면을 말해 주세요. AI는 수정 전 버전을 보존하고 새 버전과 기억 변경안을 만듭니다.
마음에 들면 “이 버전의 원고와 기억 변경안을 확정해 줘”라고 말합니다. 다음 날은 그 확정본에서 이어집니다.
자세한 예시는 [아침 프롬프트](prompts/morning.md), [저녁 프롬프트](prompts/evening.md)를 참고하세요.

사용자가 터미널 명령을 외울 필요는 없습니다. 아래 명령은 AI가 작업할 때와 수동 점검할 때 사용합니다.
이 프로그램 자체는 LLM을 호출하지 않습니다. 현재 대화의 AI가 실제 기획·집필·퇴고를 수행합니다.
아침에 작업을 요청하면 진행되지만 컴퓨터 종료 뒤 실행이나 매일 예약 실행은 설치되어 있지 않습니다.

## 실행과 검증

Python 3.11 이상, 추가 패키지나 API key 없이 동작합니다. cwd는 이 `gen-novel` 폴더입니다.

```bash
python3 novel.py status
python3 novel.py check
python3 -m unittest discover -s tests -v
python3 novel.py search '약속'
python3 novel.py start day-001 --brief-file local/today.md --include hero heroine
# 생성된 local/runs/day-001/context.md를 읽고 AI가 draft/review/summary/state.md를 작성
# 작가가 원고와 기억 변경안을 확인한 이후에만:
python3 novel.py approve day-001 --approval '작가가 day-001 원고와 기억 변경안을 확정함'
```

`local/today.md`는 오늘 요청을 저장한 UTF-8 파일입니다. 없는 파일을 자동 생성하지 않습니다.
이 저장소를 clone하면 실제 작품 설정인 `local/story/`도 함께 받아집니다. `init`을 다시 실행할 필요가 없습니다.
실제 작품 자료가 없는 새 작업실에서만 `python3 novel.py init`으로 기본 설정을 복사합니다.
`story/`는 배포용 템플릿입니다. `local/story/`가 없을 때만 CLI가 템플릿을 읽습니다.
`start`는 원고를 자동 생성하지 않으며, 비어 있는 산출물로 `approve`하면 실패합니다.
`--include`는 lore ID, `--recall 2 7`은 관련 과거 확정 회차입니다. 필수 설정과 의존 lore는 항상 함께 읽습니다.
출력 자료 묶음은 기본 60,000 UTF-8 bytes로 제한합니다. 토큰 수와 같지 않으며 전체 모델 context 용량을 뜻하지 않습니다.

## 파일 안내

| 경로 | 역할 |
|---|---|
| `AGENTS.md` / `story/AGENTS.md` | 작업 운영 / 작품 자료의 더 구체적인 규칙 |
| `interviews/01-author.md` | 한 번에 답하는 작가 인터뷰 |
| `story/index.json` | lore ID, 파일 경로, 키워드, 필수 여부, 관련 ID |
| `story/core`, `characters`, `world` | 초기 설정과 인물 카드 |
| `story/state.md` | 첫 회차 전 상태 |
| `local/runs/<id>/` | 요청·선택 자료·초안·검토·요약·다음 상태·설정 변경안 |
| `local/final/000001/` | 작가가 확정한 회차와 기억 snapshot |
| `local/journal/` | 모든 요청 원문과 응답 요약, 회차 밖의 기획 대화도 포함 |
| `docs/workflow.md` | 실제 집필·퇴고·확정·장기 기억 운영 절차 |
| `docs/tools.md` | 모델/서드파티 선택과 현재 구현 범위 |

`local/`이라는 기존 경로명은 유지하지만 승인된 Markdown/JSON 작품 자료는 Git에 포함합니다.
인증 정보·환경 파일·개인키·임시 파일은 제외하고, 새 파일은 stage 전에 검토합니다.
도구·기본 템플릿·작품을 Git으로 보관합니다. [운영 절차](docs/workflow.md)의 백업 항목을 참고하세요.
별도 웹 서버·빌드·배포는 필요하지 않습니다.
