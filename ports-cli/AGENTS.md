# L3 AGENTS.md

이 문서는 이 하위 프로젝트에 적용되는 지침이다.
상위 저장소 지침인 `../AGENTS.md`와 그보다 상위의 글로벌 선언인 `../../AGENTS.md`를 먼저 읽는다.
상위 지침과 충돌하면 이 파일의 프로젝트 고유 지침을 우선한다.
단, 상위의 secret, 브랜치, force push, 시스템 설정 관련 절대 원칙은 이 파일로 완화하지 않는다.

## 프로젝트 목적

`ports-cli`는 macOS에서 현재 listening 중인 TCP 포트와 소유 프로세스를 한눈에 보여주는 CLI다.
터미널에서 `ports`를 실행하면 `lsof`와 `ps` 정보를 바탕으로 compact table 또는 JSON을 출력한다.

## 범위

- macOS 전용 도구로 유지한다.
- 다른 OS 지원 코드는 추가하지 않는다.
- package bin 이름은 `ports`로 유지한다.
- 포트 수집은 `/usr/sbin/lsof`, 프로세스 명령줄 수집은 `/bin/ps`를 기준으로 한다.
- 사람이 읽는 기본 출력과 `--json` 출력은 모두 깨지지 않게 유지한다.

## 구조

- `bin/ports.js`: CLI 진입점.
- `src/args.js`: CLI 옵션 파싱과 help text.
- `src/cli.js`: 실행 흐름, 출력 모드 선택, 에러 처리.
- `src/lsof.js`: macOS `lsof -F` 출력 수집과 파싱.
- `src/processes.js`: `ps` 출력에서 PID별 command line 수집.
- `src/listeners.js`: socket record를 포트 단위 listener로 요약.
- `src/render.js`: terminal table 렌더링.
- `scripts/build.js`: `esbuild` 기반 단일 실행 파일 생성.
- `test/*.test.js`: Node.js built-in test runner 기반 단위 테스트.

## 명령어

의존성 설치:

```bash
npm install
```

테스트:

```bash
npm test
```

빌드:

```bash
npm run build
```

전체 확인:

```bash
npm run check
```

빌드 산출물 실행:

```bash
./dist/ports
./dist/ports --no-color
./dist/ports --json
./dist/ports --wide
```

개발 중 전역 명령 연결:

```bash
npm link
ports
```

## 구현 원칙

- `lsof` 일반 표 출력보다 `-F` field output을 우선 사용한다.
- shell command 호출은 `execFile` 기반을 유지하고 shell interpolation이 필요한 구조로 바꾸지 않는다.
- 새 option은 `src/args.js`에서 파싱하고 `renderHelp()`에 함께 반영한다.
- 출력 column, 색상, terminal width 처리는 `src/render.js` 안에서 유지한다.
- 파싱 로직은 문자열 fixture 기반 테스트를 먼저 보강한다.
- IPv4/IPv6 중복 listener는 같은 PID/port/process 단위로 묶는다.
- table 출력은 좁은 terminal에서도 주요 열이 보이도록 유지한다.
- 새 dependency는 CLI 배포 크기와 설치 단순성을 기준으로 보수적으로 판단한다.

## 검증 기준

- 파서, 요약, 렌더링, 옵션 처리는 단위 테스트로 검증한다.
- CLI 동작 변경 시 `npm run check`를 통과시킨다.
- 실제 macOS 포트 조회가 바뀌면 `./dist/ports --no-color`를 실행해 표 출력을 확인한다.
- JSON schema에 해당하는 key를 바꾸면 `--json` 출력 소비 가능성을 함께 점검한다.

실제 listener smoke test가 필요하면 임시 서버를 띄운 뒤 출력에 포트와 URL이 포함되는지 확인한다.

```bash
python3 -m http.server 8765 >/tmp/ports-cli-smoke.log 2>&1 &
SERVER_PID=$!
./dist/ports --no-color
./dist/ports --json
kill "$SERVER_PID"
```

## 산출물 관리

- `dist/`와 `node_modules/`는 커밋하지 않는다.
- `package-lock.json`은 dependency 재현성을 위해 함께 갱신한다.
- `bin/ports.js`는 직접 실행 가능한 파일 모드를 유지한다.

## README 반영 기준

- 사용자에게 보이는 option, output column, 설치 또는 실행 방식이 바뀌면 `README.md`도 함께 갱신한다.
- 내부 구조만 바뀌고 CLI 사용법이 그대로이면 `README.md` 갱신은 생략할 수 있다.

## 주의사항

- 포트 kill, 프로세스 종료, macOS 시스템 설정 변경 기능은 이 프로젝트 범위가 아니다.
- 사용자의 실제 실행 프로세스 정보가 출력될 수 있으므로 테스트 로그나 문서에 민감한 command line을 붙여 넣지 않는다.
- 브랜치 생성, force push, secret 취급 규칙은 상위 지침을 따른다.
