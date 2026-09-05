# L3 AGENTS.md

이 문서는 `gen-novel`에 적용한다.
상위 지침을 상속하고, 작품 자료는 `story/AGENTS.md`의 L4 지침을 함께 따른다.

## 프로젝트 목적

익숙한 검과 마법의 판타지에서 읽기 쉬운 사건과 감정의 여운을 쌓는 한국어 소설 집필 파이프라인을 운영한다.
작가는 아침에 방향을 주고 AI는 초안과 검토 자료를 작성하며, 작가는 저녁에 퇴고하고 최종본을 확정한다.
첫 설정을 모두 완성하기보다 필요한 인물·장소부터 쌓되, 작가의 핵심 창작 결정을 임의 확정하지 않는다.

## 기술 스택

- Python 3.11 이상과 standard library로 local CLI를 실행한다.
- Markdown에 작품·프롬프트·기록을, JSON에 lore index와 manifest를 저장한다.
- 집필은 현재 대화의 AI가 수행한다. CLI는 문맥 구성과 기록·검증·확정을 담당한다.

## 주요 파일

- `README.md`: 작가의 시작 경로와 사용 예시.
- `docs/workflow.md`: 인터뷰, 아침 집필, 저녁 퇴고, 확정과 기억 관리 절차.
- `novel.py`: CLI entrypoint.
- `interviews/01-author.md`: 한 번에 답할 작가 인터뷰. 답변은 `local/author-answers.md`에 보관한다.
- `story/index.json`: 안정적인 lore ID, 경로, 검색어, 필수 포함 여부와 의존성.
- `story/`: 배포용 기본 템플릿. `init` 후 실제 설정은 Git에서 제외되는 `local/story/`에서 편집한다.
- `prompts/`: 아침·저녁 요청과 집필 지시.
- `local/runs/`: 요청 원문, 문맥 packet, 초안, 검토, 요약, 다음 상태와 lore 변경안.
- `local/final/`: 확정 회차와 변경 감지용 hash.
- `local/journal/`: 사용자 요청 원문과 응답 요약.

## 실행

아래 명령은 프로젝트 폴더에서 AI가 실행한다.
작가에게 CLI 실행을 넘기지 말고 자연어 요청을 받아 파일 준비부터 집필까지 수행한다.
요청 파일은 사용자 원문을 보존하여 먼저 저장하고, 재시도에는 새 run ID를 사용한다.

```bash
python3 novel.py init  # 새 설치에만 실행; 기존 설정을 덮어쓰지 않는다.
python3 novel.py status
python3 novel.py search hero
python3 novel.py start ep001-v1 --brief-file local/brief.md --include hero heroine
python3 novel.py check
python3 novel.py log --request-file local/request.md --response-file local/response-summary.md
```

과거 사건이 필요한 경우 검색으로 회차를 찾고 다음과 같이 명시적으로 회상 자료를 포함한다.
이 예시는 확정 1회차가 있을 때 사용한다.

```bash
python3 novel.py start ep002-v1 --brief-file local/brief.md --recall 1 --budget-bytes 60000
```

확정 명령은 작가가 검토할 최종본과 변경안을 제시하고 명시적 확정 지시를 받은 뒤에만 실행한다.
승인 문구에는 해당 작가 지시를 그대로 전달하며 AI가 승인 문구를 만들어내지 않는다.

```bash
python3 novel.py approve ep001-v1 --approval "$author_approval"
```

## 테스트

```bash
python3 -m unittest discover -s tests -v
python3 novel.py check
```

코드 변경 시 관련 검증을 실행한다.
서사 품질과 작가 승인 여부는 자동 테스트 통과만으로 입증하지 않는다.

## 빌드

별도 compile 또는 package build는 없다.
소설 build는 문맥 준비 → 계획 → 집필 → 검토·수정 → 작가 퇴고 → 명시적 확정 순서로 진행한다.
문맥 준비 성공이나 빈 초안 생성만으로 집필 완료를 보고하지 않는다.

## 배포

현재 외부 배포나 무인 예약 실행은 정의하지 않는다.
회차 확정은 local 산출물 생성이며 외부 출판과 구분한다.

## 작업 규칙

- 작업 시작 시 `README.md`, `docs/workflow.md`, 관련 하위 지침과 작가 답변을 읽는다.
- 모든 사용자 요청을 기록한다. 민감정보를 제거한 뒤 처리 전에 원문을 local에 보존하고 응답 전에 요청과 응답 요약을 journal에 남긴다.
- 핵심 설정 질문은 인터뷰 파일에 모은다. 미응답 사항은 미확정으로 남기고 제안과 작가 확정값을 구분한다.
- ENTJ/INTJ/ENFP는 행동을 논의하는 단서로만 사용하고 인물의 배경·욕망·관계를 대신 확정하지 않는다.
- 준비한 `context.md`를 읽고 AI가 `plan.md`, `draft.md`, `review.md`, `summary.md`, `state.md`와 필요한 lore 변경안을 작성한다.
- 퇴고 요청은 기존 run을 보존하고 새 run을 준비하여 이전 초안을 참고해 수정한다. 원 요청과 packet을 덮어쓰지 않는다.
- 수정한 최종 문장을 기준으로 검토·요약·다음 상태·lore 변경안을 다시 맞춘다.
- 필수 수정이 해결됐을 때만 검토 첫 줄에 `verdict: PASS`를 기록한다. 이 표식은 작가 승인을 대신하지 않는다.
- 확정 전 다음 상태와 lore 변경안은 제안이다. 다음 회차는 승인된 release의 상태와 lore만 이어받는다.
- 유효 lore는 `local/story/` 초기 카드에 확정 release의 `updates/`를 회차 순서대로 덮어 적용한 값이다. 초기 카드만 읽어 최신 설정으로 오인하지 않는다.
- lore ID를 안정적으로 유지하고 새 카드는 index에 등록한다. 필요한 다른 카드 ID는 `requires`에 연결한다.
- index나 기반 설정이 바뀌면 새 run을 준비한다. 확정본·manifest·hash를 수정하여 검증을 우회하지 않는다.

## Mock / Dry-run 규칙

기본 흐름은 network와 API key 없이 동작한다.
현재 AI가 실제 작성하지 않은 원고를 모델 생성 결과로 보고하지 않는다.
테스트용 소설과 승인 문구는 격리된 임시 root에서만 사용하고 실제 작품의 정사에 섞지 않는다.

## 환경 변수

필수 환경 변수는 없다.
모델 표시명만으로 API model ID나 사용 가능 여부를 가정하지 않는다.

## 자주 깨지는 부분

- 미확정 설정과 AI의 제안을 정사로 취급하는 오류를 확인한다.
- 등장인물의 지식·시간·위치·소지품·부상·관계·열린 약속의 연속성을 검토한다.
- 검색은 index와 유효 lore, 확정 회차 요약을 활용하고 필요한 과거 원고를 추가로 읽는다. 검색 결과가 없으면 기억을 지어내지 않는다.
- packet 예산은 UTF-8 byte 수이며 정확한 모델 token 수가 아니다. 초과 시 자료 선택을 조정하고 자동 절단하지 않는다.
- 오래된 run의 기준 상태가 바뀌었으면 새 run에서 재검토한다.

## 수동 검증 방법

실제 작품을 확정하지 말고 격리된 테스트 자료로 준비·검토·확정·다음 회차 연결을 확인한다.
작품에서는 원고와 요약·상태의 일치, 필요한 lore 포함 여부, 누락된 복선과 작가 승인 근거를 직접 확인한다.

## 기타 관례

기존 작품은 감정·독서 경험의 참고로 사용하고 고유 이름·대사·장면을 복제하지 않는다.
매일 결과에는 초안 위치, 핵심 사건, 퇴고할 점과 아직 작가 결정이 필요한 사항을 짧게 남긴다.
