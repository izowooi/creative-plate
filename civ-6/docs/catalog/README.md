# Civilization VI roster·Great Works catalog와 coverage 정책

이 폴더는 THE TURN의 역사 프로필 범위를 게임 데이터와 대조하기 위한 편집용 카탈로그다. `civ6-roster.json`과 `civ6-great-works.json`은 빌드 때 네트워크에 의존하지 않도록 저장소에 고정한 스냅샷이며, 역사 서술의 출처가 아니다. 각 Markdown 프로필의 역사적 사실은 박물관·기록관·학술 기관 등 독립 출처로 별도 검증한다.

## 범위의 두 층

현재 게임에서 선택·등장하는 항목과 Civilization VI의 전체 변경 이력을 섞어 세지 않는다.

| 분류 | 현재 기준 | 별도 보존하는 이력 |
| --- | ---: | ---: |
| 역사적 지도자 | Anthology + Leader Pass의 인물 66명 | 2K Account 연동 보너스 Julius Caesar 1명 |
| 문명 | 일반 ruleset의 문명 50개 | scenario 전용 문명은 제외 |
| 수도 | 지도자·문명 조합에 표시된 고유 수도명 61개 | 동일 장소와 표기 변형은 프로필 작성 때 교차 연결 |
| 도시국가 | 현행 비 scenario 도시국가 48곳 | DLC에서 교체된 도시국가 10곳 |
| 위인 | 현행 일반 위인 202명 + Gran Colombia 전용 Comandante General 10명 | 지도자 추가에 따라 교체된 위대한 장군 3명 |

따라서 광의의 수집 목록은 지도자 67명, 문명 50개, 수도명 61개, 도시국가 58곳, 위인 roster 항목 215개다. 위인 중 205개는 일반 아홉 분야의 현행·교체 이력이고, 10개는 특수 분야다. 이 숫자를 서로 더해 고유 인물·장소 수로 해석하지 않는다. 같은 인물이 지도자와 위인으로, 같은 장소가 수도와 도시국가로 각각 등장할 수 있기 때문이다.

## 편집 원칙

- Leader persona와 다른 gameplay configuration은 한 역사 인물 프로필로 합친다.
- 문명 표제어는 Civilopedia의 명사형(`Korea`)을 canonical label로 삼고, Wiki 표의 형용사형(`Korean`)은 roster alias로 보존한다.
- 포함 범위는 `scope: core | bonus`, 현재 사용 가능 여부는 `availability: active | legacy`로 서로 분리한다. 위인은 여기에 `kind: standard | special`을 더한다.
- 도시 프로필은 게임 분류보다 실제 장소의 연속성을 우선한다. 같은 장소가 여러 roster 역할을 맡으면 한 글에서 관계를 설명하고 coverage에는 각 역할을 반영한다.
- scenario 전용 지도자·문명·도시와 자연경관은 현재 1차 범위에서 제외한다. 일반 roster가 채워진 뒤 별도 층으로 확장한다.
- roster에 들어 있다는 사실은 역사적 중요도의 순위가 아니다. 글의 배열과 추천에는 시대·지역·성별·분야의 균형을 함께 고려한다.
- 각 프로필은 게임 등장·표현 출처와 독립된 역사 출처를 분리하고, frontmatter에 서로 다른 URL을 최소 3개 둔다. 박물관·기록관·학술기관 자료를 우선하되 사료가 제한된 인물은 확인 가능한 사실과 후대 전승을 명시적으로 구분한다.

스냅샷의 각 record는 표시명과 게임 표기를 분리한다. `id`는 분류 namespace를 포함하는 canonical identity이고, `slug`는 그 namespace 안의 안정적인 ASCII key다. 실제 `/archive/[slug]` route는 기존 URL과 전역 충돌을 고려해 별도로 연결한다.

```json
{
  "id": "civilization:rome",
  "name": "Rome",
  "rosterLabel": "Roman",
  "slug": "rome",
  "scope": "core",
  "availability": "active",
  "aliases": ["Roman Civilization"]
}
```

## Great Works catalog

`civ6-great-works.json`은 일반 게임에서 위대한 작가·예술가·음악가가 만드는 작품과 Sun Tzu의 《The Art of War》를 합친 166개 record를 고정한다. scenario 전용 작품, Heroic Relic, Artifact, Relic, Product는 포함하지 않는다.

| 작품 유형 | 개수 |
| --- | ---: |
| writing | 59 |
| portrait | 18 |
| landscape | 25 |
| religious | 12 |
| sculpture | 14 |
| music | 38 |

작품 제작자는 71명이다. `creatorMap`은 게임 데이터의 `creatorKey`를 기존 위인 Markdown의 canonical `entryId`, 현재 route인 `entrySlug`, 실제 `entryPath`에 명시적으로 연결한다. 이름을 slugify해 추측하지 않는다. 예를 들어 Beethoven은 id `ludwig-van-beethoven`과 route `beethoven`이 다르고, Hokusai는 id `katsushika-hokusai`와 route `hokusai`가 다르다.

```json
{
  "ludwig_van_beethoven": {
    "gameName": "Ludwig van Beethoven",
    "creatorClass": "Great Musician",
    "entryId": "ludwig-van-beethoven",
    "entrySlug": "beethoven",
    "entryPath": "docs/great-people/musicians/beethoven.md"
  }
}
```

작품 route는 표제 번역이나 영문 표기 변경과 분리한다. 모든 record는 다음 규칙을 따른다.

- `id`: `great-work:<gameId>`
- `slug`: `great-work-<creator canonical entryId>-<creator 안의 order>`
- `path`: `<type>/<slug>.md`
- `greatWork.creatorId`: route가 아니라 creator의 canonical `entryId`

catalog 검사는 166개 총수와 유형·pack·게임 시대·creator class 분포, 71개 creator mapping, id·gameId·slug·path·영문 작품명의 유일성, creator별 1부터 시작하는 order 연속성, ruleset profile을 항상 강제한다. Sun Tzu는 `Great General`이 writing 작품을 만드는 유일한 명시적 예외다.

Markdown 집필 상태는 별도 층이다. report mode는 catalog와 기존 문서의 오류를 실패로 처리하지만 아직 없는 문서는 coverage로만 출력한다. `--check`는 누락도 실패로 처리하는 최종 gate다. 자세한 집필 계약은 [`../great-works/README.md`](../great-works/README.md)를 따른다.

## 갱신과 검사

```bash
npm run roster:sync       # 원격 roster 표를 읽어 스냅샷 갱신
npm run roster:check      # 구조, 개수, status 예외, 중복 검사
npm run great-works:report # catalog와 현재 문서 검사, 누락은 보고만 함
npm run great-works:check  # 166/166 문서를 요구하는 최종 gate
npm run coverage          # 현재 Markdown의 분류별 coverage
npm run coverage:missing  # 아직 작성하지 않은 표제어 출력
```

`roster:sync`는 원격 페이지 구조가 바뀌면 조용히 잘못된 파일을 만들지 않고 실패해야 한다. 갱신 결과는 diff로 확인하고, 개수 변화가 실제 게임 roster 변경인지 파서 오류인지 검토한 뒤 커밋한다.

`coverage`는 부분 문자열로 표제어를 추측하지 않는다. 정규화된 `name`·`rosterLabel`·`aliases` 중 정확히 하나와 연결되어야 하며, 연결 누락이나 한 문서가 둘 이상의 record에 겹치는 경우 검사가 실패한다.

## 범위 출처

- [Civilization VI 공식 페이지 — 2K](https://civilization.2k.com/civ-vi/)
- [Leader Pass와 Julius Caesar 배포 안내 — 2K Support](https://support.civilization.com/hc/en-us/articles/37658016431891-Civilization-VI-Leader-Pass)
- [Civilopedia: civilizations and leader configurations](https://www.civilopedia.net/en-US/gathering-storm/civilizations/leaders_intro/)
- [Civilization Wiki: leaders](https://civilization.fandom.com/wiki/Leaders_(Civ6))
- [Civilization Wiki: civilizations](https://civilization.fandom.com/wiki/Civilizations_(Civ6))
- [Civilization Wiki: capitals](https://civilization.fandom.com/wiki/Capital_(Civ6))
- [Civilization Wiki: city-states](https://civilization.fandom.com/wiki/List_of_city-states_in_Civ6)
- [Civilopedia: Great People](https://www.civilopedia.net/en-US/gathering-storm/greatpeople/intro/)
- [Civilization Wiki game-data mirror: Great Works](https://civilization.fandom.com/wiki/Module:Data/Civ6/Base/GreatWorks)
- [Babylon Pack 공식 업데이트 안내 — Steam](https://steamcommunity.com/games/289070/announcements/detail/2923361588257301686)

Roster 최종 범위 확인일: 2026-08-02

Great Works 최종 범위 확인일: 2026-08-03
