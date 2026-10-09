# 아홉 가지 성향의 캐릭터 프롬프트

캐릭터는 성향을 떠올리게 하는 창작 일러스트입니다. 실제 외모·성별·직업으로 유형을 판단한다는 뜻은 아닙니다. 기존 작품의 캐릭터나 특정 작가 이름을 사용하지 않았습니다. 성인 인물, 일상복, 부드러운 수채화, 종이 질감, 중앙 상반신 구도를 공통으로 유지합니다.

아래 JSON은 재생성 스크립트가 직접 읽습니다. NovelAI 웹 UI에서도 `common_positive` 뒤에 각 유형의 `positive`를 붙이고, `common_negative` 뒤에 해당 `negative`를 붙여 사용할 수 있습니다. 모델·seed·크기·sampler를 함께 맞추세요. seed가 같아도 제공자의 모델 업데이트에 따라 결과는 달라질 수 있습니다.

| 유형 | 이미지의 이야기 | 색 | 파일 |
|---|---|---|---|
| 1 | 차분하게 방향을 잡는 작은 정원의 설계자 | 올리브 | `/characters/type-1.webp` |
| 2 | 따뜻한 차와 꽃으로 마음을 건네는 사람 | 로즈 | `/characters/type-2.webp` |
| 3 | 자신만의 목표를 향해 걷는 여행 안내자 | 앰버 | `/characters/type-3.webp` |
| 4 | 자신의 색을 찾아가는 그림 작가 | 라벤더 | `/characters/type-4.webp` |
| 5 | 별의 움직임을 관찰하는 탐구자 | 슬레이트 블루 | `/characters/type-5.webp` |
| 6 | 함께 갈 길을 살피는 등불 지기 | 틸 | `/characters/type-6.webp` |
| 7 | 새로운 풍경을 반기는 모험가 | 오렌지 | `/characters/type-7.webp` |
| 8 | 힘과 온기를 함께 지닌 든든한 보호자 | 러스트 | `/characters/type-8.webp` |
| 9 | 여유 있게 식물과 함께 쉬는 조율자 | 세이지 | `/characters/type-9.webp` |

```json
{
  "model": "nai-diffusion-4-5-full",
  "parameters": {
    "params_version": 3,
    "width": 768,
    "height": 768,
    "steps": 28,
    "scale": 5,
    "cfg_rescale": 0.1,
    "sampler": "k_euler_ancestral",
    "noise_schedule": "karras"
  },
  "common_positive": "very aesthetic, masterpiece, high quality, original character, solo, one adult person aged 28, fully clothed, wholesome, soft anime illustration, watercolor and colored pencil, warm textured ivory paper, gentle hand drawn linework, muted pastel colors, cozy modern fantasy, editorial portrait, waist up, centered composition, visible head and shoulders, kind expressive eyes, soft diffuse natural light, small botanical decorations, simple airy background, no text, no logo",
  "common_negative": "nsfw, nude, naked, revealing clothes, cleavage, lingerie, swimsuit, child, underage, loli, shota, lowres, worst quality, bad quality, jpeg artifacts, photorealistic, 3d, harsh shadows, oversaturated, horror, blood, weapon, text, watermark, signature, logo, letters, numbers, collage, multiple views, multiple people, duplicate person, extra arms, extra fingers, missing fingers, malformed hands, bad anatomy, mismatched eyes, cropped head, cut off face",
  "characters": [
    {
      "type": 1,
      "name": "방향을 가꾸는 사람",
      "seed": 180610101,
      "positive": "1woman, adult woman, short dark brown bob hair, warm brown eyes, thoughtful calm smile, neat olive green cardigan over cream high neck blouse, round botanical brass brooch, holding a small closed linen notebook against her chest, tidy garden planning corner, delicate olive branches, muted olive and warm cream color palette, upright relaxed posture, gentle conscientious expression, a small pencil tucked into notebook, understated elegance",
      "negative": "angry expression, stern expression, military uniform"
    },
    {
      "type": 2,
      "name": "온기를 건네는 사람",
      "seed": 180610202,
      "positive": "1man, adult man, warm brown skin, soft dark curly hair, dark brown eyes, tender welcoming smile, dusty rose knit sweater over a cream collared shirt, carrying a small ceramic teacup at chest level, a single pink camellia in a nearby vase, cozy tea room atmosphere, muted rose pink and warm ivory color palette, relaxed shoulders, attentive caring expression, delicate steam curl from the cup",
      "negative": "apron, servant uniform, exaggerated muscles"
    },
    {
      "type": 3,
      "name": "가능성을 펼치는 사람",
      "seed": 180610303,
      "positive": "1woman, adult woman, tan skin, dark auburn hair tied into a loose low ponytail, hazel eyes, bright composed smile, amber yellow tailored jacket over cream turtleneck, small star shaped pin, holding a folded travel map with no writing, soft sunlight through tall window, muted amber gold and cream color palette, confident poised posture, hopeful expression, tiny marigold flowers beside her",
      "negative": "trophy, medal, corporate logo, suit and tie"
    },
    {
      "type": 4,
      "name": "자신의 색을 찾는 사람",
      "seed": 180610404,
      "positive": "1man, adult man, shoulder length wavy dark plum hair, grey violet eyes, contemplative gentle smile, lavender linen shirt with rolled sleeves and a soft cream scarf, holding a single paintbrush and small watercolor sketchbook, softly blurred artist studio, delicate iris flowers, muted lavender and warm cream color palette, imaginative thoughtful expression, subtle paint marks on the cuffs, quietly expressive posture",
      "negative": "crying, despair, dramatic makeup, clown makeup"
    },
    {
      "type": 5,
      "name": "깊이를 들여다보는 사람",
      "seed": 180610505,
      "positive": "1woman, adult woman, straight black shoulder length hair, thin round spectacles, deep blue eyes, small curious smile, slate blue oversized knit vest over a fully buttoned cream blouse, holding a small closed astronomy book without text, tiny brass telescope blurred in background, delicate star like white blossoms, muted slate blue and warm ivory color palette, calm absorbed expression, soft library window light",
      "negative": "school uniform, student, lab coat, glowing eyes"
    },
    {
      "type": 6,
      "name": "함께 갈 길을 밝히는 사람",
      "seed": 180610606,
      "positive": "1man, adult man, medium brown skin, short neatly tousled dark hair, warm grey eyes, reassuring thoughtful smile, teal wool overshirt over a cream knit sweater, holding a small brass camping lantern with a gentle warm glow, softly blurred woodland path, tiny teal green fern fronds, muted teal and warm cream color palette, watchful kind expression, balanced steady posture, gentle morning mist",
      "negative": "fear, panic, police uniform, military uniform, dark night"
    },
    {
      "type": 7,
      "name": "새로운 풍경을 반기는 사람",
      "seed": 180610707,
      "positive": "1woman, adult woman, copper red curly short hair, freckles, green eyes, joyful open smile, soft orange cardigan over a cream striped shirt, holding a tiny vintage camera near chest, travel satchel strap over one shoulder, a little orange cosmos flower, airy open sky and soft clouds, muted tangerine orange and ivory color palette, playful optimistic expression, lively but relaxed posture",
      "negative": "childlike proportions, open mouth shout, hyperactive pose"
    },
    {
      "type": 8,
      "name": "힘으로 온기를 지키는 사람",
      "seed": 180610808,
      "positive": "1woman, adult woman, deep brown skin, short dark natural curly hair, amber brown eyes, calm confident warm smile, rust terracotta work jacket over a fully covered cream high neck top, broad relaxed shoulders, one hand gently resting on a wooden walking stick, small copper leaf pendant, tiny rust red wildflowers, muted terracotta rust and warm ivory color palette, grounded protective expression, sunlit countryside background",
      "negative": "aggressive, angry, scowl, armor, battle, clenched fist, huge muscles"
    },
    {
      "type": 9,
      "name": "편안한 자리를 만드는 사람",
      "seed": 180610909,
      "positive": "1man, adult man, dark blond wavy medium length hair, soft hazel eyes, serene gentle smile, sage green loose linen overshirt over cream knit top, holding a small terracotta pot with a green plant at chest level, sunlit quiet garden, delicate sage leaves and white daisies, muted sage green and warm cream color palette, easy relaxed posture, peaceful welcoming expression, soft drifting light",
      "negative": "sleeping, closed eyes, slouching, blank expression"
    }
  ]
}
```

## 직접 그림으로 교체하기

정사각형 그림을 같은 `/public/characters/type-N.webp` 경로에 넣으면 앱에서 자동으로 사용합니다. 얼굴과 주요 소품은 중앙 70% 안에 두면 카드와 결과 화면의 둥근 모서리에 잘리지 않습니다. 유형 번호와 설명은 앱에서 표시하므로 그림 안에 글자는 넣지 않는 편이 좋습니다. 수동 교체 후 `manifest.json`의 해당 유형 기록도 삭제하거나 수정해 AI 생성 기록과 혼동되지 않게 해주세요.

## 공식 참고

- [NovelAI Image Generation API](https://image.novelai.net/docs/index.html)
- [모델 설명](https://docs.novelai.net/en/image/models/): 생성에는 V4.5 Full을 명시적으로 고정합니다.
- [Sampler](https://docs.novelai.net/en/image/sampling/)
- [Quality tags](https://docs.novelai.net/en/image/qualitytags/): 본 프롬프트에 품질 태그를 넣어 자동 추가는 끕니다.
