import os
import logging
import gradio as gr
from translate import translate_srt_file as translate_srt

# logging 설정
logging.basicConfig(
    level=logging.DEBUG,  # 로그 레벨 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    format='%(asctime)s - %(levelname)s - %(message)s',  # 로그 포맷
    datefmt='%Y-%m-%d %H:%M:%S',  # 날짜/시간 포맷
    handlers=[
        logging.FileHandler("gradio_processing.log"),  # 파일 출력
        logging.StreamHandler()                       # 콘솔 출력
    ]
)


def build_gradio_interface():
    with gr.Blocks() as demo:
        gr.Markdown("# SRT 파일 번역 (DeepL / GPT2)")

        with gr.Row():
            # 1) SRT 파일 업로드
            srt_file = gr.File(label="SRT 파일 업로드", file_types=[".srt"])

            # 2) 언어 설정
            source_lang = gr.Dropdown(
                choices=["EN", "JA", "ZH", "KO"],
                value="JA",
                label="소스 언어"
            )
            target_lang = gr.Dropdown(
                choices=["EN", "KO", "JA", "ZH"],
                value="KO",
                label="타겟 언어"
            )

            # 3) 타임 시프트
            time_shift = gr.Slider(
                minimum=-60,
                maximum=120,
                value=0,
                step=1,
                label="타임 시프트(초)"
            )

        with gr.Row():
            # 인증키 (옵션)
            auth_key = gr.Textbox(
                label="DeepL Auth Key",
                value="",  # 비어있으면 환경변수에서 가져가도록
                placeholder="(옵션) Deepl API Key를 명시적으로 넣을 수도 있음"
            )

        # 시작 버튼
        start_button = gr.Button("번역 시작")

        # 출력 영역
        output_log = gr.Textbox(
            label="로그",
            lines=15,
            interactive=False
        )
        output_srt_file = gr.File(label="번역된 SRT 다운로드")

        # 버튼 동작 설정
        start_button.click(
            fn=translate_srt_file,
            inputs=[srt_file, source_lang, target_lang, time_shift, auth_key],
            outputs=[output_log, output_srt_file]
        )

    return demo

def translate_srt_file(srt_file, source_lang, target_lang, time_shift, auth_key):
    if srt_file is None:
        msg = "[오류] SRT 파일이 없습니다."
        logging.error(msg)
        return msg, None

    src_file_path = srt_file.name
    base_name = os.path.basename(src_file_path)
    dir_name = os.path.dirname(src_file_path)
    output_file_path = os.path.join(dir_name, f"translated_{base_name}")

    logging.info(f"입력 SRT 파일: {src_file_path}")
    logging.info(f"출력 SRT 파일: {output_file_path}")
    logging.info(f"소스 언어: {source_lang}")
    logging.info(f"타겟 언어: {target_lang}")
    logging.info(f"타임 시프트: {time_shift}")
    logging.info(f"인증키: {auth_key}")

    result_log = translate_srt(src_file_path, output_file_path, source_lang, target_lang, time_shift, auth_key)

    final_log = f"번역이 완료되었습니다.\n\n자세한 내용은 로그 파일(gradio_processing.log)과 콘솔을 확인하세요.\n\n{result_log or ''}"

    return final_log, output_file_path


if __name__ == "__main__":
    demo = build_gradio_interface()
    demo.launch()
