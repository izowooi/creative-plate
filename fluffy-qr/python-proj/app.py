#!/usr/bin/env python3
import gradio as gr
import qrcode.constants
from qr_generator import generate_qr_code
import os

# 에러 보정율 선택을 위한 맵핑
ERROR_CORRECTION_MAP = {
    "L (7%)": qrcode.constants.ERROR_CORRECT_L,
    "M (15%, 기본)": qrcode.constants.ERROR_CORRECT_M,
    "Q (25%)": qrcode.constants.ERROR_CORRECT_Q,
    "H (30%)": qrcode.constants.ERROR_CORRECT_H
}

def make_qr(
    text,
    show_adv,
    version,
    error_correction_str,
    box_size,
    border
):
    """
    Gradio 버튼 클릭시 실행되는 함수
    """
    # '고급 설정'을 체크하지 않았다면 기본값 사용
    if not show_adv:
        version = None
        error_correction = qrcode.constants.ERROR_CORRECT_M
        box_size = 10
        border = 4
    else:
        # 고급 설정을 사용한다면 에러 보정율 스트링 -> 실제 상수로 변환
        error_correction = ERROR_CORRECTION_MAP[error_correction_str]

    img, temp_file = generate_qr_code(
        data=text,
        version=version,
        error_correction=error_correction,
        box_size=box_size,
        border=border
    )

    if img is None:
        return None, None

    return img, temp_file


def clear_inputs():
    """
    '리셋 (Clear)' 버튼 눌렀을 때의 동작.
    모든 입력값을 초기화시키고, 출력도 초기화한다.
    """
    return (
        "",          # 텍스트 입력
        False,       # 고급 설정 표시 여부
        gr.update(visible=False),  # 고급설정 패널 자체를 숨김
        1,           # version 슬라이더 초기값
        "M (15%, 기본)", # 에러보정 라디오 초기값
        10,          # box_size 초기값
        4,           # border 초기값
        None,        # 이미지 미리보기
        None         # 파일 다운로드
    )


with gr.Blocks() as demo:
    gr.Markdown("# QR Code 생성기")

    # 입력: 변환할 텍스트
    with gr.Row():
        text_input = gr.Textbox(label="QR 코드로 만들 텍스트를 입력하세요:")

    # 고급설정 보이기/숨기기 체크박스
    show_adv_check = gr.Checkbox(label="고급 설정 보기", value=False)

    # 고급설정 영역 (기본적으로 숨김)
    with gr.Group(visible=False) as adv_panel:
        gr.Markdown("### 고급 설정")
        version_slider = gr.Slider(
            minimum=1, maximum=40, step=1,
            value=1, label="버전 (1~40)"
        )
        error_correction_radio = gr.Radio(
            choices=list(ERROR_CORRECTION_MAP.keys()),
            value="M (15%, 기본)",
            label="에러 보정율"
        )
        box_size_slider = gr.Slider(
            minimum=1, maximum=20, step=1,
            value=10, label="박스 크기(box_size)"
        )
        border_slider = gr.Slider(
            minimum=1, maximum=10, step=1,
            value=4, label="테두리 두께(border)"
        )

    # 버튼들
    with gr.Row():
        generate_btn = gr.Button("실행")
        clear_btn = gr.Button("리셋 (Clear)")

    # 출력: 이미지 미리보기 + 다운로드 링크
    #  - 첫번째 출력: gr.Image (화면에 표시)
    #  - 두번째 출력: gr.File (다운로드 버튼 표시)
    output_image = gr.Image(label="QR 코드 미리보기")
    output_file = gr.File(label="QR 코드 다운로드")

    # 고급설정 표시여부가 바뀔 때마다, 고급설정 패널의 가시성 업데이트
    show_adv_check.change(
        fn=lambda x: gr.update(visible=x),
        inputs=show_adv_check,
        outputs=adv_panel
    )

    # '실행' 버튼
    generate_btn.click(
        fn=make_qr,
        inputs=[
            text_input,
            show_adv_check,
            version_slider,
            error_correction_radio,
            box_size_slider,
            border_slider
        ],
        outputs=[
            output_image,
            output_file
        ]
    )

    # '리셋(Clear)' 버튼
    clear_btn.click(
        fn=clear_inputs,
        inputs=[],
        outputs=[
            text_input,
            show_adv_check,
            adv_panel,
            version_slider,
            error_correction_radio,
            box_size_slider,
            border_slider,
            output_image,
            output_file
        ],
        queue=False
    )

demo.launch()