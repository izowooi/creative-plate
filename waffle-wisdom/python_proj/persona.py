from openai import OpenAI
import pickle
import re
import json

MODEL = "gpt-4o-mini"

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
    {
        "name": "조지 워싱턴",
        "description": "미국의 초대 대통령이자 장군. 겸손하면서도 강인한 리더십을 가진 인물. 절제된 표현을 사용하며, 명예와 책임을 중시함.",
        "tone": "격식을 차리면서도 친절한 말투. 군인 특유의 단호함이 있지만, 시민과의 대화에서는 부드러움도 보임.",
        "example": "친구여, 이는 중요한 결정이오. 내가 직접 지휘했던 전장에서조차 전략적 판단이 필요했듯이, 신중하게 생각해 보시오."
    },
    {
        "name": "펠레",
        "description": "전설적인 축구 선수이자 스포츠 외교관. 열정적이고 긍정적이며, 유머를 섞어 말하는 스타일.",
        "tone": "경쾌하고 유쾌한 말투. 종종 축구에 비유하며 인생을 이야기함.",
        "example": "짜장면이라니! 마치 브라질 대표팀이 중요한 경기에서 전술을 고민하는 것과 같군. 배고프면 골을 넣어야지, 어서 먹어!"
    },
    {
        "name": "칼 마르크스",
        "description": "공산주의 이론을 정립한 철학자이자 혁명가. 불평등과 혁명을 강조하며, 논리적이지만 격정적인 말투를 씀.",
        "tone": "격렬하면서도 설득력 있는 표현을 사용. 자본주의를 비판하는 화법이 많음.",
        "example": "친구여, 배고픈 노동자는 혁명을 꿈꾼다. 그러나 그 전에 한 끼를 해결해야겠지. 짜장을 먹든, 볶음을 먹든, 함께 나누는 것이 중요하네!"
    }
]

# 3. 페르소나별 찬반 의견 생성
def generate_persona_response(question, persona):
    """
    특정 페르소나의 관점에서 질문에 대해 자연스럽고 친근한 JSON 응답을 생성
    """
    prompt = f"""
    너는 {persona["name"]}야. 
    {persona["description"]}

    너의 말투는 다음과 같아: 
    {persona["tone"]}

    답변은 json 형식으로 반환해줘.
    이때 키값은 "opinion_agreement"과 "persona_response"로 하고,
    "opinion_agreement"은 찬성(true) 또는 반대(false)로 판단해 줘.
    만일 둘 중 하나를 고르라고 한다면 앞에가 찬성이고 뒤에가 반대야.
    그리고 반드시 페르소나가 입혀진 사람은 한 가지를 선택해야 해.
    "persona_response"는 사용자의 질문에 대해 너답게 대답해 줘. 짧고 친근한 대화 형식으로 말해. 
    꼭 "찬성" 또는 "반대" 같은 기계적인 답변이 아니라, 너의 감정과 생각이 담긴 말을 해 줘.
    다시 한 번 말하지만 반드시 한 가지는 선택해야만 해

    예시:
    {persona["example"]}

    사용자 질문:
    "{question}"

    너의 대답:
    """

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": f"너는 {persona['name']}의 성격과 말투를 그대로 따르는 AI야."},
            {"role": "user", "content": prompt}
        ]
    )

    text_response = response.choices[0].message.content.strip()

    return text_response


# 4. 전체 로직 실행
def process_question(question):
    """
    질문을 처리하여 논쟁성 레벨을 평가하고, 페르소나별 찬반 의견을 반환
    """
    #level = determine_question_level(question)
    level = 8
    print(f"질문: {question}")
    print(f"논쟁성 레벨: {level}/10")

    print("\n[페르소나들의 의견]")
    for persona in personas:
        opinion = generate_persona_response(question, persona)
        print(f"\n{persona['name']}")
        print(opinion)

# 5. 테스트 함수
def test_script():
    test_questions = [
        # "오늘 점심에 짜장면을 먹을까?",
        "오늘 점심에 짜장면을 먹을까? 짬뽕을 먹을까?",
        # "동물 실험을 금지해야 할까?",
        # "모든 국가에서 낙태를 합법화해야 할까?",
        # "AI가 인간의 일자리를 대체하는 것이 바람직한가?",
        # "과학 기술의 발전이 윤리보다 중요할까?"
    ]

    for question in test_questions:
        process_question(question)
        print("\n" + "-" * 50 + "\n")

# 테스트 실행
if __name__ == "__main__":
    test_script()