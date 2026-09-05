# gen-novel — 매일 한 편을 위한 소설 작업실

한국어로 요청하면 AI가 관련 설정을 찾아 초안을 쓰고, 작가가 퇴고한 회차만 다음 집필의 기억으로 남기는 작업실입니다.
처음부터 방대한 세계관을 만들지 않습니다. **주인공의 욕망 + 관계 + 시작 장소 + 첫 사건**으로 시작합니다.

## 지금 할 일

[작가 인터뷰](interviews/01-author.md)를 읽고, 답을 한 번에 대화로 보내 주세요.
이미 생각한 주인공의 배경을 자유롭게 길게 적어도 됩니다. AI가 답변을 기록하고 최소 설정과 첫 3~5화 기획안을 제안합니다.
이 저장소에는 아직 실제 작품의 첫 화가 없습니다. 인물 이름·과거·메시지를 임의 확정하지 않았습니다.

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
새 설치에서는 먼저 `python3 novel.py init`으로 기본 설정을 `local/story/`에 복사합니다.
이 작업실에는 초기화를 완료해 두었습니다. 실제 작품 설정은 `local/story/`를 편집하며 Git에서 제외됩니다.
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

`local/`은 Git에서 제외합니다. 프롬프트·개인 구상·소설 원고는 자동 push되지 않습니다.
도구와 기본 템플릿은 Git으로 보관합니다. 작품 백업은 [운영 절차](docs/workflow.md)의 백업 항목을 따르세요.
별도 웹 서버·빌드·배포는 필요하지 않습니다.
