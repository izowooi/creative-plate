# Codex 작업 지시서: 네이버 대구 시·도지사 개표현황 수집기

## 목표
Playwright + Python으로 네이버 선거 페이지를 띄운 뒤, 사용자가 직접 대구 시·도지사 개표현황 화면까지 이동한다. 이후 프로그램은 5분마다 새로고침 버튼을 누르고, 화면의 숫자를 파싱해서 CSV에 누적 기록한다.

집계 대상은 스크린샷처럼 1위/2위 후보만이다.

## 작업 위치
사용자 Mac 기준:

```bash
mkdir -p ~/git/create-plate/daegu-election-recorder
cd ~/git/create-plate/daegu-election-recorder
```

이 압축 파일 내용을 위 폴더에 풀거나, 동일 구조로 생성한다.

## 설치
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
playwright install chromium
```

## TDD 실행
```bash
pytest
```

현재 테스트는 스크린샷에서 보이는 텍스트 기준으로 `parse_snapshot()`이 아래 값을 정확히 뽑는지 검증한다.

- 대구 개표율: 14.18
- 기준시각: 22:06
- 김부겸 득표율/득표수: 53.45 / 98735
- 추경호 득표율/득표수: 45.49 / 84035
- 표차: 14700

## 실행
```bash
python -m election_recorder.main --interval 300 --duration 120 --csv data/daegu_election.csv
```

실행하면 브라우저가 열린다. 사용자가 직접 네이버에서 원하는 대구 시·도지사 개표현황 화면까지 이동한 뒤 터미널에서 Enter를 누른다.

그 뒤 프로그램이 반복한다.

1. 새로고침 버튼 클릭
2. 1.5초 대기
3. body 텍스트 파싱
4. CSV 저장
5. 5분 대기

`--duration 0`을 지정하면 Ctrl+C로 종료할 때까지 계속 기록한다.
같은 `region + 기준시각`은 기본적으로 중복 저장하지 않는다.
중복도 모두 남기려면 `--duplicate-policy record`를 사용한다.
종료 시 `data/charts/` 아래에 득표율, 득표수, 표차 PNG 차트를 생성한다.
차트 생성을 끄려면 `--no-charts`를 사용한다.

## Streamlit 대시보드

실시간 수집 CSV를 보면서 표차가 줄어드는지 확인하려면 별도 터미널에서 실행한다.

```bash
streamlit run dashboard/streamlit_app.py
```

브라우저에서 `http://localhost:8501`을 연다.
사이드바에서 `실시간 수집 CSV` 또는 `스크린샷 보강 CSV`를 선택할 수 있고, 기본 30초마다 자동 새로고침한다.
대시보드는 `.streamlit/config.toml`에서 기본 light theme로 고정한다.

## CSV 컬럼
- collected_at
- region
- counted_rate_percent
- 기준시각
- first_rank
- first_candidate
- first_party
- first_vote_rate_percent
- first_votes
- second_rank
- second_candidate
- second_party
- second_vote_rate_percent
- second_votes
- vote_gap

## Codex에게 추가로 시킬 일
1. 실제 네이버 DOM에서 새로고침 버튼 selector가 안정적인지 수동 smoke test로 확인한다.
2. 실제 페이지 텍스트가 목업과 다르면 parser fixture를 추가하고 보강한다.
