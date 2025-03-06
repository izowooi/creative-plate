import os
import logging
import subprocess

logger = logging.getLogger(__name__)

def trim_video(input_path, output_path, start_time_sec=0, end_time_sec=None):
    if os.path.exists(output_path):
        os.remove(output_path)
        logging.info(f"기존에 존재하던 파일 삭제: {output_path}")

    if end_time_sec is None:
        end_time_sec = start_time_sec + 300

    duration_sec = end_time_sec - start_time_sec
    command = [
        "ffmpeg",
        "-i", input_path,
        "-ss", str(start_time_sec),
        "-t", str(duration_sec),
        "-c", "copy",
        output_path
    ]
    logging.info(f"동영상 자르기: {input_path} -> {output_path}")
    logging.debug(f"FFmpeg 명령어: {' '.join(command)}")
    subprocess.run(command, check=True)
    logging.info(f"동영상 자르기 완료: {output_path}")
    return output_path


def extract_audio_to_mp3(input_path, output_audio_path):
    if os.path.exists(output_audio_path):
        os.remove(output_audio_path)
        logging.info(f"기존에 존재하던 파일 삭제: {output_audio_path}")

    command = [
        "ffmpeg",
        "-i", input_path,
        "-vn",
        "-ar", "44100",
        "-ac", "2",
        "-b:a", "192k",
        output_audio_path
    ]
    logging.info(f"오디오 추출 시작: {input_path} -> {output_audio_path}")
    logging.debug(f"FFmpeg 명령어: {' '.join(command)}")
    subprocess.run(command, check=True)
    logging.info(f"오디오 추출 완료: {output_audio_path}")
    return output_audio_path


