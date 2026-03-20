# Pixel Parfait

Replicate API로 여러 이미지 모델을 한 번에 비교 생성하는 Next.js 앱입니다.

## 포함된 기능

- 1개에서 4개까지 서로 다른 모델을 동시에 실행
- 비밀번호 게이트
- 초보자용 기본 UI + 펼칠 수 있는 고급 옵션
- 생성 직후 모델별 예상 비용 표시
- 개별 다운로드 / ZIP 일괄 다운로드
- 서버 영구 저장 없음

## 지원 모델

- `bytedance/seedream-4`
- `bytedance/seedream-5-lite`
- `black-forest-labs/flux-2-pro`
- `google/nano-banana-pro`
- `prunaai/z-image-turbo`

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

필수 환경 변수:

- `REPLICATE_API_TOKEN`
- `APP_ACCESS_PASSWORD`
- `APP_SESSION_SECRET`

## Cloudflare 배포

현재 Cloudflare에서 SSR 기반 Next.js 앱은 `OpenNext + Workers` 구성이 가장 자연스럽습니다. 이 저장소에는 그 구성을 바로 배포할 수 있는 설정이 포함되어 있습니다.

```bash
npm run cf:deploy
```

Cloudflare 대시보드 또는 `wrangler secret put`로 아래 값을 넣어주세요.

- `REPLICATE_API_TOKEN`
- `APP_ACCESS_PASSWORD`
- `APP_SESSION_SECRET`

## 메모

- 앱 자체는 생성 이미지를 저장하지 않습니다.
- 결과물은 현재 세션에서만 보여주며, 사용자가 직접 다운로드해야 보관됩니다.
- Replicate 쪽 임시 파일 정책은 별도로 적용될 수 있습니다.
