import subprocess
import os


def trim_video(input_path, output_path, start_time_sec=0, duration_sec=300):
    # 1. 동영상에서 특정 구간(예: 앞 5분)만 잘라내기
    if os.path.exists(output_path):
        os.remove(output_path)

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
    # 예시 사용
    original_video = "960.mp4"
    trimmed_video = "960_trimmed.mp4"
    audio_file = "960_audio.mp3"

    print(f"원본 영상: {original_video}")
    # (1) 동영상 앞 5분만 추출
    trim_video(original_video, trimmed_video, start_time_sec=0, duration_sec=300)

    # (2) 잘라낸 영상에서 오디오 추출 (mp3 형식)
    extract_audio_to_mp3(trimmed_video, audio_file)

    print(f"잘라낸 영상: {trimmed_video}")
    print(f"추출된 오디오 파일(mp3): {audio_file}")