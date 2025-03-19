import os
from google.cloud import secretmanager
from flask import Flask, request, jsonify
from persona import PersonaAI


def get_secret(secret_name="waffle_wisdom_open_ai", project_id="fresh-mint-63c38"):
    """
    Google Cloud Secret Manager에서 비밀 값을 가져오는 함수
    """
    client = secretmanager.SecretManagerServiceClient()
    secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"

    response = client.access_secret_version(request={"name": secret_path})
    secret_value = response.payload.data.decode("UTF-8")

    return secret_value[:10]  # 앞 5글자만 반환

app = Flask(__name__)
# OpenAI API 키 가져오기
openai_api_key = get_secret()

# PersonaAI 객체 생성
persona_ai = PersonaAI(openai_api_key)


@app.route("/", methods=["POST"])
def hello_http(*args):
    """Flask API 엔드포인트"""
    # Cloud Functions 환경일 경우, request 객체를 args[0]으로 받음
    if args:
        req = args[0]
    else:
        req = request  # Flask에서는 기본 request 객체 사용
    """Flask API 엔드포인트"""
    try:
        # JSON 요청 확인
        request_data = req.get_json()

        if not request_data:
            return jsonify({"error": "잘못된 요청입니다. JSON 데이터를 포함해야 합니다."}), 400

        question = request_data.get("question", "")
        if not question:
            return jsonify({"error": "question 필드가 필요합니다."}), 400

        return jsonify({"message": f"Hello {question} World!"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Flask 애플리케이션 실행 (PORT=8080)
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))  # Cloud Run이 제공하는 포트 사용
    app.run(host="192.168.0.1", port=port)