# 영상 URL 패턴 레퍼런스

사이트 분석 시 자주 등장하는 영상 URL 패턴과 처리 방법.

## HLS 패턴

```
https://cdn.example.com/hls/video123/playlist.m3u8
https://stream.example.com/live/channel1/index.m3u8
https://api.example.com/v2/videos/456/master.m3u8?token=xxx
```

m3u8 파일을 fetch하면 내부에 세그먼트 URL 목록이 있다:
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:9.009,
segment000.ts
segment001.ts
```

세그먼트가 상대 경로이면 m3u8 URL을 base로 절대 경로 변환 필요.

## DASH 패턴

```
https://cdn.example.com/dash/video123/manifest.mpd
```

MPD XML 구조에서 `BaseURL` + `SegmentTemplate`으로 세그먼트 URL 조합.

## 직접 MP4

```
https://storage.example.com/videos/clip_720p.mp4
https://api.example.com/download?id=123&quality=high
```

Range 요청 지원 여부를 확인하면 청크 다운로드 가능.

## Blob URL

```
blob:https://example.com/a1b2c3d4-...
```

해당 탭 컨텍스트에서만 유효. 실제 소스는 MSE의 `appendBuffer` 호출로 추가된 세그먼트다. 네트워크 요청 목록에서 `*.ts`, `*.m4s`, `*.fmp4` 패턴으로 원본 URL 역추적.

## 인증 패턴

### 쿠키 인증
- 세션 쿠키: `PHPSESSID`, `sessionid`, `_session` 등
- background SW에서 `{credentials: 'include'}`로 fetch

### 토큰 인증
- Query 파라미터: `?token=xxx&expires=yyy`
- 토큰 만료 시간 확인 필요 (대부분 짧음 — 5분~1시간)
- background SW에서 content_script로부터 현재 토큰을 받아 요청

### CDN 서명 URL
- AWS CloudFront: `?X-Amz-Signature=...`
- GCP Signed URL: `?X-Goog-Signature=...`
- 서명 URL은 만료 시간이 있으므로 즉시 다운로드 필요
