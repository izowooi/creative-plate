---
name: video-downloader-extension-orchestrator
description: "Playwright MCP로 사이트를 분석하여 영상 다운로드 Chrome Extension을 자동 생성하는 하이브리드 파이프라인 오케스트레이터. 트리거: '영상 다운로드 익스텐션 만들어줘', '크롬 익스텐션 만들어', '사이트 분석해서 익스텐션', '영상 다운로드 크롬 플러그인', URL과 함께 '익스텐션' 또는 '다운로드'. 후속 작업: '다시 실행', '수정', '업데이트', '보완', '익스텐션 고쳐줘', '분석 다시', '이전 결과 기반으로', '결과 개선', '익스텐션 수정해줘'. 사용자가 URL을 제공하고 영상 다운로드 또는 크롬 익스텐션을 언급하면 반드시 이 스킬을 사용할 것."
---

# Video Downloader Extension Orchestrator

Playwright MCP로 사이트를 분석하고 Chrome Extension을 자동 생성하는 하이브리드 파이프라인.

## 실행 모드: 하이브리드

| Phase | 모드 | 에이전트 |
|-------|------|---------|
| 0-A: 컨텍스트 확인 | 인라인 | — |
| 0-B: Playwright MCP 확인 | 인라인 | — |
| 1: 사이트 분석 | 서브 에이전트 | site-analyzer |
| 2: 전략 결정 | 서브 에이전트 | video-strategy-analyst |
| 3: 익스텐션 구현 | 에이전트 팀 (3명) | extension-manifest/content/background-engineer |
| 4: QA 검증 | 서브 에이전트 | qa-validator |

## 에이전트 구성

| 에이전트 파일 | 역할 | 출력 |
|-------------|------|------|
| `.claude/agents/site-analyzer.md` | Playwright 분석 | `_workspace/01_site-analyzer_report.json` |
| `.claude/agents/video-strategy-analyst.md` | 전략 결정 | `_workspace/02_video-strategy_spec.json` |
| `.claude/agents/extension-builder.md` (role: manifest) | manifest.json | `extensions/{site}/manifest.json` |
| `.claude/agents/extension-builder.md` (role: content) | content_script.js | `extensions/{site}/content_script.js` |
| `.claude/agents/extension-builder.md` (role: background) | background.js + popup | `extensions/{site}/background.js`, `popup.*` |
| `.claude/agents/qa-validator.md` | QA 검증 | `_workspace/05_qa-validator_report.md` |

## 워크플로우

### Phase 0-A: 컨텍스트 확인 (후속 작업 지원)

1. `_workspace/` 디렉토리 존재 여부 확인
2. 실행 모드 결정:
   - `_workspace/` 미존재 → **초기 실행**, Phase 0-B로 진행
   - `_workspace/` 존재 + 특정 파일 수정 요청 → **부분 재실행**: 해당 에이전트만 재호출
   - `_workspace/` 존재 + 새 URL 제공 → **새 실행**: 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동 후 Phase 0-B 진행

### Phase 0-B: Playwright MCP 동작 확인

1. `~/.claude/settings.json` 읽기 → `mcpServers.playwright` 존재 여부 확인
2. **미설정 시** `update-config` 스킬 호출하여 아래 설정 추가:
   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "npx",
         "args": ["@playwright/mcp@latest"],
         "type": "stdio"
       }
     }
   }
   ```
3. **MCP 동작 검증** (https://example.com으로 테스트):
   - `browser_navigate("https://example.com")` → 에러 없이 응답 확인
   - `browser_screenshot()` → 이미지 데이터 반환 확인
   - `browser_network_requests()` → 배열 응답 확인
   - `browser_close()` → 정리
4. **검증 실패 처리:**

   | 오류 | 원인 | 처리 |
   |------|------|------|
   | `tool not found` | 재시작 필요 | 사용자에게 Claude Code 재시작 안내 |
   | `spawn npx ENOENT` | Node.js 미설치 | `brew install node` 안내 |
   | `Timeout` | Playwright 바이너리 미설치 | `npx playwright install chromium` 안내 |
   | 도구명 오류 | 버전 변경 | `npx @playwright/mcp@latest --help`로 실제 도구명 확인 안내 |

### Phase 1: 작업 준비

1. 사용자 입력에서 대상 URL 확인 (없으면 사용자에게 요청)
2. URL에서 사이트명 추출 (예: `streaming.example.com` → `example`)
3. `_workspace/` 디렉토리 생성

### Phase 2: 사이트 분석 (서브 에이전트)

**실행 모드:** 서브 에이전트

```
Agent(
  subagent_type: "site-analyzer",
  model: "opus",
  prompt: "
    대상 URL: {url}
    사이트명: {site_name}
    playwright-site-analyzer 스킬을 사용하여 영상 스트리밍 구조를 분석하라.
    결과를 _workspace/01_site-analyzer_report.json에 저장하라.
  "
)
```

완료 조건: `_workspace/01_site-analyzer_report.json` 생성 확인

**이상 케이스:**
- `drm_detected: true` → 사용자에게 안내 후 워크플로우 중단
- `status: "partial"` → 경고 표시 후 계속 진행
- 로그인 필요 → 사용자에게 자격증명 또는 쿠키 내보내기 안내

### Phase 3: 전략 결정 (서브 에이전트)

**실행 모드:** 서브 에이전트

```
Agent(
  subagent_type: "video-strategy-analyst",
  model: "opus",
  prompt: "
    _workspace/01_site-analyzer_report.json을 읽고 최적 다운로드 전략을 수립하라.
    결과를 _workspace/02_video-strategy_spec.json에 저장하라.
  "
)
```

완료 조건: `_workspace/02_video-strategy_spec.json` 생성 + `feasible: true` 확인

`feasible: false`이면 `abort_reason`을 사용자에게 전달 후 중단.

### Phase 4: 익스텐션 구현 (에이전트 팀)

**실행 모드:** 에이전트 팀

1. 팀 생성:
   ```
   TeamCreate(
     team_name: "extension-team",
     members: [
       {
         name: "extension-manifest-engineer",
         agent_type: "extension-builder",
         model: "opus",
         prompt: "
           역할: manifest-engineer.
           _workspace/02_video-strategy_spec.json을 읽고
           extensions/{site_name}/manifest.json을 생성하라.
           chrome-extension-builder 스킬을 사용한다.
           완료 후 extension-content-engineer에게
           확정된 host_permissions 목록을 SendMessage하라.
         "
       },
       {
         name: "extension-content-engineer",
         agent_type: "extension-builder",
         model: "opus",
         prompt: "
           역할: content-engineer.
           _workspace/02_video-strategy_spec.json을 읽고
           extensions/{site_name}/content_script.js를 생성하라.
           chrome-extension-builder 스킬을 사용한다.
           extension-manifest-engineer로부터 host_permissions 수신 후
           도메인 일치를 교차 검증하라.
         "
       },
       {
         name: "extension-background-engineer",
         agent_type: "extension-builder",
         model: "opus",
         prompt: "
           역할: background-engineer.
           _workspace/02_video-strategy_spec.json을 읽고
           extensions/{site_name}/background.js, popup.html, popup.js를 생성하라.
           chrome-extension-builder 스킬을 사용한다.
         "
       }
     ]
   )
   ```

2. 작업 등록:
   ```
   TaskCreate(tasks: [
     { title: "manifest.json 생성", assignee: "extension-manifest-engineer",
       description: "MV3 manifest, permissions, content_scripts, background 설정" },
     { title: "content_script.js 생성", assignee: "extension-content-engineer",
       description: "다운로드 버튼 삽입, background SW 메시지 발송, popup 응답" },
     { title: "background.js + popup 생성", assignee: "extension-background-engineer",
       description: "다운로드 로직, HLS/DASH 파싱 (전략에 따라), popup UI" }
   ])
   ```

3. 팀원들이 자체 조율하며 병렬 구현
4. 모든 작업 완료 확인 후 팀 정리: `TeamDelete("extension-team")`

### Phase 5: QA 검증 (서브 에이전트)

**실행 모드:** 서브 에이전트

```
Agent(
  subagent_type: "qa-validator",
  model: "opus",
  prompt: "
    extensions/{site_name}/ 디렉토리의 Chrome Extension을 검증하라.
    체크리스트: MV3 규정, 보안, DRM 코드 부재, 기능 논리 정합성.
    결과를 _workspace/05_qa-validator_report.md에 저장하라.
  "
)
```

**QA 결과 처리:**
- **PASS:** Phase 6로 진행
- **CONDITIONAL_PASS:** 이슈 목록 표시, 사용자가 수용 여부 결정
- **FAIL:** 해당 extension-builder 에이전트를 서브 에이전트로 재호출하여 수정 (최대 1회). 재검증 후에도 FAIL이면 사용자에게 에스컬레이션

### Phase 6: 정리 및 보고

1. `_workspace/` 디렉토리 보존 (감사 추적용)
2. 최종 보고:

```
## ✅ 생성 완료: {site_name} Chrome Extension

위치: extensions/{site_name}/
파일: manifest.json, content_script.js, background.js, popup.html, popup.js
전략: {strategy}
QA: PASS

### 설치 방법
1. Chrome → chrome://extensions/ 접속
2. 우상단 "개발자 모드" 토글 활성화
3. "압축해제된 확장 프로그램 로드" 클릭
4. extensions/{site_name}/ 폴더 선택
```

## 데이터 흐름

```
사용자 URL
  → Phase 0-B: Playwright MCP 동작 확인
  → Phase 2: site-analyzer → _workspace/01_site-analyzer_report.json
  → Phase 3: video-strategy-analyst → _workspace/02_video-strategy_spec.json
  → Phase 4: extension-team (3명 병렬)
      manifest-engineer  → extensions/{site}/manifest.json
      content-engineer   → extensions/{site}/content_script.js
      background-engineer→ extensions/{site}/background.js + popup.*
  → Phase 5: qa-validator → _workspace/05_qa-validator_report.md
  → Phase 6: 최종 보고
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| Playwright MCP 미설정 | update-config 스킬 호출 + 재시작 안내 |
| MCP 도구 호출 실패 | 오류 메시지 사용자 표시, 수동 설치 안내 |
| DRM 감지 | 즉시 중단, 이유 설명 |
| 로그인 필요 | 사용자에게 자격증명/쿠키 요청 |
| site-analyzer partial | 경고 후 계속 진행 |
| extension-builder 실패 | SendMessage로 다른 팀원에게 재생성 요청 |
| QA FAIL 2회 | 사용자에게 에스컬레이션 |

## 테스트 시나리오

### 정상 흐름 (HLS 사이트)

1. 사용자: "https://streaming.example.com/video/123 에서 영상 다운로드 익스텐션 만들어줘"
2. Phase 0-A: `_workspace/` 없음 → 초기 실행
3. Phase 0-B: playwright 미설정 → update-config 호출 → 동작 확인 성공
4. Phase 2: m3u8 URL + 쿠키 인증 구조 발견
5. Phase 3: "HLS + 쿠키 인증" 전략 결정
6. Phase 4: 3명이 병렬로 5개 파일 생성
7. Phase 5: QA PASS
8. 설치 안내 출력
9. 예상 산출물: `extensions/example/` 5개 파일

### 에러 흐름 — DRM 감지

1. Phase 2: site-analyzer가 Widevine EME API 호출 탐지
2. `drm_detected: true` 저장
3. 오케스트레이터 즉시 중단
4. 사용자에게: "이 사이트는 Widevine DRM으로 보호되어 있어 익스텐션 생성이 불가합니다."
