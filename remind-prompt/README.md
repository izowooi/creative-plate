# Remind Prompt

실행할 프롬프트, 실행할 AI 세션/프로젝트, 날짜를 등록하면 웹 대시보드에 계속
보관하고 정해진 시각부터 Slack으로 알려 주는 local-first 리마인더다.

Jenkins나 Slack `/remind`에 reminder 하나씩 흩어 놓지 않고, SQLite를 단일 원본으로
사용한다. 웹앱과 worker가 같은 상태를 보기 때문에 Mac이 잠들거나 process가
재시작되어도 overdue reminder를 다시 찾는다.

## 주요 기능

- `1시간`, `1일`, `1주`, `1개월` 뒤 또는 정확한 local datetime으로 등록
- prompt, project, 넣을 session/URL, 출처를 한곳에 보관하고 한 번에 복사
- `확인`과 `완료` 분리
  - 확인: Slack 재알림만 중지하고 할 일은 유지
  - 완료: reminder 종료
- 미루기, 일정/내용 수정, 취소, 재열기, Slack 실패 수동 재시도
- 미확인 reminder를 기본 24시간 간격으로 다시 알림
- Slack Incoming Webhook의 429 `Retry-After`, network/5xx exponential backoff 처리
- SQLite outbox/lease로 process 재시작과 실수로 실행한 복수 worker 복구
- Markdown summary를 자동 등록하지 않고 후보로만 안전하게 미리보기
- notification delivery 및 상태 변경 audit history 저장
- SQLite Online Backup API를 사용하는 일관된 backup command

## 빠른 시작

요구 사항은 Python 3.11+와 [uv](https://docs.astral.sh/uv/)다.

```bash
cd /Users/izowooi/git/creative-plate/remind-prompt
uv sync
install -m 600 .env.example .env
```

`.env`의 `REMIND_PROMPT_SLACK_WEBHOOK_URL`에 Slack Incoming Webhook URL을 넣는다.
실제 `.env`와 webhook URL은 secret이므로 Git에 넣지 않는다. Webhook을 비워 두어도
웹 대시보드는 정상 동작하며 overdue reminder를 계속 보여 준다.

```bash
uv run --env-file .env remind-prompt run
```

- `cwd`: `/Users/izowooi/git/creative-plate/remind-prompt`
- 실행 command: `uv run --env-file .env remind-prompt run`
- URL: <http://127.0.0.1:8765>
- API 문서: <http://127.0.0.1:8765/api/docs>

`run`은 web과 worker를 한 process에서 함께 실행한다. 운영 중 `.env`를 수정했다면
process를 재시작해야 새 설정이 적용된다.

## 사용 흐름

1. `새 리마인더`에서 title, 실행할 prompt, 넣을 곳을 입력한다.
2. `1일 뒤`, `1주 뒤`, `1개월 뒤` 또는 정확한 시각을 선택한다.
3. 화면에 표시된 절대 시각과 timezone을 확인하고 저장한다.
4. due 시각이 되면 dashboard에서 overdue로 유지되고 Slack message가 전송된다.
5. message를 봤지만 아직 실행하지 않았다면 `확인`, 나중에 다시 볼 때는 `미루기`,
   prompt 실행까지 끝났다면 `완료`를 누른다.

`1일`과 `1주`는 해당 timezone에서 같은 wall-clock time을 유지한다. `1개월`은
calendar month이며 없는 날짜는 말일로 보정한다. 예를 들어 1월 31일에서 한 달 뒤는
2월 28일 또는 29일이다. DST로 존재하지 않는 시각은 거부하고, 두 번 존재하는 시각은
어느 occurrence인지 선택하게 한다.

## Slack 설정

가장 간단한 개인용 구성이므로 Incoming Webhook 한 개를 사용한다.

1. Slack app을 만들고 `Incoming Webhooks`를 활성화한다.
2. `Add New Webhook to Workspace`에서 reminder를 받을 channel을 선택한다.
3. 발급된 URL을 `.env`의 `REMIND_PROMPT_SLACK_WEBHOOK_URL`에만 저장한다.
4. app을 재시작하고 `uv run --env-file .env remind-prompt doctor`로 설정 여부를 확인한다.

Incoming Webhook은 설치할 때 선택한 channel로 고정된다. reminder별 channel이나 DM이
필요해지면 이후 `chat.postMessage` adapter를 추가할 수 있다. Slack 설정과 오류 의미는
[Slack Incoming Webhooks 공식 문서](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks)를
참조한다.

Slack에는 prompt가 기본 최대 1,200자까지 표시된다. private channel 사용을 권장한다.
표시하지 않으려면 아래처럼 설정한다.

```dotenv
REMIND_PROMPT_SLACK_PROMPT_MAX_CHARS=0
```

## Markdown summary 가져오기

기존 task summary는 date가 대부분 과거 작업 이력이고 reminder 표현도 일정하지 않다.
그래서 importer는 action과 trigger가 함께 있는 문장만 후보로 만들며, DB에 자동 저장하거나
Slack으로 보내지 않는다.

웹의 `Markdown 가져오기`에서 `.md` file 또는 folder를 고르면 browser가 내용을 local
app으로 보내 후보를 보여 준다. 날짜가 모호하거나 `다음 sync 전`, `7개 완료 후` 같은
event/count 조건이면 반드시 날짜와 destination을 직접 확인해야 한다.

CLI로 local-only preview를 볼 수도 있다.

```bash
uv run --env-file .env remind-prompt scan /Users/izowooi/git/t1/task-summaries/2026/08
uv run --env-file .env remind-prompt scan --json /path/to/summary.md
```

CLI도 reminder를 생성하지 않는다. source file은 수정하지 않으며 secret/PII로 보이는
일부 text는 preview에서 redaction한다.

## Process 운영

### 한 process로 운영 — 권장

```bash
uv run --env-file .env remind-prompt run
```

### Web과 worker 분리

```bash
uv run --env-file .env remind-prompt serve
uv run --env-file .env remind-prompt worker
```

SQLite transaction과 delivery unique key가 복수 worker의 논리 중복을 막는다. 다만 Slack이
message를 수락한 직후 응답 전에 process가 죽는 경계에서는 exactly-once를 보장할 수 없다.
리마인더는 누락보다 드문 중복이 낫기 때문에 전송 보장은 at-least-once다.

### Jenkins/cron에서 한 번씩 실행

이미 상시 Jenkins가 있다면 reminder별 job을 만들지 말고, 하나의 job에서 다음 command를
매분 또는 5분마다 실행한다. concurrent build는 비활성화한다.

```bash
cd /Users/izowooi/git/creative-plate/remind-prompt
uv run --env-file .env remind-prompt worker --once
```

web dashboard는 별도로 `serve`해야 한다. 동적 reminder의 수정·미루기·완료 상태 때문에
Jenkins는 scheduler trigger로만 쓰고 SQLite/app을 system core로 유지한다.

## Supabase schema

요청한 Supabase project `elufbvcnhitoksoofbir`에는 다음 table을 migration으로 생성했다.

- `rp_reminders`
- `rp_deliveries`
- `rp_reminder_events`
- `rp_worker_state`

재현 가능한 SQL은
`supabase/migrations/20260815123000_create_rp_reminder_schema.sql`에 있다. 네 table 모두
RLS를 활성화했고 client policy는 의도적으로 만들지 않았다. prompt가 담기는 table을
publishable/anonymous key에 노출하지 않기 위해서다. 현재 실행 app은 offline과 network
장애에도 동작하도록 SQLite를 사용하며, 이후 server-side Supabase adapter를 연결할 때는
service-role credential을 environment/secret store에서만 주입해야 한다.

### macOS launchd

항상 실행하려면 `deploy/com.remind-prompt.plist.example`의 placeholder를 실제 경로로
바꿔 `~/Library/LaunchAgents/com.remind-prompt.plist`에 둔다. 이 저장소에서는 사용자
승인 없이 launchd 설정을 설치하거나 변경하지 않는다.

LaunchAgent는 로그인 session에서 동작하며 Mac이 꺼져 있거나 잠든 동안 Slack을 보낼 수는
없다. 다시 깨어나면 overdue scan이 catch-up message 한 건을 보낸다.

## 운영 command

```bash
# secret 값을 출력하지 않는 상태 점검
uv run --env-file .env remind-prompt doctor

# worker를 한 번만 실행
uv run --env-file .env remind-prompt worker --once

# 활성 DB의 일관된 backup 생성; 기존 file은 덮어쓰지 않음
uv run --env-file .env remind-prompt backup ./backups/remind-prompt-$(date +%F).db

# 전체 test와 lint
uv run pytest
uv run ruff check src tests
```

## 데이터와 보안

- 기본 DB: `./data/remind-prompt.db` (`.gitignore` 대상)
- DB와 `backup` command로 만든 file permission은 owner-only `0600`
- bind address: `127.0.0.1:8765`
- app에는 built-in login이 없다. `0.0.0.0`에 bind하거나 외부에 공개하려면 authenticated
  reverse proxy를 먼저 둔다.
- webhook URL은 environment에서만 읽고 DB, HTML, log, audit event에 저장하지 않는다.
- prompt body도 audit event나 application log에 복제하지 않는다.
- SQLite backup은 실행 중인 DB file을 단순 복사하지 말고 제공된 `backup` command를 쓴다.

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---:|---|
| `REMIND_PROMPT_DATABASE_PATH` | `./data/remind-prompt.db` | SQLite DB path |
| `REMIND_PROMPT_TIMEZONE` | `Asia/Seoul` | 기본 IANA timezone |
| `REMIND_PROMPT_SLACK_WEBHOOK_URL` | 비어 있음 | Slack secret webhook URL |
| `REMIND_PROMPT_BASE_URL` | `http://127.0.0.1:8765` | Slack message의 dashboard link |
| `REMIND_PROMPT_HOST` | `127.0.0.1` | web bind host |
| `REMIND_PROMPT_PORT` | `8765` | web port |
| `REMIND_PROMPT_POLL_INTERVAL_SECONDS` | `30` | due scan interval |
| `REMIND_PROMPT_FOLLOW_UP_HOURS` | `24` | 확인 전 재알림 간격 |
| `REMIND_PROMPT_SLACK_PROMPT_MAX_CHARS` | `1200` | Slack prompt preview 길이; `0`은 숨김 |
