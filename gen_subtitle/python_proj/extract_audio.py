import argparse
import subprocess
import os
import time
import logging

logging.basicConfig(
    level=logging.DEBUG,  # 로그 레벨 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    format='%(asctime)s - %(levelname)s - %(message)s',  # 로그 포맷
    datefmt='%Y-%m-%d %H:%M:%S',  # 날짜/시간 포맷
    handlers = [
        logging.FileHandler("extract_audio_processing.log"),  # 파일 출력
        logging.StreamHandler()  # 콘솔 출력
    ]
)

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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Extract audio from video')
    parser.add_argument('--input_video', required=True, help='Input video file path')
    parser.add_argument('--output_audio', required=True, help='Output audio file path')
    parser.add_argument('--start_time', type=int, default=0, help='Start time in seconds')
    parser.add_argument('--end_time', type=int, default=0, help='End time in seconds')

    args = parser.parse_args()

    original_video = args.input_video
    trimmed_video = 'trimmed_' + original_video
    audio_file = args.output_audio
    start_time_sec = args.start_time
    end_time_sec = args.end_time

    # audio_file = 'audio_0_end.mp3'
    # end_time_sec = 0 * 60 #0분

    logging.info(f"프로그램 시작: Input video: {original_video}, Output audio: {audio_file}")
    logging.info(f"Start time: {start_time_sec}, End time: {end_time_sec}")
    start_time = time.perf_counter()

    if end_time_sec > 0:
        trim_video(original_video, trimmed_video, start_time_sec=start_time_sec, end_time_sec=end_time_sec)
        extract_audio_to_mp3(trimmed_video, audio_file)
        print(f"잘라낸 영상: {trimmed_video}")
    else:
        extract_audio_to_mp3(original_video, audio_file)

    end_time = time.perf_counter()
    elapsed_time = end_time - start_time

    logging.info(f"추출된 오디오 파일(mp3): {audio_file}")
    logging.info(f"소요된 시간: {elapsed_time:.2f} seconds")