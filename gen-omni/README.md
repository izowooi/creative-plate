# SceneShift

Gemini Omni 1.1 Flash로 짧은 영상 속 주인공을 업로드한 사람 또는 캐릭터로 다시 캐스팅하는 Next.js 쇼케이스입니다.

## 실행

```bash
npm install
npm run dev
```

`.env.local`에는 다음 패턴 중 하나로 API 키를 설정합니다. 첫 번째 키가 인증 또는 quota 문제로 실패할 때 두 번째 키를 한 번 사용합니다.

```dotenv
GEMINI_API_KEY=
GEMINI_API_KEY_2=
```

`GOOGLE_AI_API_KEY(_2)`와 `GOOGLE_API_KEY(_2)`도 지원합니다. 실제 값은 커밋하지 않습니다.

## 제약과 비용 보호

- 업로드 자체는 1분 미만만 허용합니다.
- Gemini Omni 1.1의 공식 업로드 영상 편집 한도는 10초이므로, 긴 영상은 브라우저에서 선택한 10초 구간을 추출합니다.
- 앱에는 360p, 480p, 720p만 노출하며 1080p와 4K는 차단합니다.
- 공식 API는 480p를 직접 지원하지 않으므로 480p 프리셋은 720p 생성 요청으로 매핑됩니다.
- 생성 전 별도 멀티모달 안전 검사를 수행하고, Omni 자체 안전 필터도 적용됩니다.
- 업로드한 Google File API 임시 파일은 요청 종료 시 삭제를 시도합니다.

## 검증

```bash
npm test
npm run lint
npm run build
```

배포 설정은 포함하지 않았습니다. 추후 Cloudflare Workers 배포 시 OpenNext 또는 Cloudflare adapter에 맞게 Node API route와 `sharp` 호환성을 검토해야 합니다.
