# Civilization VI 역사 프로필

이 디렉터리는 《Sid Meier's Civilization VI》에 등장하는 지도자, 문명, 도시, 위인을 실제 역사와 함께 다시 읽기 위한 한국어 콘텐츠 모음이다. 게임 규칙은 패치와 확장팩에 따라 달라질 수 있으므로 Civilization Wiki의 Civ6 항목을, 역사 서술은 Wikipedia와 UNESCO 등 연결된 기관 자료를 기준으로 교차 확인했다. 게임의 ‘문명’과 ‘지도자’는 여러 시대와 집단을 하나의 플레이 규칙으로 압축한 표현이며, 실제 역사의 영토·민족·국가와 일치하지 않는다.

## 구성

- `leaders/`: 통치의 배경과 게임 능력이 끌어온 역사적 모티프
- `civilizations/`: 장기 변화와 교류를 중심으로 한 문명 개관
- `cities/`: 도시의 시대별 역할과 게임에서의 위치
- `great-people/`: 아홉 일반 분야와 Gran Colombia 전용 특수 위인 `Comandante General`로 구분한 위인
- `great-works/`: 문학·초상·풍경·종교·조각·음악 여섯 유형의 위대한 작품
- `catalog/`: 게임 roster 스냅샷, 범위 정책, 현재 문서 coverage 계산 기준

## 문서 규약

각 문서는 `id`, 한·영문명, 분류, 시대, 연관 문명, 태그, 이미지 정보와 출처를 YAML frontmatter로 제공한다. `개요`는 역사적 맥락, `게임에서 다시 보기`는 Civ6의 선택적 재현, `핵심 연표/사실`은 빠른 확인용이다. 연대가 논쟁적이거나 후대 기록에 의존할 때는 단정하지 않는다.

위인은 `subcategory`로 아홉 일반 분야와 특수 분야 `comandantes`를 구분한다. roster 전체 대비 수록 현황은 `npm run coverage`로 확인하고, 누락 목록은 `npm run coverage:missing`으로 출력한다. 수록 수를 이 문서에 고정하지 않는 이유는 Markdown이 추가될 때 집계가 자동으로 갱신되기 때문이다.

위대한 작품은 `subcategory`로 여섯 작품 유형을 구분하고 `greatWork` 메타데이터에서 게임 식별자, 제작자, 실제 표제·연대, 귀속, 소장 상태와 작품 자체의 권리를 기록한다. 작품 권리와 재현 이미지·녹음의 권리는 서로 다른 층이므로 각각 독립된 출처와 라이선스로 확인한다. 게임의 표시명은 `nameEn`에 그대로 보존하며 실제 표제나 귀속이 다르면 별도 필드와 본문에서 차이를 설명한다.

도시는 `cityRoles` 배열로 `capital`, `city-state`, `civilization-city`, `editorial-extra`를 구분한다. 한 장소가 수도와 도시국가 등 여러 역할로 등장하면 값을 둘 이상 기록한다.

이미지는 Wikimedia Commons의 파일 페이지에서 저작자와 라이선스를 확인한 재사용 가능 자료만 연결했다. `image`는 원본 파일로 이동하는 Commons 리다이렉트, `imageSource`는 크레디트와 최신 라이선스 조건을 확인하는 파일 설명 페이지다. 재사용할 때는 반드시 `imageSource`의 조건과 변경 이력을 다시 확인해야 한다.

## 공통 출처

- [Civilization VI 공식 페이지 — 2K](https://civilization.2k.com/civ-vi/)
- [Civilization VI — Civilization Wiki](https://civilization.fandom.com/wiki/Civilization_VI)
- [Wikimedia Commons](https://commons.wikimedia.org/)
- [UNESCO World Heritage Centre](https://whc.unesco.org/)

최종 확인일: 2026-08-02
