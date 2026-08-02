# Great Works 집필 계약

이 폴더는 `docs/catalog/civ6-great-works.json`에 고정된 Civilization VI Great Works 166개의 역사 에디토리얼 문서를 담는다. catalog가 게임 표제·유형·제작 위인·게임 시대·pack·ruleset의 source of truth이고, 각 Markdown은 실제 작품의 역사·귀속·제작 시기·소장과 미디어 권리를 책임진다.

## 폴더와 route

```text
docs/great-works/
├── writing/    # 59
├── portrait/   # 18
├── landscape/  # 25
├── religious/  # 12
├── sculpture/  # 14
└── music/      # 38
```

파일 경로를 작품명에서 새로 만들지 않는다. catalog record의 `path`를 그대로 사용한다.

```text
slug = great-work-<creator canonical entryId>-<creator 안의 order>
path = <type>/<slug>.md
```

따라서 Ludwig van Beethoven의 첫 작품은 현재 creator route `beethoven`이 아니라 canonical id를 사용한 `great-work-ludwig-van-beethoven-1`이다. 작품의 번역명이나 영문 표제가 수정되어도 route는 바뀌지 않는다.

## Catalog와 맞아야 하는 필드

각 문서는 최소한 다음 관계를 정확히 보존한다.

```yaml
---
id: "great-work:GREATWORK_EXAMPLE_1"
nameEn: "Civilization VI의 정확한 영문 작품명"
category: great-works
subcategory: writing
greatWork:
  gameId: "GREATWORK_EXAMPLE_1"
  creatorId: "기존 위인 Markdown의 canonical id"
---
```

검사기는 다음 값을 catalog와 대조한다.

- 실제 상대 경로와 filename ↔ `record.path`, `record.slug`
- `id` ↔ `record.id`
- `nameEn` ↔ 게임 표시 문자열인 `record.workTitle`
- `subcategory` ↔ `record.type`
- `greatWork.gameId` ↔ `record.gameId`
- `greatWork.creatorId` ↔ `creatorMap[creatorKey].entryId`

`greatWork.creatorId`에는 route slug를 넣지 않는다. Hokusai는 `katsushika-hokusai`, Beethoven은 `ludwig-van-beethoven`이다. 현재 creator route가 필요할 때만 catalog의 `entrySlug`를 사용한다. Sun Tzu의 《The Art of War》는 `generals/sun-tzu.md`에 연결되는 writing 작품이며, 분야 폴더를 보고 creator를 추측하지 않는다.

## 작품·이미지·녹음 권리

세 권리 층을 하나의 license로 합치지 않는다.

- `greatWork.workRights`: 악보·회화·조각·텍스트 등 작품 자체의 권리와 근거
- `imageCredit`·`imageLicense`·`imageSource`: 작품을 재현한 개별 이미지 파일의 권리
- `audio`: 연주·실연·녹음 파일의 별도 권리와 출처

`audio.status: available`이고 재사용 조건이 확인된 녹음만 `npm run audio:sync`의 로컬 archive 대상이다. `audio.status: unavailable`은 찾지 못했거나 권리를 확인하지 못했다는 편집 metadata로 남기며 파일을 생성하지 않는다. 게임에서 추출한 음원은 사용하지 않는다. `npm run audio:check`는 available 항목의 metadata·manifest·로컬 파일을 교차 검증한다.

## 부분 집필과 최종 gate

```bash
npm run great-works:report
npm run great-works:report -- --missing
npm run great-works:check
npm run audio:sync
npm run audio:check
```

- `great-works:report`: catalog 166개와 creator mapping 71개를 항상 전수 검사한다. 이미 작성된 Markdown의 불일치나 catalog 밖 파일은 실패하지만 누락 문서는 coverage로만 보고한다.
- `great-works:report -- --missing`: 유형별 누락 path를 모두 출력한다.
- `great-works:check`: 같은 검사에 166/166 완성 조건을 더한다. 최종 통합 단계에서 사용한다.

작업자는 배정받은 Markdown만 작성하고 catalog의 id·slug·path·순서를 임의로 바꾸지 않는다. 게임 데이터 수정이 필요한 경우 연구 근거와 전체 분포 영향을 먼저 검토해 중앙 catalog를 한 번에 갱신한다.
