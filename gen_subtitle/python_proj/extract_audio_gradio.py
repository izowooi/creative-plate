# gradio_extract_audio.py
import gradio as gr
import os
import tempfile
import logging
from extract_audio_core import trim_video, extract_audio_to_mp3

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def process_video(video_file, start_time, end_time):
    """
    Gradio에서 호출할 함수.
    업로드된 동영상 파일 경로(video_file), 시작/끝 시각을 받아서
    오디오 MP3 파일을 추출 후 경로를 반환합니다.
    """
    if not video_file:
        return "동영상 파일이 업로드되지 않았습니다.", None

    # 임시 폴더에 저장할 파일명 결정
    base_name = os.path.basename(video_file)
    trimmed_name = "trimmed_" + base_name
    audio_name = os.path.splitext(base_name)[0] + ".mp3"

    # 실제 파일 경로 (tempfile.gettempdir() 사용)
    trimmed_path = os.path.join(tempfile.gettempdir(), trimmed_name)
    audio_path = os.path.join(tempfile.gettempdir(), audio_name)

    # end_time이 0 이하이면 자르지 않고 전체 음원을 추출
    if end_time > 0 and end_time > start_time:
        trim_video(video_file, trimmed_path, start_time, end_time)
        extract_audio_to_mp3(trimmed_path, audio_path)
    else:
        extract_audio_to_mp3(video_file, audio_path)

    # 결과 리턴: (메시지, 오디오파일경로)
    return f"오디오 추출 완료: {audio_path}", audio_path

with gr.Blocks() as demo:
    gr.Markdown("## 동영상 → 오디오(MP3) 추출 데모")

    with gr.Row():
        video_input = gr.Video(label="비디오 파일을 업로드하세요")
        start_time = gr.Number(label="시작 시간(초)", value=0)
        end_time = gr.Number(label="끝 시간(초, 0이면 전체)", value=0)

    # 버튼
    btn_extract = gr.Button("오디오 추출")

    # 출력
    result_text = gr.Textbox(label="결과 메시지")
    # Gradio에서 오디오 파일을 재생/다운로드 가능하도록
    audio_output = gr.Audio(label="추출된 오디오 미리듣기", type="filepath")

    btn_extract.click(
        fn=process_video,
        inputs=[video_input, start_time, end_time],
        outputs=[result_text, audio_output]
    )

demo.launch(server_name="0.0.0.0", server_port=7860)