import functions_framework
from google.cloud import secretmanager


def get_secret(secret_name="waffle_wisdom_open_ai", project_id="YOUR_PROJECT_ID"):
    """
    Google Cloud Secret Manager에서 비밀 값을 가져오는 함수
    """
    client = secretmanager.SecretManagerServiceClient()
    secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"

    response = client.access_secret_version(request={"name": secret_path})
    secret_value = response.payload.data.decode("UTF-8")

    return secret_value[:5]  # 앞 5글자만 반환


@functions_framework.http
def hello_http(request):
    """HTTP Cloud Function"""
    project_id = "fresh-mint-63c38"  # 여기에 실제 Google Cloud 프로젝트 ID 입력
    secret_value = get_secret(project_id=project_id)

    return f"Hello {secret_value} World!"