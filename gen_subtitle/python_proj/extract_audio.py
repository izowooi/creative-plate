import argparse
import subprocess
import os


def trim_video(input_path, output_path, start_time_sec=0, end_time_sec=None):
    if os.path.exists(output_path):
        os.remove(output_path)

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
    subprocess.run(command, check=True)
    return output_path


def extract_audio_to_mp3(input_path, output_audio_path):
    # 2. 잘라낸 동영상 파일에서 오디오만 mp3로 추출
    if os.path.exists(output_audio_path):
        os.remove(output_audio_path)

    command = [
        "ffmpeg",
        "-i", input_path,
        "-vn",
        "-ar", "44100",
        "-ac", "2",
        "-b:a", "192k",
        output_audio_path
    ]
    subprocess.run(command, check=True)
    return output_audio_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Extract audio from video')
    parser.add_argument('--input_video', required=True, help='Input video file path')
    parser.add_argument('--output_audio', required=True, help='Output audio file path')
    parser.add_argument('--start_time', type=int, default=0, help='Start time in seconds')
    parser.add_argument('--end_time', type=int, default=300, help='End time in seconds')

    args = parser.parse_args()

    original_video = args.input_video
    trimmed_video = 'trimmed_' + original_video
    audio_file = args.output_audio
    start_time_sec = args.start_time
    end_time_sec = args.end_time

    print(f'Input video: {original_video}, Output audio: {audio_file}')
    print(f'Start time: {start_time_sec}')
    print(f'End time: {end_time_sec}')

    trim_video(original_video, trimmed_video, start_time_sec=start_time_sec, end_time_sec=end_time_sec)

    extract_audio_to_mp3(trimmed_video, audio_file)

    print(f"잘라낸 영상: {trimmed_video}")
    print(f"추출된 오디오 파일(mp3): {audio_file}")