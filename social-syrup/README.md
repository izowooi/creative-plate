# social-syrup 🍯

AI로 테마 기반 이미지 + 텍스트를 생성하여 SNS에 자동 업로드하는 파이프라인.

```
테마/제시어 입력 → Claude (이미지 프롬프트 + SNS 텍스트 생성)
                → Replicate (이미지 생성)
                → X.com (트윗 업로드)
```

---

## 테스트 순서 (단계별 진행 권장)

### Phase 1 — X.com 업로드 확인
```bash
cd phase1_x_upload
cp .env.example .env   # API 키 입력
pip install -r requirements.txt

python test_text_tweet.py   # 텍스트만 먼저
python test_image_tweet.py  # 이미지 포함
```

**X Developer Portal 설정 체크리스트:**
- [ ] App의 User authentication settings → OAuth 1.0a 활성화
- [ ] App permissions → **Read and Write** (기본값은 Read only)
- [ ] Keys and tokens → Access Token & Secret 재발급 (권한 변경 후 반드시)

### Phase 2 — AI 프롬프트 생성 확인
```bash
cd phase2_ai_prompt
cp .env.example .env   # ANTHROPIC_API_KEY 입력
pip install -r requirements.txt

python test_claude_prompt.py
```

### Phase 3 — Replicate 이미지 생성 확인
```bash
cd phase3_replicate
cp .env.example .env   # REPLICATE_API_TOKEN 입력
pip install -r requirements.txt

python test_replicate.py
# → output_images/ 폴더에 이미지 저장됨
```

### Phase 4 — 통합 파이프라인
```bash
cd phase4_pipeline
cp .env.example .env   # 모든 키 입력
pip install -r requirements.txt

# Dry run (X 업로드 없이 이미지만 생성)
python main.py --theme 속담 --keyword "가는 말이 고와야 오는 말이 곱다" --dry-run

# 실제 업로드
python main.py --theme 멸종위기동물 --keyword "아무르 표범"
```

---

## 지원 테마

| 테마 | 예시 제시어 |
|------|------------|
| 속담 | 가는 말이 고와야 오는 말이 곱다 |
| 멸종위기동물 | 아무르 표범, 수마트라 호랑이 |
| 사자성어 | 일석이조 (一石二鳥) |

---

## 주요 제약사항

### X.com Free Tier 한계
- 트윗: **월 500개**
- 미디어 업로드: **17 requests/24h** (매우 제한적)
- 테스트 목적으로만 적합, 실제 운영 시 Basic tier($200/월) 필요

### 비용 예상 (개인 소규모 운영 기준)
| 항목 | 단가 | 월 100개 기준 |
|------|------|--------------|
| Claude API | ~$0.01/회 | ~$1 |
| Replicate (Flux Schnell) | ~$0.003/이미지 | ~$0.30 |
| X.com API | Free tier | $0 (단, 제한 있음) |

---

## n8n 대안

Python 코드 대신 n8n으로도 동일 파이프라인 구성 가능:
- **Trigger**: Schedule (Cron)
- **Claude**: HTTP Request node → Anthropic API
- **Replicate**: HTTP Request node → Polling으로 완료 대기
- **X.com**: X (Twitter) node 또는 HTTP Request

n8n Self-hosted는 무료. Cloud는 €20/월부터.

---

## 폴더 구조

```
social-syrup/
├── docs/                          # API 가이드 문서
├── phase1_x_upload/               # X.com 업로드 테스트
│   ├── test_text_tweet.py
│   └── test_image_tweet.py
├── phase2_ai_prompt/              # Claude 프롬프트 생성 테스트
│   └── test_claude_prompt.py
├── phase3_replicate/              # Replicate 이미지 생성 테스트
│   └── test_replicate.py
└── phase4_pipeline/               # 통합 파이프라인
    ├── main.py
    ├── generators/
    │   ├── ai_generator.py        # Claude 연동
    │   └── image_generator.py    # Replicate 연동
    └── publishers/
        └── x_publisher.py        # X.com 연동
```
