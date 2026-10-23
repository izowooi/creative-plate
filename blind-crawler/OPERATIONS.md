# 블라인드 개인 보관함 운영

## 배포 대상

- 코드: `/Volumes/sn850x/git/creative-plate/blind-crawler`
- 데이터: `/Volumes/sn850x/blind-archive-data` (Git 밖)
- 접속: `http://192.168.50.173:5067` (집 안 LAN 전용, 열람 로그인 없음)
- PM2: `blind-archive`; 기존 5057/5058 서비스와 별개
- 수집: 블라블라, 썸·연애, 결혼생활, 토픽 베스트. 목록 10분 간격.
- 본문 요청 사이 5초. 새 글 우선. 댓글 확장은 별도 작업자로 처리.
- 첫 1시간은 10분, 하루까지 30분, 이후 6시간 간격 재방문. 기본 7일 이후 재방문 종료. 기존 보관본은 만료 없이 유지.
- 이미지·동영상·스크린샷은 저장하지 않음. 제목·본문·댓글·대댓글만 저장.

## 설치 및 업데이트

```sh
cd /Volumes/sn850x/git/creative-plate
git pull --ff-only
cd blind-crawler
/opt/homebrew/bin/python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
PATH=/opt/homebrew/bin:$PATH pm2 startOrRestart ecosystem.config.cjs
PATH=/opt/homebrew/bin:$PATH pm2 save
```

```sh
PATH=/opt/homebrew/bin:$PATH pm2 logs blind-archive --lines 40
curl http://127.0.0.1:5067/api/health
PATH=/opt/homebrew/bin:$PATH pm2 restart blind-archive
```

데이터 경로가 있는 외장 SSD를 마운트한 상태로 실행한다. 설정은 데이터 폴더의 `config.json`에서 바꾸고 PM2 프로세스를 재시작한다. `ingest-token`은 자동 생성되는 기기 전송 키이며 출력·Git 커밋·외부 공유하지 않는다. 웹의 연결 화면에서만 확인한다. 읽기에는 로그인하지 않지만 알림 전송에는 이 키를 사용한다. 외부 Tunnel이나 포트포워딩에 연결하지 않는다.

## 보존과 검증

- 게시글 ID로 식별하고 SHA-256으로 중복 버전을 제거한다.
- 원문이 `-펑-`으로 바뀌어도 기존 스냅샷을 덮어쓰지 않는다.
- 댓글이 줄어든 버전도 새로 보관하며 이전 댓글은 이전 버전에서 열람한다.
- 404/410은 접근 불가 관찰값이다. 계정 제한·파서 오류는 삭제로 단정하지 않는다.
- 검색은 이전 버전의 제목·본문·댓글도 포함한다. 한글 부분 검색은 LIKE를 사용한다.
- 댓글의 전체 개수와 확보 개수·더보기 잔여 여부로 coverage를 표시한다. 웹이 일부만 제공하면 전체 보존을 보장하지 않는다.
- HTML을 원문 그대로 렌더링하지 않고 텍스트 이스케이프한다. 광고 댓글을 제외한다.
- HTTP 403/429에서 해당 수집 작업자를 1시간 중지한다. 우회·계정 토큰 추출은 구현하지 않는다.
- 목록에 노출되기 전에 사라진 글, 최초 수집 전에 수정된 내용, 수집 사이에 생겼다 사라진 댓글은 복구할 수 없다.
- 지속 수집은 블라인드 약관상 허용 범위와 별개다. 개인 사용 허가를 플랫폼 허가로 간주하지 않는다.

## 로그인 후 자동 복구

`scripts/ensure-running.sh`와 `ecosystem.config.cjs`를 `~/Library/Application Support/blind-archive/`에 복사한다. 외장 SSD의 시작 스크립트를 launchd가 직접 읽으면 macOS 접근 제한에 걸릴 수 있어 시작 파일만 홈 폴더에 둔다. `scripts/dev.blindarchive.pm2.plist`를 `~/Library/LaunchAgents/`에 설치하고 `launchctl bootstrap gui/$(id -u)`로 등록한다. 로그인 시 및 5분마다 `ensure-running.sh`가 PM2 프로세스를 확인하고 중지된 경우만 시작한다. SSD가 마운트되기 전 실패한 경우 다음 확인 때 재시도한다. OS 재부팅 후 사용자 로그인 전 실행은 보장하지 않으며 자동 로그인 설정을 변경하지 않는다.

## 백업

```sh
.venv/bin/python scripts/backup.py /Volumes/sn850x/blind-archive-data
```

서버가 매일 자동으로 수행하며, 위 명령으로 수동 실행할 수도 있다. SQLite backup API로 일관된 복사본을 만들고 integrity_check를 수행한다. 요일별 7개를 순환 보관한다. 같은 SSD의 백업이므로 SSD 고장에 대비하려면 별도 디스크/다른 Mac에 이 백업본을 복제한다. DB 파일을 실행 중에 일반 `cp`로 복사하지 않는다.

## 갤럭시 탭 S7

1. 보관함의 `연결 및 상태`에서 APK를 내려받는다.
2. APK 설치, 서버 주소 `http://192.168.50.173:5067`와 기기 연결 키 저장.
3. 알림 접근 허용. Android가 제한된 설정으로 막으면 앱 정보의 메뉴에서 제한된 설정 허용 후 다시 설정한다.
4. 앱 배터리 사용을 제한하지 않도록 하고, 연결 테스트를 누른다.
5. 보관함의 알림 탭에서 테스트 수신을 확인한다.
6. 실제 블라인드 알림으로 제목·본문·URL 노출 여부와 양 기기 알림 도착을 검증한다.

공식 패키지 `com.teamblind.blind` 알림만 읽는다. 미전송 알림은 기기 SQLite 큐에 남고 JobScheduler로 재시도한다. 기기 재부팅 후 다시 연결을 요청한다. 알림이 URL을 노출하면 즉시 우선 수집한다. URL이 없으면 이미 발견한 글 제목의 정확 일치로만 연결하며, 연결되지 않은 알림도 보관한다. 알림을 자동 클릭하거나 앱 화면에서 본문을 추출하는 기능은 실제 기기 관찰 후 추가해야 한다. 다른 앱 알림·PendingIntent 내부·블라인드 비공개 저장소는 수집하지 않는다.

개발: Android SDK 36, JDK 21, Gradle Wrapper 9.1.0, AGP 9.0.1. `android/local.properties`의 sdk.dir은 로컬에서 설정한다. APK는 debug 서명된 개인 설치용이며 서명 키는 Git에 넣지 않는다. 소스 수정 후 `scripts/build-android.sh` 실행. APK는 `artifacts/`로 복사되며 Git에서 제외한다. 같은 개발 Mac의 debug keystore를 유지해야 후속 APK를 덮어 설치할 수 있다.

## 로컬 검증

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m blind_archive.server --host 127.0.0.1 --port 5067 --data /tmp/blind-archive-test --no-collector
```

실데이터·기기 키·DB·로그·APK·키스토어는 Git에 커밋하지 않는다.
