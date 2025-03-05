print('hello world')
import gradio as gr
from PIL import Image

# 이미지를 받아 원하는 처리를 수행하는 함수(예시)
def process_image(image: Image.Image) -> str:
    # 예시 로직: 이미지 크기나 모드 등 간단한 정보를 반환
    if image is None:
        return "이미지가 없습니다."
    return f"이미지 정보: 크기={image.size}, 모드={image.mode}"

def reset_app():
    # 이미지 입력을 None으로, 출력 텍스트를 공백으로 리셋
    return None, ""

with gr.Blocks() as demo:
    # 타이틀 등 상단 정보
    gr.Markdown("## 이미지 입력 → 처리 → 결과 보기 → 리셋")

    with gr.Row():
        # 이미지를 넣는 컴포넌트
        image_input = gr.Image(
            type="pil",  # PIL Image로 받음
            label="이미지를 붙여넣거나 업로드하세요"
        )
        # 버튼 2개: '동작 버튼', '리셋 버튼'
        btn_process = gr.Button("동작 버튼")
        btn_reset = gr.Button("리셋 버튼")

    # 결과물을 텍스트 형태로 보여줄 컴포넌트
    output_text = gr.Textbox(label="결과물", value="")

    # "동작 버튼" 클릭 시 process_image 호출
    btn_process.click(
        fn=process_image,
        inputs=image_input,
        outputs=output_text
    )

    # "리셋 버튼" 클릭 시 reset_app 호출
    btn_reset.click(
        fn=reset_app,
        inputs=[],
        outputs=[image_input, output_text]
    )

demo.launch(server_name="0.0.0.0", server_port=7860)