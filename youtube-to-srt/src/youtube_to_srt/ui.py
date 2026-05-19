"""Gradio UI 조립 및 진입점."""
from __future__ import annotations

from pathlib import Path

import gradio as gr

from youtube_to_srt.core import MAX_URLS, Mode
from youtube_to_srt.extractor import AudioExtractor
from youtube_to_srt.transcriber import LocalWhisperBackend, make_transcribe_fn
from youtube_to_srt.ui_handlers import handle_submit

DEFAULT_MODEL = "small"
DEFAULT_LANGUAGE = "en"
MODEL_CHOICES = ["tiny", "base", "small", "medium", "large-v3"]


def build_app(
    *,
    preload_backend: bool = True,
    model_name: str = DEFAULT_MODEL,
    language: str = DEFAULT_LANGUAGE,
) -> gr.Blocks:
    """Gradio Blocks 앱을 구성한다.

    - `preload_backend=True` 면 Whisper 모델을 앱 시작 시 로드해 첫 클릭 지연 제거.
    - 같은 backend 인스턴스가 모든 세션에서 공유된다 (단일 프로세스 전제).
    """
    # 백엔드 프리로드 (세션 공유)
    backend = LocalWhisperBackend(model_name=model_name, language=language)
    if preload_backend:
        backend._get_model()  # noqa: SLF001 — 의도적 사전 로드

    transcribe_fn = make_transcribe_fn(backend)

    custom_css = """
footer {display: none !important;}
.app-footer, .app-footer p, .app-footer a {
    text-align: center;
    font-size: 0.78em;
    color: var(--body-text-color-subdued, #888);
}
.app-footer {margin-top: 1.5em; opacity: 0.7;}
"""

    with gr.Blocks(title="YouTube to SRT", css=custom_css) as demo:
        gr.Markdown(
            f"""# YouTube to SRT
YouTube URL을 한 줄에 하나씩 최대 **{MAX_URLS}개**까지 입력하세요. `#`으로 시작하는 줄은 무시됩니다.
기본 모드는 **음성만 추출**이며, 전사는 로컬 `faster-whisper`로 수행됩니다.
"""
        )

        with gr.Row():
            with gr.Column(scale=1):
                urls_box = gr.Textbox(
                    label="URLs",
                    lines=10,
                    placeholder="https://www.youtube.com/watch?v=...\nhttps://youtu.be/...",
                )
                mode_radio = gr.Radio(
                    choices=[m.value for m in Mode],
                    value=Mode.EXTRACT.value,
                    label="모드",
                    info="extract: 음성만 / transcribe: 오디오 파일→SRT / all: 둘 다",
                )
                model_dd = gr.Dropdown(
                    choices=MODEL_CHOICES,
                    value=model_name,
                    label="Whisper 모델",
                    info="변경 시 다음 실행부터 적용 (재로드 발생)",
                )
                audio_dir_box = gr.Textbox(value="audio", label="오디오 저장 폴더")
                srt_dir_box = gr.Textbox(value="srt", label="SRT 저장 폴더")
                submit_btn = gr.Button("실행", variant="primary")

            with gr.Column(scale=1):
                status_df = gr.Dataframe(
                    headers=["#", "URL", "상태", "메시지"],
                    datatype=["str", "str", "str", "str"],
                    label="진행 상태",
                    interactive=False,
                    wrap=True,
                )
                progress_md = gr.Markdown("대기 중")
                downloads = gr.Files(label="다운로드", interactive=False)

        # 현재 선택된 모델/언어로 백엔드를 교체 후 핸들러 호출
        current_state = {"model": model_name, "language": language}

        def _submit(
            urls_text: str,
            mode_value: str,
            model_value: str,
            audio_dir: str,
            srt_dir: str,
            progress: gr.Progress = gr.Progress(track_tqdm=False),
        ):
            nonlocal backend, transcribe_fn
            # 모델이 바뀌면 새 백엔드 생성 (로드는 처음 transcribe 시 lazy)
            if model_value != current_state["model"]:
                backend = LocalWhisperBackend(
                    model_name=model_value,
                    language=current_state["language"],
                )
                transcribe_fn = make_transcribe_fn(backend)
                current_state["model"] = model_value

            extractor = AudioExtractor(audio_dir=Path(audio_dir))

            try:
                gen = handle_submit(
                    urls_text=urls_text,
                    mode_value=mode_value,
                    audio_dir=audio_dir,
                    srt_dir=srt_dir,
                    extractor=extractor,
                    transcribe_fn=transcribe_fn,
                )
            except ValueError as e:
                raise gr.Error(str(e))

            for upd in gen:
                done, total = upd.progress
                if total > 0:
                    progress((done, total), desc=f"{done}/{total}")
                status_md = (
                    upd.message
                    if upd.message
                    else (f"진행 중… {done}/{total}" if upd.running else "대기 중")
                )
                yield (
                    gr.update(value=upd.rows),
                    status_md,
                    gr.update(value=upd.files if upd.files else None),
                    gr.update(interactive=not upd.running),
                )

        submit_btn.click(
            fn=_submit,
            inputs=[urls_box, mode_radio, model_dd, audio_dir_box, srt_dir_box],
            outputs=[status_df, progress_md, downloads, submit_btn],
        )

        gr.Markdown(
            "개인 정보를 소중히 합니다. 입력하신 URL과 처리 결과는 어디에도 저장되지 않습니다. · "
            "[소스 코드](https://github.com/izowooi/creative-plate/tree/main/youtube-to-srt)",
            elem_classes=["app-footer"],
        )

    return demo


def main() -> int:
    demo = build_app()
    demo.queue().launch(server_name="127.0.0.1")
    return 0
