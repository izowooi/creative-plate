
.env file should contain the following:
DEEPL_AUTH_KEY=your_auth_key

```bash
pip install ffmpeg-python
```

# Usage
## 음성 파일 추출
python extract_audio.py --input_file input.mp4 --output_file output.wav

## srt 파일 생성
네이버 클로바 노트 참조

## srt 파일 번역
python translate_srt.py --input_file input.srt --output_file output.srt [--source_lang ko] [--target_lang ko] [--auth_key your_auth_key]