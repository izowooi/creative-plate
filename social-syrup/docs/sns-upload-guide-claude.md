# SNS 플랫폼별 API 자동 포스팅 종합 가이드 (2025)

**소셜 미디어 자동 포스팅은 2025년 현재 대부분의 주요 플랫폼에서 API를 통해 무료로 가능하다.** Instagram, Facebook, Twitter/X, Discord, LinkedIn은 물론 Threads, Bluesky, Mastodon까지 이미지 업로드 API를 공식 지원하며, n8n 같은 자동화 도구를 활용하면 코드 없이도 크로스 플랫폼 동시 포스팅을 구현할 수 있다. 다만 각 플랫폼마다 인증 방식, Rate Limit, API 버전 정책이 크게 다르고, 특히 **Twitter/X는 2024년 Basic tier를 $200/월로 인상**하고 Free tier를 월 500트윗으로 축소하는 등 비용 장벽이 높아졌다. 이 가이드는 10개 이상의 SNS 플랫폼 API를 실무에 바로 적용할 수 있는 수준으로 정리한다.

---

## Instagram Graph API: 2단계 Container 방식의 이미지 게시

### 사전 요구사항과 토큰 발급

Instagram API를 통한 자동 포스팅에는 **Business 또는 Creator 계정**이 필수이며, 해당 계정이 Facebook Page에 연결되어 있어야 한다. 개인 계정으로는 API 접근 자체가 불가능하다.

**Developer Portal**: https://developers.facebook.com

토큰 발급은 3단계 흐름을 따른다. Graph API Explorer에서 Short-lived User Token(1~2시간 유효)을 생성한 뒤, `fb_exchange_token` grant type으로 Long-lived User Token(60일 유효)으로 교환하고, 최종적으로 `/{user-id}/accounts` 엔드포인트에서 **만료 없는 Page Access Token**을 획득한다. 이 Page Token에서 Instagram Business Account ID를 조회하면 준비가 완료된다.

2024년 7월부터 **Instagram API with Instagram Login**이라는 새 방식이 도입되어 Facebook Page 연결 없이도 직접 Instagram 인증이 가능해졌다. 이 경우 호스트가 `graph.instagram.com`이며, 기존 Facebook Login 방식은 `graph.facebook.com`을 사용한다.

**필요 권한**: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `pages_show_list`

### 이미지 포스팅 API (2단계 프로세스)

Instagram은 이미지를 직접 업로드하는 것이 아니라 **공개 URL을 제공하면 Meta 서버가 해당 이미지를 가져오는 방식**으로 동작한다. 이 점이 가장 흔한 실수 원인이다.

```python
import requests
import time

ACCESS_TOKEN = "your_access_token"
IG_USER_ID = "your_instagram_business_account_id"
BASE_URL = "https://graph.facebook.com/v22.0"

def post_image_to_instagram(image_url: str, caption: str = "") -> dict:
    # Step 1: Container 생성
    container = requests.post(f"{BASE_URL}/{IG_USER_ID}/media", data={
        "image_url": image_url,       # 반드시 공개(public) URL
        "caption": caption,
        "access_token": ACCESS_TOKEN,
    }).json()
    container_id = container["id"]

    # Step 2: 상태 확인 후 게시
    time.sleep(3)
    result = requests.post(f"{BASE_URL}/{IG_USER_ID}/media_publish", data={
        "creation_id": container_id,
        "access_token": ACCESS_TOKEN,
    }).json()
    return result  # {"id": "<IG_MEDIA_ID>"}
```

Carousel(다중 이미지)은 각 이미지를 `is_carousel_item=true`로 Container 생성 후, `media_type=CAROUSEL`과 `children` 파라미터로 묶어서 게시한다. 최대 **10장**까지 가능하다.

### Rate Limit과 이미지 제한

| 항목 | 제한값 |
|------|--------|
| 콘텐츠 게시 | **24시간당 100개 포스트** (Carousel 1개로 카운트) |
| API 호출 | 앱당 200 × 사용자 수 / 시간 |
| 이미지 형식 | **JPEG만 지원** (PNG, GIF 불가) |
| 최대 파일 크기 | 8MB |
| 권장 해상도 | 1080×1350px (4:5), 1080×1080px (1:1) |

### 2024-2025 주요 변경사항

**Instagram Basic Display API가 2024년 12월 4일 완전 폐기**되어 모든 통합이 Graph API로 이전해야 한다. Graph API v22.0(2025년 1월 출시)에서 Instagram 객체 이름이 변경되었고(Instagram User → IG User 등), 2025년 3월에는 `alt_text` 필드가 추가되었다. `impressions`, `plays` 등 메트릭이 deprecate되고 `views`로 통합되는 중이다.

**주의할 함정**: Container는 24시간 내에 게시하지 않으면 EXPIRED 처리된다. App Review를 통과해야 `instagram_content_publish` 권한을 운영 환경에서 사용할 수 있으며, 개발 모드에서는 앱 관리자/개발자만 테스트 가능하다.

---

## Facebook Graph API: Page 전용 이미지 포스팅

**Developer Portal**: https://developers.facebook.com

Facebook API를 통한 포스팅은 **Page에만 가능**하며, 개인 프로필(User Timeline)에는 API로 게시할 수 없다. 이는 Meta 정책상 완전히 차단되어 있다.

### 토큰 발급과 이미지 포스팅

Instagram과 동일한 3단계 토큰 흐름(Short-lived → Long-lived → Page Token)을 사용한다. **필수 권한**은 `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`이다.

Facebook은 Instagram과 달리 **로컬 파일 직접 업로드를 지원**한다:

```python
import requests

PAGE_ID = "your_page_id"
PAGE_ACCESS_TOKEN = "your_page_access_token"
BASE_URL = "https://graph.facebook.com/v22.0"

# 방법 1: URL로 이미지 포스팅
requests.post(f"{BASE_URL}/{PAGE_ID}/photos", data={
    "url": "https://example.com/photo.jpg",
    "message": "자동 포스팅 테스트",
    "access_token": PAGE_ACCESS_TOKEN,
})

# 방법 2: 로컬 파일 업로드
with open("photo.jpg", "rb") as f:
    requests.post(f"{BASE_URL}/{PAGE_ID}/photos",
        data={"message": "로컬 이미지", "access_token": PAGE_ACCESS_TOKEN},
        files={"source": f})

# 방법 3: 다중 이미지 (unpublished → attached_media)
photo_ids = []
for img_url in image_urls:
    resp = requests.post(f"{BASE_URL}/{PAGE_ID}/photos", data={
        "url": img_url, "published": "false", "access_token": PAGE_ACCESS_TOKEN,
    })
    photo_ids.append(resp.json()["id"])

post_data = {"message": "여러 장", "access_token": PAGE_ACCESS_TOKEN}
for i, pid in enumerate(photo_ids):
    post_data[f"attached_media[{i}]"] = f'{{"media_fbid":"{pid}"}}'
requests.post(f"{BASE_URL}/{PAGE_ID}/feed", data=post_data)
```

Rate Limit은 `200 × 사용자 수` calls/hour이며, `X-App-Usage`와 `X-Page-Usage` 헤더로 사용량을 모니터링할 수 있다. **Groups API는 2024년부터 대폭 제한**되어 그룹 자동 포스팅은 사실상 불가능하다. 비용은 **완전 무료**이다.

---

## Twitter/X API v2: 2025년 6월 v1.1 Media Upload 완전 폐기

### Developer Portal 설정과 인증

**Developer Portal**: https://developer.x.com

2025년의 가장 중요한 변경은 **v1.1 Media Upload 엔드포인트가 2025년 6월 9일에 완전 폐기**되었다는 점이다. 이제 반드시 `POST https://api.x.com/2/media/upload` v2 엔드포인트를 사용해야 한다.

인증은 **OAuth 2.0 PKCE** 또는 **OAuth 1.0a User Context**를 지원한다. 중요한 점은 App-Only Bearer Token으로는 Media Upload가 **불가능**하며, 반드시 사용자 컨텍스트 토큰이 필요하다. OAuth 2.0 사용 시 필수 scope는 `tweet.read`, `tweet.write`, `users.read`, `media.write`, `offline.access`이다.

### API Tier별 비용과 제한 (2025년 기준)

| Tier | 월 비용 | 트윗 포스팅 | 트윗 읽기 | 비고 |
|------|---------|------------|-----------|------|
| **Free** | $0 | **500/월** | 거의 불가 | 쓰기 전용, 2024년에 1,500→500 축소 |
| **Basic** | **$200** | 50,000/월 | 10,000/월 | 2024년에 $100→$200 인상 |
| **Pro** | $5,000 | 1,000,000/월 | Full Archive | Filtered Stream 포함 |
| **Enterprise** | $42,000+ | 커스텀 | 커스텀 | 연간 계약 |

Free tier의 Media Upload Rate Limit은 initialize/finalize **17요청/24시간**, append **85요청/24시간**으로 매우 제한적이다.

### v2 이미지 업로드 + 트윗 생성 코드

```python
import requests
import base64

USER_ACCESS_TOKEN = "your_oauth2_user_access_token"
headers = {"Authorization": f"Bearer {USER_ACCESS_TOKEN}"}

# Step 1: Simple Upload (5MB 이하 이미지)
with open("photo.jpg", "rb") as f:
    image_b64 = base64.b64encode(f.read()).decode()

upload_resp = requests.post("https://api.x.com/2/media/upload",
    headers={**headers, "Content-Type": "application/json"},
    json={
        "media": image_b64,
        "media_type": "image/jpeg",
        "media_category": "tweet_image"
    })
media_id = upload_resp.json()["data"]["id"]

# Step 2: 트윗 생성
tweet_resp = requests.post("https://api.x.com/2/tweets",
    headers={**headers, "Content-Type": "application/json"},
    json={
        "text": "이미지와 함께 자동 트윗! 🐍",
        "media": {"media_ids": [media_id]}
    })
```

5MB를 초과하는 파일은 Chunked Upload(INIT → APPEND → FINALIZE → STATUS)를 사용해야 한다. 트윗당 최대 **4장의 이미지** 또는 1개의 GIF/비디오를 첨부할 수 있다.

**주요 함정**: Tweepy 라이브러리의 `api.media_upload()`는 내부적으로 v1.1을 호출하므로 2025년 6월 이후 작동하지 않는다. v2 Media Upload을 직접 `requests`로 호출하는 것을 권장한다.

---

## Discord: Bot API와 Webhook 두 가지 경로

### Bot 방식

**Developer Portal**: https://discord.com/developers/applications

Discord Bot은 생성이 가장 간단한 축에 속한다. Developer Portal에서 Application 생성 → Bot 탭에서 Token 발급 → OAuth2 URL Generator로 서버 초대 링크를 만들면 된다. 필요 권한은 `Send Messages`, `Attach Files`, `Embed Links`이다.

```python
import requests

BOT_TOKEN = "YOUR_BOT_TOKEN"
CHANNEL_ID = "YOUR_CHANNEL_ID"

# multipart/form-data로 이미지 + 메시지 전송
with open("image.png", "rb") as f:
    requests.post(
        f"https://discord.com/api/v10/channels/{CHANNEL_ID}/messages",
        headers={"Authorization": f"Bot {BOT_TOKEN}"},
        data={"content": "이미지와 함께 보내는 메시지"},
        files={"files[0]": ("image.png", f, "image/png")})
```

### Webhook 방식 (가장 간단)

Webhook은 Bot 없이도 특정 채널에 메시지를 보낼 수 있는 가장 간편한 방법이다. 서버 설정 → Integrations → Webhooks에서 URL을 생성하면 별도의 인증 없이 POST 요청만으로 이미지를 전송할 수 있다.

```python
import requests

WEBHOOK_URL = "https://discord.com/api/webhooks/{id}/{token}"
with open("image.png", "rb") as f:
    requests.post(WEBHOOK_URL,
        data={"content": "Webhook 이미지"},
        files={"file1": ("image.png", f, "image/png")})
```

파일 크기 제한은 무료 서버 기준 **25MB**, Rate Limit은 채널당 **5 messages/5 seconds**이다. 비용은 **완전 무료**이며, Webhook URL이 노출되면 누구나 메시지를 보낼 수 있으므로 보안에 주의해야 한다.

---

## LinkedIn API: 3단계 이미지 업로드 프로세스

### Developer App 설정

**Developer Portal**: https://www.linkedin.com/developers/

LinkedIn API는 다른 플랫폼에 비해 **승인 과정이 가장 까다롭다**. App 생성 시 반드시 Company Page를 연결해야 하고, Products 탭에서 "Share on LinkedIn"을 활성화하여 `w_member_social` scope를 획득해야 한다. Standard Tier 승인을 위해서는 스크린캐스트 비디오로 use case를 데모해야 할 수도 있다.

### Images API + Posts API (권장 방식)

2025년 기준 **ugcPosts API는 deprecated** 되었으며, 새로운 `/rest/images` + `/rest/posts` 조합을 사용해야 한다. 모든 요청에 `Linkedin-Version: YYYYMM` 헤더가 필수이다.

```python
import requests

ACCESS_TOKEN = "your_access_token"
PERSON_ID = "your_person_id"
headers = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
    "Linkedin-Version": "202510",
    "X-Restli-Protocol-Version": "2.0.0"
}

# Step 1: Initialize Upload
init = requests.post(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    headers=headers,
    json={"initializeUploadRequest": {"owner": f"urn:li:person:{PERSON_ID}"}}
).json()
upload_url = init["value"]["uploadUrl"]
image_urn = init["value"]["image"]

# Step 2: Upload Binary
with open("image.jpg", "rb") as f:
    requests.put(upload_url, headers={
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/octet-stream"
    }, data=f)

# Step 3: Create Post
requests.post("https://api.linkedin.com/rest/posts", headers=headers, json={
    "author": f"urn:li:person:{PERSON_ID}",
    "commentary": "자동 LinkedIn 포스트! #API #Automation",
    "visibility": "PUBLIC",
    "distribution": {"feedDistribution": "MAIN_FEED",
                     "targetEntities": [], "thirdPartyDistributionChannels": []},
    "content": {"media": {"altText": "이미지 설명", "id": image_urn}},
    "lifecycleState": "PUBLISHED",
    "isReshareDisabledByAuthor": False
})
```

Rate Limit은 Development Tier 기준 **앱당 500 requests/day, 멤버당 100 requests/day**이다. Access Token 유효기간은 **60일**이며, 지원 포맷은 JPG, PNG, GIF(250프레임 이하)이다.

---

## 기타 플랫폼 5종: Threads부터 Mastodon까지

### Threads (Meta)

2024년 6월 출시된 Threads API는 Instagram과 유사한 **Container → Publish 2단계 방식**을 사용한다. 베이스 URL은 `https://graph.threads.net/v1.0/`이며, Meta Developer 앱이 필요하다. **24시간당 250개 포스트**로 제한되고, 포스트당 최대 500자, 해시태그 1개까지 허용된다. Carousel은 최대 20개 항목을 지원하며, 비용은 무료이다.

```python
# Step 1: Container 생성
resp = requests.post(f"https://graph.threads.net/v1.0/{USER_ID}/threads",
    params={"media_type": "IMAGE", "image_url": "https://example.com/img.jpg",
            "text": "Threads 자동 포스팅!", "access_token": TOKEN})
# Step 2: 게시
requests.post(f"https://graph.threads.net/v1.0/{USER_ID}/threads_publish",
    params={"creation_id": resp.json()["id"], "access_token": TOKEN})
```

### Bluesky (AT Protocol)

Bluesky는 오픈 프로토콜 기반으로 **앱 리뷰나 승인 과정 없이** 바로 API를 사용할 수 있어 진입 장벽이 가장 낮다. App Password를 생성하여 `com.atproto.server.createSession`으로 인증한 뒤, `uploadBlob`으로 이미지를 업로드하고 `createRecord`로 포스트를 생성한다.

```python
from atproto import Client  # pip install atproto
client = Client()
client.login('handle.bsky.social', 'app-password')
with open('image.png', 'rb') as f:
    client.send_image(text='Bluesky 자동 포스팅!', image=f.read(), image_alt='설명')
```

이미지 크기는 **1MB 이하**, 포스트당 최대 **4장**이다. Rate Limit은 시간당 5,000 포인트(create=3포인트)로 넉넉하다. `createSession`은 300초당 30회로 매우 엄격하므로 **세션 토큰을 반드시 캐싱**해야 한다.

### Mastodon

오픈소스 분산형 SNS인 Mastodon은 표준 OAuth 2.0을 사용하며, `Mastodon.py` 라이브러리로 간편하게 구현할 수 있다.

```python
from mastodon import Mastodon
mastodon = Mastodon(access_token='usercred.secret', api_base_url='https://mastodon.social')
media = mastodon.media_post('image.jpg', description='Alt text')
mastodon.status_post('자동 포스팅! #mastodon', media_ids=[media])
```

Rate Limit은 5분당 300 요청이며, 인스턴스마다 파일 크기 제한이 다르다(mastodon.social 기준 이미지 16MB).

### Pinterest와 TikTok

**Pinterest** API v5(`https://api.pinterest.com/v5/pins`)는 `image_url` 또는 `image_base64`로 Pin을 생성한다. Business 계정과 App Review가 필요하며, Rate Limit은 초당 100 calls이다.

**TikTok** Content Posting API는 2025년 현재 **이미지 포스팅을 공식 지원**한다. `POST /v2/post/publish/content/init/`에 `media_type: "PHOTO"`로 요청하되, 이미지 URL은 반드시 **TikTok에 등록된 verified domain**에서 호스팅되어야 한다. 미감사(unaudited) 앱은 모든 콘텐츠가 **SELF_ONLY(비공개)**로 제한되므로, 공개 포스팅을 위해서는 TikTok의 감사(audit)를 통과해야 한다.

---

## 10개 플랫폼 비교 총정리

| 플랫폼 | 인증 방식 | 이미지 업로드 | 비용 | Rate Limit (게시) | 난이도 |
|--------|----------|-------------|------|-------------------|--------|
| **Instagram** | OAuth 2.0 (Meta) | URL 기반 2단계 | 무료 | 100/24h | 중 |
| **Facebook** | OAuth 2.0 (Meta) | URL 또는 파일 | 무료 | 사용자 수 비례 | 중 |
| **Twitter/X** | OAuth 2.0 PKCE | Base64 또는 Chunked | Free~$5,000/월 | 500/월(Free) | 높음 |
| **Discord** | Bot Token / Webhook | multipart/form-data | 무료 | 5msg/5s/channel | 낮음 |
| **LinkedIn** | OAuth 2.0 | 3단계 (init→upload→post) | 무료 | 500req/day(Dev) | 높음 |
| **Threads** | OAuth 2.0 (Meta) | URL 기반 2단계 | 무료 | 250/24h | 중 |
| **Bluesky** | App Password / JWT | Blob upload | 무료 | ~1,666 creates/h | 낮음 |
| **Mastodon** | OAuth 2.0 | multipart upload | 무료 | 300req/5min | 낮음 |
| **Pinterest** | OAuth 2.0 | URL 또는 Base64 | 무료 | 100/s | 중 |
| **TikTok** | OAuth 2.0 | URL (verified domain) | 무료 | 6req/min | 높음 |

---

## n8n으로 구축하는 크로스 플랫폼 자동 포스팅

### n8n 노드 구성과 워크플로우 설계

n8n은 Community Edition(Self-hosted)이 **완전 무료**이며, 무제한 워크플로우 실행을 지원한다. Cloud 플랜은 Starter €20/월(2,500 실행)부터 시작한다. n8n의 과금 단위는 '실행(execution)'이므로 워크플로우 내 노드 수에 관계없이 1회 트리거 = 1 실행이다.

각 플랫폼의 n8n 노드 지원 현황은 다음과 같다:

- **Instagram/Facebook**: `Facebook Graph API` 내장 노드 또는 `n8n-nodes-meta-publisher` 커뮤니티 노드
- **Twitter/X**: `X (formerly Twitter)` 내장 노드 (단, 이미지 업로드는 HTTP Request 노드로 직접 호출 필요)
- **Discord**: `Discord` 내장 노드 (Bot Token, OAuth2, Webhook 3가지 인증 지원)
- **LinkedIn**: `LinkedIn` 내장 노드 (OAuth2 인증)

### 멀티 플랫폼 동시 포스팅 워크플로우 구조

```
[Schedule Trigger] → [Google Sheets: 콘텐츠 조회] → [Set: 데이터 가공]
                                                         ↓
                                          ┌──────────────┼──────────────┐
                                          ↓              ↓              ↓
                              [Facebook Graph API]  [HTTP Request]  [LinkedIn]
                              (Instagram + FB)      (X/Twitter)     (Post)
                                          ↓              ↓              ↓
                                    [Discord Webhook]    ↓              ↓
                                          ↓──────────────┘──────────────┘
                              [Google Sheets: 상태 업데이트]
```

Credential 설정은 각 플랫폼 Developer Portal에서 앱을 생성한 뒤, n8n의 OAuth Redirect URL을 Callback URL에 등록하고, Client ID/Secret을 n8n credential에 입력하는 흐름이다. Instagram/Facebook의 경우 System User Token을 직접 입력하는 것이 장기 운영에 유리하다.

### n8n Instagram 포스팅 워크플로우 핵심 노드 설정

```json
{
  "nodes": [
    {
      "name": "Container 생성",
      "type": "n8n-nodes-base.facebookGraphApi",
      "parameters": {
        "httpRequestMethod": "POST",
        "graphApiVersion": "v22.0",
        "node": "{{IG_USER_ID}}",
        "edge": "media",
        "options": {
          "queryParameters": {
            "parameter": [
              {"name": "image_url", "value": "={{$json.imageUrl}}"},
              {"name": "caption", "value": "={{$json.caption}}"}
            ]
          }
        }
      }
    },
    {
      "name": "Publish",
      "type": "n8n-nodes-base.facebookGraphApi",
      "parameters": {
        "httpRequestMethod": "POST",
        "edge": "media_publish",
        "options": {
          "queryParameters": {
            "parameter": [
              {"name": "creation_id", "value": "={{$json.id}}"}
            ]
          }
        }
      }
    }
  ]
}
```

---

## 자체 구축 시 아키텍처 설계 패턴

대규모 크로스 플랫폼 포스팅 시스템을 직접 구축한다면, **Queue 기반 Fan-out 아키텍처**가 가장 효과적이다. 하나의 포스팅 요청이 Message Queue(Redis/BullMQ 또는 AWS SQS)를 통해 각 플랫폼별 Worker로 분배되는 구조다.

핵심은 **Platform Adapter 패턴**으로 공통 인터페이스를 추상화하는 것이다:

```typescript
interface SocialMediaAdapter {
  platform: string;
  authenticate(credentials: Credentials): Promise<void>;
  postImage(content: ImagePost): Promise<PostResult>;
  refreshToken(): Promise<void>;
}

class UnifiedPoster {
  private adapters: Map<string, SocialMediaAdapter>;

  async postToAll(content: UniversalPost, platforms: string[]) {
    const tasks = platforms.map(p => 
      this.retryWithBackoff(() => this.adapters.get(p)!.postImage(content))
    );
    return Promise.allSettled(tasks);
  }
}
```

에러 처리는 **Exponential Backoff**(1s → 2s → 4s → 8s, 최대 5회) + **Circuit Breaker**(연속 실패 시 일시 차단) + **Dead Letter Queue**(최종 실패 작업 저장)의 3중 구조가 권장된다. Token Refresh는 만료 전 자동 갱신 로직을 포함하고, AWS Secrets Manager 같은 보안 스토리지에 암호화하여 저장한다.

---

## 서드파티 서비스로 단순화하기

코드를 직접 작성하지 않고 API를 통해 여러 플랫폼에 동시 포스팅하려면 서드파티 서비스가 유용하다.

**Buffer**는 가장 접근하기 쉬운 옵션으로, Essentials 플랜이 **$5/월/채널**이다. REST API(`POST /1/updates/create.json`)로 이미지 URL과 텍스트를 전달하면 Instagram, Facebook, X, LinkedIn, Threads, Bluesky, Mastodon, Pinterest, YouTube까지 10개 플랫폼을 지원한다. Rate Limit은 60 requests/user/minute이다.

**Hootsuite**는 엔터프라이즈 수준의 도구로, Publishing API를 제공하지만 **최소 $99/월**(무료 플랜 폐지)이 필요하다. **Sprout Social**은 API로 Draft 상태 포스트만 생성 가능하고(직접 게시 불가), Advanced Plan($249+/월)이 필요하다.

개발자 친화적인 대안으로 **Ayrshare**와 **Late(구 Zernio)**가 있다. 이들은 단일 API 호출로 다중 플랫폼 동시 포스팅을 지원하며, OAuth 플로우를 대행해 주는 것이 가장 큰 장점이다.

| 서비스 | 월 비용 | API 지원 | 지원 플랫폼 수 | 적합 대상 |
|--------|---------|---------|---------------|----------|
| Buffer | $0~$5/채널 | ✅ REST API | 10개 | 소규모~중규모 |
| Hootsuite | $99+ | ✅ REST API | 10+ | 중규모~엔터프라이즈 |
| Ayrshare | 가변 | ✅ REST API | 10+ | 개발자 |
| n8n | 무료(Self-host) | 워크플로우 | 10+ | 기술 역량 보유팀 |

---

## 실전 적용 시 반드시 기억할 핵심 사항

이 가이드에서 다룬 모든 플랫폼을 관통하는 공통 패턴이 있다. 첫째, **토큰 관리가 자동화의 생명줄**이다. Facebook/Instagram의 Page Token은 만료되지 않지만 비밀번호 변경으로 무효화될 수 있고, LinkedIn은 60일, Twitter OAuth2는 refresh token으로 갱신해야 한다. 둘째, Instagram과 Threads는 이미지를 **공개 URL로만** 제공할 수 있으므로 Cloudinary, imgBB, S3 같은 이미지 호스팅이 사실상 필수다. 셋째, **TikTok의 감사(audit) 요건과 LinkedIn의 승인 절차**는 수주가 걸릴 수 있으므로 프로젝트 초기에 신청해야 한다.

가장 빠르게 시작할 수 있는 플랫폼은 **Bluesky와 Mastodon**(앱 리뷰 불필요, 오픈 프로토콜), 가장 복잡한 플랫폼은 **LinkedIn과 TikTok**(승인 절차 + 복잡한 3단계 업로드)이다. 비용 측면에서 Twitter/X만 유일하게 유료 tier 구조를 가지고 있으며, 나머지는 모두 API 자체를 무료로 사용할 수 있다. 2025년의 SNS 자동화는 기술적 난이도보다 각 플랫폼의 정책 변화를 추적하는 것이 더 큰 도전이다.