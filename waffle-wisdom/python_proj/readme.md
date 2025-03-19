# google cloud run
## CLI

Cloud Run이 사용하는 서비스 계정을 확인하려면 아래 명령어를 실행하세요.
```bash
gcloud run services describe secret-test-function \
    --region=YOUR_REGION \
    --project=YOUR_PROJECT_ID
```

아래 명령어를 실행하여 해당 서비스 계정이 Secret Manager에 접근할 수 있도록 설정합니다.
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member=serviceAccount:YOUR_SERVICE_ACCOUNT \
    --role=roles/secretmanager.secretAccessor
```

## Local Test
유튜브 Cloud Functions local debugging : https://youtu.be/v6ll4UxS0Os?si=rUBcR4oTxwWZ-156

Cloud Functions Framework를 설치합니다.
```bash
npm install @google-cloud/functions-framework 
```
Google Cloud 계정으로 인증합니다.
```bash
gcloud auth application-default login
```
아래 명령어를 실행하면 Cloud Run에서 실행될 Python 함수를 로컬에서 실행할 수 있습니다.
```bash
functions-framework --target=hello_http --debug
```

## Build
아래 명령어는 Cloud Run 에서 실행될 애플리케이션을 로컬에서 실행하고 디버깅할 수 있도록 지원하는 Google Cloud의 베타 기능입니다.
```bash
gcloud beta code dev 
```

## Deploy
아래 명령어를 실행하여 Cloud Run에 서비스를 배포합니다.
```bash
gcloud run deploy secret-test-function \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --project fresh-mint-63c38 \
  --clear-base-image
```