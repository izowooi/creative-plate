import os
import time
import logging
import gradio as gr
import tempfile
from dotenv import load_dotenv

from translation_config import TranslationConfig
from translate import translate_srt_file as translate_srt


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

def translate_srt_file(srt_file, output_file_path, source_lang, target_lang, time_shift, auth_key):
    translate_srt(srt_file, output_file_path, source_lang, target_lang, time_shift, auth_key)


if __name__ == "__main__":
    demo = build_gradio_interface()
    demo.launch()
    # input_file_path = "test.srt"
    # output_file_path = "test_translated.srt"
    # source_lang = 'JA'
    # load_dotenv(verbose=True)
    #
    # DEEPL_AUTH_KEY = os.getenv('DEEPL_AUTH_KEY')
    #
    # translate_srt_file(input_file_path, output_file_path, source_lang, 'KO', 0, DEEPL_AUTH_KEY)
