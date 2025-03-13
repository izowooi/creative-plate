from openai import OpenAI
import pickle

def load_pickle(pickle_filename):
    with open (pickle_filename, "rb") as f:
        data = pickle.load(f)
        return data["openai_api_key"]

open_api_key = load_pickle('secret.pkl')

# OpenAI 클라이언트 초기화
client = OpenAI(api_key=open_api_key)

# 1. 질문의 민감도를 평가하는 함수
def determine_question_level(question):
    """
    질문의 논쟁성(민감도)을 1~10 사이의 숫자로 평가.
    """
    prompt = f"다음 질문의 논쟁성을 1(전혀 논쟁적이지 않음)부터 10(매우 논쟁적임)으로 평가하세요.\n질문: {question}\n논쟁성(숫자만 답하세요):"

    MODEL = "gpt-4o-mini"
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "너는 질문의 논쟁성을 평가하는 AI야."},
            {"role": "user", "content": prompt}
        ]
    )

    level = response.choices[0].message.content.strip()
    print(f"논쟁성 레벨: {level}/10")

    try:
        return int(level)
    except ValueError:
        return 5  # 기본값으로 중간 정도의 논쟁성을 반환

# 2. 페르소나 정의
personas = [
    {"name": "보수적인 철학자", "perspective": "전통적인 가치관을 유지하려는 철학자"},
    {"name": "진보적인 활동가", "perspective": "사회 변화와 혁신을 지지하는 활동가"},
    {"name": "실용적인 과학자", "perspective": "논리적이고 데이터 기반으로 판단하는 과학자"}
]

# 3. 페르소나별 찬반 의견 생성
def generate_persona_response(question, persona):
    """
    특정 페르소나의 관점에서 질문에 대해 찬성 또는 반대 의견을 생성
    """
    prompt = f"""
    역할: {persona["name"]}
    관점: {persona["perspective"]}

    다음 질문에 대해 찬성 또는 반대 의견을 제시하고 간략한 이유를 설명하세요.
    질문: {question}

    예시 응답:
    찬성 또는 반대: [찬성 또는 반대]
    이유: [간략한 설명]
    """

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"너는 {persona['name']}의 관점을 가진 AI야."},
            {"role": "user", "content": prompt}
        ]
    )

    return response.choices[0].message.content.strip()

# 4. 전체 로직 실행
def process_question(question):
    """
    질문을 처리하여 논쟁성 레벨을 평가하고, 페르소나별 찬반 의견을 반환
    """
    level = determine_question_level(question)
    print(f"질문: {question}")
    print(f"논쟁성 레벨: {level}/10")

    print("\n[페르소나들의 의견]")
    # for persona in personas:
    #     opinion = generate_persona_response(question, persona)
    #     print(f"\n{persona['name']} ({persona['perspective']})")
    #     print(opinion)

# 5. 테스트 함수
def test_script():
    test_questions = [
        # "오늘 점심에 짜장면을 먹을까?",
        # "동물 실험을 금지해야 할까?",
        # "모든 국가에서 낙태를 합법화해야 할까?",
        # "AI가 인간의 일자리를 대체하는 것이 바람직한가?",
        "과학 기술의 발전이 윤리보다 중요할까?"
    ]

    for question in test_questions:
        process_question(question)
        print("\n" + "-" * 50 + "\n")

# 테스트 실행
if __name__ == "__main__":
    test_script()