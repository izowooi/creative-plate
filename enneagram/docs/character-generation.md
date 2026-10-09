# 캐릭터 이미지 생성과 검증

## 재생성

Python 3, `curl`, Pillow가 필요합니다. 프롬프트와 seed는 [character-prompts.md](character-prompts.md)의 JSON에서 수정합니다.

```sh
python3 scripts/generate-characters.py --check
python3 scripts/generate-characters.py
python3 scripts/generate-characters.py --types 4 --overwrite
```

토큰은 실행 중 숨김 입력으로 받습니다. 이미 설정한 `NOVELAI_TOKEN` 환경변수를 사용할 수도 있습니다. 토큰을 스크립트·프롬프트·CLI 인수·이미지 메타데이터·Git에 저장하지 않습니다. 스크립트는 `.env` 파일을 읽거나 생성하지 않습니다.

기존 파일은 기본적으로 보존합니다. `--overwrite`를 명시해야 다시 생성합니다. 생성은 유형별 한 장씩 순차 실행하며, 서비스 오류 발생 시 중단합니다. 네트워크 오류를 자동 재시도하지 않아 결과를 받지 못한 유료 요청이 중복되는 상황을 피합니다. 사용자가 요청한 9개 캐릭터 생성에 한정된 도구이며 무인 주기 실행 용도가 아닙니다.

API에서 받은 PNG를 메타데이터 없는 RGB WebP로 변환합니다. 실제 성공한 이미지에 대해서만 `public/characters/manifest.json`에 모델·seed·크기·생성 시각·파일 SHA-256·요청 SHA-256을 남깁니다. 인증 정보와 계정 정보는 기록하지 않습니다.

## 생성 기록

2026-10-09에 사용자 제공 Persistent API Token으로 인증한 뒤 실제 NovelAI API로 생성했습니다.

- 상태: **9개 유형 모두 생성 완료**
- 생성 요청 수: 9회, 유형별 1장, 실패·재시도·추가 생성 없음
- 모델: `nai-diffusion-4-5-full`
- 결과: `public/characters/type-1.webp` ~ `type-9.webp`, 각 768×768
- 검증: 9개 파일의 실제 픽셀 크기, EXIF/XMP 및 생성 요청 메타데이터 없음, manifest SHA-256 일치 확인
- 시각 검토: 9장을 3×3 비교하여 공통 수채화 톤, 유형별 색·소품, 정상 얼굴·손, 글자·워터마크·노출 없음 확인
- 웹 전달 크기: 9장 합계 약 1.21 MiB
- 계정·토큰·서비스 응답 본문: 저장하거나 출력하지 않음

이미지 모델은 프롬프트를 완벽히 재현하지 않으므로 머리 길이·피부색·의상의 세부 묘사가 달라질 수 있습니다. 배포된 이미지 자체와 manifest가 실제 결과의 근거입니다. 해당 유형을 특정 성별·외모에 고정하지 않도록 앱에서는 일러스트를 상징으로 사용합니다.
