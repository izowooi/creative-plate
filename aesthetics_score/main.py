from __future__ import annotations

import os
import tempfile
from typing import Dict, List, Optional

import gradio as gr

from app.services.aesthetic_scorer import AestheticScorer
from app.usecases.score_single import score_single_image, score_directory_average
from app.usecases.score_hierarchical_sample import (
    sample_folder_scores,
    results_to_json,
)


scorer = AestheticScorer()


def _get_path_from_file_like(file_like: object | None) -> Optional[str]:
    """Try to extract filesystem path from various Gradio file-like return types.

    Supports:
    - Newer Gradio dataclasses with `.path`
    - Dict with `{"path": str}`
    - Raw string path
    """
    if file_like is None:
        return None
    if isinstance(file_like, str):
        return file_like
    path = getattr(file_like, "path", None)
    if isinstance(path, str):
        return path
    if isinstance(file_like, dict) and isinstance(file_like.get("path"), str):
        return file_like["path"]
    return None


def ui_score_single_mixed(image_path_text: str, image_upload_path: object | None) -> float:
    """Accept either a text path or an uploaded image path (drag-and-drop)."""
    upload_path = _get_path_from_file_like(image_upload_path)
    target_path = upload_path or (image_path_text or None)
    if not target_path:
        return 0.0
    return score_single_image(target_path, scorer)


def ui_score_directory(dir_path: str):
    for progress, partial_avg in score_directory_average(dir_path, scorer):
        status = f"처리 중: {progress.current}/{progress.total}"
        yield status, (partial_avg or 0.0)


def _dict_to_table_rows(d: Dict[str, float]) -> List[List[object]]:
    return [[k, float(v)] for k, v in sorted(d.items())]


def _json_to_tempfile(json_str: str) -> str:
    fd, path = tempfile.mkstemp(prefix="aesthetic_scores_", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json_str)
    return path


def ui_score_hierarchical(base_dir: str, sample_size: int, seed: float | None):
    seed_int = int(seed) if seed is not None else None
    latest_json = "{}"
    latest_file_path = None
    for prog, partial in sample_folder_scores(base_dir, scorer, sample_size=sample_size, seed=seed_int):
        status = f"폴더 진행률: {prog.current_folder_index}/{prog.total_folders} - {prog.current_folder_name}"
        if partial is None:
            table = []
        else:
            table = _dict_to_table_rows(partial)
            latest_json = results_to_json(partial)
            latest_file_path = _json_to_tempfile(latest_json)
        yield status, table, latest_json, latest_file_path


with gr.Blocks(title="Aesthetic Score") as demo:
    gr.Markdown("""
    # Aesthetic Score
    단일 이미지, 폴더 평균, 아티스트별 샘플링 평균 점수를 계산합니다.
    """)

    with gr.Tab("단일 이미지"):
        inp_text = gr.Textbox(label="이미지 경로 (텍스트)")
        inp_upload = gr.Image(type="filepath", label="이미지 업로드 (드래그앤드롭)")
        btn = gr.Button("점수 계산")
        out = gr.Number(label="점수 (0~10)")
        btn.click(ui_score_single_mixed, inputs=[inp_text, inp_upload], outputs=out, queue=True)

    with gr.Tab("폴더 평균"):
        dir_inp = gr.Textbox(label="폴더 경로")
        btn2 = gr.Button("평균 계산")
        status2 = gr.Markdown()
        out2 = gr.Number(label="현재 평균")
        btn2.click(fn=ui_score_directory, inputs=dir_inp, outputs=[status2, out2], queue=True)

    with gr.Tab("하위 폴더 샘플링"):
        base_inp = gr.Textbox(label="베이스 폴더 (예: artists)")
        sample_inp = gr.Slider(1, 50, value=10, step=1, label="샘플 이미지 수 (폴더당)")
        seed_inp = gr.Number(value=None, precision=0, label="시드 (옵션)")
        btn3 = gr.Button("샘플링 평균 계산")
        status3 = gr.Markdown()
        table3 = gr.Dataframe(headers=["Artist", "Score"], datatype=["str", "number"], row_count=(0, "dynamic"))
        json3 = gr.Code(label="결과 JSON")
        file3 = gr.File(label="JSON 다운로드")

        btn3.click(
            fn=ui_score_hierarchical,
            inputs=[base_inp, sample_inp, seed_inp],
            outputs=[status3, table3, json3, file3],
            queue=True,
        )

if __name__ == "__main__":
    demo.queue().launch()