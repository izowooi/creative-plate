import argparse
import subprocess
import os
import time
import logging

from extract_audio_core import trim_video, extract_audio_to_mp3

logging.basicConfig(
    level=logging.DEBUG,  # 로그 레벨 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    format='%(asctime)s - %(levelname)s - %(message)s',  # 로그 포맷
    datefmt='%Y-%m-%d %H:%M:%S',  # 날짜/시간 포맷
    handlers = [
        logging.FileHandler("extract_audio_processing.log"),  # 파일 출력
        logging.StreamHandler()  # 콘솔 출력
    ]
)

logger = logging.getLogger(__name__)

# 4시간짜리 영상은 대략 4분 정도 소요됨
def main():
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


if __name__ == "__main__":
    main()