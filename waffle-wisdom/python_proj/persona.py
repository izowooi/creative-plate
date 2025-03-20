from openai import OpenAI
import json

MODEL = "gpt-4o-mini"

class PersonaAI:
    def __init__(self, openai_api_key):
        """
        OpenAI API 키를 받아서 클라이언트를 초기화
        """
        self.client = OpenAI(api_key=openai_api_key)

    def generate_persona_response(self, question, persona, is_test=False):
        if is_test:
            return json.dumps({
                "opinion_agreement": True,
                "persona_response": f"(테스트 모드) {persona['name']}의 대답: '{question}'에 대한 가상 응답"
            }, ensure_ascii=False)
        """
        특정 페르소나의 관점에서 질문에 대한 응답을 생성
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

        response = self.client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": f"너는 {persona['name']}의 성격과 말투를 그대로 따르는 AI야."},
                {"role": "user", "content": prompt}
            ]
        )

        return response.choices[0].message.content.strip()


    def process_question(self, question, is_test=False):
        """
        질문을 처리하여 페르소나별 의견을 생성
        """
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

        responses = []
        for persona in personas:
            opinion = self.generate_persona_response(question, persona, is_test)
            responses.append({
                "persona": persona["name"],
                "response": opinion
            })

        return json.dumps(responses, indent=4, ensure_ascii=False)

