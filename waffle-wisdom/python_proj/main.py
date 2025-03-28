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

    return secret_value  # 앞 5글자만 반환

app = Flask(__name__)
# OpenAI API 키 가져오기
openai_api_key = get_secret()

# PersonaAI 객체 생성
persona_ai = PersonaAI(openai_api_key)

@app.route("/persona/response", methods=["POST"])
def generate_persona_response(*args):
    try:
        # Cloud Functions 환경일 경우, request 객체를 args[0]으로 받음
        req = args[0] if args else request
        question = req.form.get("question")
        is_test = req.form.get("is_test", "true").lower() == "true"
        print(f"question: {question}, is_test: {is_test}")
        if not question:
            return jsonify({"error": "question 필드가 필요합니다."}), 400

        response = persona_ai.process_question(question, is_test)

        return jsonify(response)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Flask 애플리케이션 실행 (PORT=8080)
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))  # Cloud Run이 제공하는 포트 사용
    app.run(host="192.168.0.1", port=port)