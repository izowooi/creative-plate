# 대구 선거 Streamlit 대시보드

실시간으로 갱신되는 `data/daegu_election.csv`를 읽어 1위/2위 득표율, 득표수, 표차 추이를 보여준다.
가장 중요한 화면은 `표차 추이`이며, 시작 대비 표차가 줄었는지 늘었는지 함께 표시한다.

## 실행

```bash
cd /Users/izowooi/git/creative-plate/daegu-election-recorder
source .venv/bin/activate
streamlit run dashboard/streamlit_app.py
```

앱 사이드바에서 `실시간 수집 CSV` 또는 `스크린샷 보강 CSV`를 선택할 수 있다.
기본 자동 새로고침은 30초다.
프로젝트 설정은 기본 light theme로 고정되어 있다.
