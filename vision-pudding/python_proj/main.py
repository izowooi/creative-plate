import gradio as gr
from PIL import Image
import pytesseract

def process_image(image: Image.Image, language: str) -> str:
    """
    업로드된 이미지와 선택된 언어를 받아 OCR을 수행하고, 추출된 텍스트를 반환합니다.
    """
    if image is None:
        return "이미지가 없습니다."
    try:
        # Pytesseract로 OCR 수행
        # language가 'jpn'이면 일본어, 'eng'이면 영어, 'chi_sim'이면 간체 중국어 등
        text = pytesseract.image_to_string(image, lang=language)
        return text.strip() if text else "텍스트를 추출하지 못했습니다."
    except Exception as e:
        return f"OCR 처리 중 오류가 발생했습니다: {e}"

def reset_app():
    """
    이미지 입력, 언어 선택, 결과 텍스트를 모두 초기화합니다.
    """
    # image_input, language_input, output_text 순서대로 리턴
    return None, "jpn", ""

with gr.Blocks() as demo:
    gr.Markdown("## 이미지 입력 → 언어 선택 → OCR 실행 → 결과 보기 → Clear로 초기화")

    with gr.Row():
        # 이미지 입력
        image_input = gr.Image(
            type="pil",  # PIL Image로 받음
            label="이미지를 붙여넣거나 업로드하세요"
        )

        # OCR 언어 선택
        language_input = gr.Dropdown(
            choices=["jpn", "eng", "chi_sim"],  # 일본어, 영어, 간체중국어 예시
            value="jpn",  # 기본값 - 일본어
            label="인식할 언어 선택"
        )

        # 버튼 2개: '동작 버튼', '리셋 버튼'
        btn_process = gr.Button("OCR")
        btn_reset = gr.Button("Clear")

    # OCR 결과를 출력할 텍스트박스
    output_text = gr.Textbox(label="결과물", value="", lines=8)

    # "동작 버튼" 클릭 → process_image 호출
    # inputs: image_input, language_input
    # outputs: output_text
    btn_process.click(
        fn=process_image,
        inputs=[image_input, language_input],
        outputs=output_text
    )

    # "리셋 버튼" 클릭 → reset_app 호출
    # 입력들(image_input, language_input)과
    # 출력(output_text)도 동시에 리셋
    btn_reset.click(
        fn=reset_app,
        inputs=[],
        outputs=[image_input, language_input, output_text]
    )

demo.launch(server_name="0.0.0.0", server_port=7860)