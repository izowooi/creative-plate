import argparse
import os
import re
import time
import logging
import requests
from dotenv import load_dotenv
from translation_config import TranslationConfig

logging.basicConfig(
    level=logging.DEBUG,  # 로그 레벨 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    format='%(asctime)s - %(levelname)s - %(message)s',  # 로그 포맷
    datefmt='%Y-%m-%d %H:%M:%S',  # 날짜/시간 포맷
    handlers = [
        logging.FileHandler("translate_processing.log"),  # 파일 출력
        logging.StreamHandler()  # 콘솔 출력
    ]
)

load_dotenv(verbose=True)

DEEPL_AUTH_KEY = os.getenv('DEEPL_AUTH_KEY')
input_file_path = "960_audio.srt"
output_file_path = "960_audio_translated.srt"


def translate_list_deepl(text_list: list[str], config: TranslationConfig) -> list[str]:
    logging.debug("Sending text to DeepL API for translation.")
    url_for_deepl = 'https://api-free.deepl.com/v2/translate'
    params = {
        'auth_key': DEEPL_AUTH_KEY,
        'text': text_list,
        'source_lang': config.source_lang,
        'target_lang': config.target_lang
    }
    try:
        result = requests.post(url_for_deepl, data=params, verify=True)
        result.raise_for_status()
        #translated_text = result.json()['translations'][0]["text"]
        translated_text = [ item['text'] for item in result.json()['translations'] ]
        logging.debug("Translation successful.")
        return translated_text
    except Exception as e:
        logging.error(f"Error during translation: {e}", exc_info=True)
        return text_list


def translate_request_deepl(text: str, config: TranslationConfig) -> str:
#    return text  # 테스트용: 번역 API 호출을 건너뛰고 원문 그대로 반환
    logging.debug("Sending text to DeepL API for translation.")
    url_for_deepl = 'https://api-free.deepl.com/v2/translate'
    params = {
        'auth_key': DEEPL_AUTH_KEY,
        'text': text,
        'source_lang': config.source_lang,
        'target_lang': config.target_lang
    }
    try:
        result = requests.post(url_for_deepl, data=params, verify=True)
        result.raise_for_status()
        translated_text = result.json()['translations'][0]["text"]
        logging.debug("Translation successful.")
        return translated_text
    except Exception as e:
        logging.error(f"Error during translation: {e}", exc_info=True)
        return text


def remove_bracketed_participants(line: str):
    pattern = r'(\[참석자\s*\d+\])'
    found = re.findall(pattern, line)  # 예: ["[참석자 2]"]
    line_cleaned = re.sub(pattern, '', line)  # 대사에서 제거
    logging.debug(f"Processed line: '{line}' -> '{line_cleaned}', brackets: {found}")
    return line_cleaned.strip(), found  # (정리된 대사, [참석자들] 리스트)


"""
SRT 파일의 모든 줄(list of str)을 받아서,
다음 형태의 블록 리스트를 반환한다.

[
  {
     'index': "1",
     'time': "00:00:00,000 --> 00:00:02,000",
     'text_lines': ["대사줄1", "대사줄2", ...]
  },
  { ... },
  ...
]
"""
def parse_srt_blocks(lines):
    blocks = []
    current_block = {
        'index': None,
        'time': None,
        'text_lines': []
    }

    stage = 0  # 0: index 기다림, 1: time 기다림, 2: text 수집

    for line in lines:
        stripped = line.strip('\n')

        if stage == 0:  # index
            if stripped.isdigit():
                current_block['index'] = stripped
                stage = 1
            # else: 공백이나 예외상황은 무시
        elif stage == 1:  # time
            if "-->" in stripped:
                current_block['time'] = stripped
                stage = 2
        elif stage == 2:  # text 수집
            # 다음 인덱스를 만나면 블록 종료
            if stripped.isdigit():
                blocks.append(current_block)
                # 새 블록
                current_block = {
                    'index': stripped,
                    'time': None,
                    'text_lines': []
                }
                stage = 1
            elif stripped == "":
                # 빈 줄 -> 블록 종료
                blocks.append(current_block)
                current_block = {
                    'index': None,
                    'time': None,
                    'text_lines': []
                }
                stage = 0
            else:
                # 대사 줄
                current_block['text_lines'].append(stripped)

    # 파일 끝까지 읽었는데 마지막 블록이 채워져 있으면 추가
    if current_block['index'] or current_block['time'] or current_block['text_lines']:
        blocks.append(current_block)

    logging.info(f"Parsed {len(blocks)} blocks from the SRT file.")
    return blocks


"""
하나의 블록에 대해,
- [참석자 ...] 제거 후,
- 블록 내 모든 대사를 합쳐서(deepl에) 한 번 번역하고,
- 다시 줄 단위로 쪼개며 [참석자 ...]도 재삽입.
"""
def translate_block_text(blocks, config: TranslationConfig):
    """
    SRT 블록 리스트를 한 번에 번역하는 함수.
    각 블록의 텍스트를 리스트로 만들어 translate_list_deepl로 번역한 뒤 결과를 반영.
    """
    # 1) 모든 블록에서 번역할 텍스트를 수집
    text_list = []
    bracket_map_list = []

    for block in blocks:
        cleaned_lines = []
        bracket_map = []

        for line in block['text_lines']:
            line_no_bracket, found_brackets = remove_bracketed_participants(line)
            cleaned_lines.append(line_no_bracket)
            bracket_map.append(found_brackets)

        # 블록 텍스트를 합쳐 번역 요청 리스트에 추가
        text_list.append("\n".join(cleaned_lines))
        bracket_map_list.append(bracket_map)

    # 2) DeepL API로 한 번에 번역 요청
    translated_text_blocks = translate_list_deepl(text_list, config)

    # 3) 번역 결과를 블록에 다시 반영
    for block, translated_text_block, bracket_map in zip(blocks, translated_text_blocks, bracket_map_list):
        translated_lines = translated_text_block.splitlines()
        final_lines = []

        # 원본 줄 수와 번역 결과 줄 수를 맞춤
        if len(translated_lines) < len(bracket_map):
            translated_lines += [""] * (len(bracket_map) - len(translated_lines))
        elif len(translated_lines) > len(bracket_map):
            translated_lines = translated_lines[:len(bracket_map)]

        # [참석자 ...]을 번역 결과에 재삽입
        for i, t_line in enumerate(translated_lines):
            if bracket_map[i]:
                bracket_text = " ".join(bracket_map[i])
                new_line = f"{bracket_text} {t_line}"
            else:
                new_line = t_line
            final_lines.append(new_line)

        block['text_lines'] = final_lines
        logging.debug(f"Translated block {block['index']} with {len(block['text_lines'])} lines.")

    return blocks


"""
"HH:MM:SS,mmm" 형태의 문자열을 파싱하여
shift_seconds (초)를 더한 뒤 동일 포맷으로 반환
"""
def shift_timestamp(timestamp: str, shift_seconds: int) -> str:
    # "00:00:00,000" -> hours=00, minutes=00, seconds_milli=00,000
    hours, minutes, seconds_milli = timestamp.split(':')
    seconds, milliseconds = seconds_milli.split(',')

    total_seconds = int(hours) * 3600 + int(minutes) * 60 + int(seconds)
    total_milliseconds = total_seconds * 1000 + int(milliseconds)

    new_total_milliseconds = total_milliseconds + shift_seconds * 1000

    if new_total_milliseconds < 0:
        new_total_milliseconds = 0

    new_hours = new_total_milliseconds // 3600000
    remainder = new_total_milliseconds % 3600000
    new_minutes = remainder // 60000
    remainder = remainder % 60000
    new_seconds = remainder // 1000
    new_milliseconds = remainder % 1000

    return f"{new_hours:02d}:{new_minutes:02d}:{new_seconds:02d},{new_milliseconds:03d}"


def shift_time_range(time_line: str, shift_seconds: int) -> str:
    """
    "HH:MM:SS,mmm --> HH:MM:SS,mmm" 형태의 문자열을
    각각 shift_timestamp 함수를 통해 변환
    """
    start_str, end_str = time_line.split('-->')
    start_str = start_str.strip()
    end_str = end_str.strip()

    shifted_start = shift_timestamp(start_str, shift_seconds)
    shifted_end = shift_timestamp(end_str, shift_seconds)

    return f"{shifted_start} --> {shifted_end}"


"""
translate_block_text로 업데이트된 blocks를
다시 SRT 포맷(문자열 리스트)으로 만들어 반환.
"""
def rebuild_srt_content(blocks, shift_seconds):
    output_lines = []
    for b in blocks:
        if b['index'] and b['time']:
            output_lines.append(b['index'] + "\n")  # 인덱스

            shifted_time_line = shift_time_range(b['time'], shift_seconds)

            output_lines.append(shifted_time_line + "\n")  # 타임라인
            for line in b['text_lines']:
                output_lines.append(line + "\n")
            output_lines.append("\n")  # 블록 구분용 빈 줄

    logging.info(f"Rebuilt SRT content with {len(blocks)} blocks.")
    return output_lines


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Translate SRT file using DeepL API')
    parser.add_argument('--input_file', required=True, help='Input SRT file path')
    parser.add_argument('--output_file', required=True, help='Output SRT file path')
    parser.add_argument('--source_lang', default='EN', help='Source language (default: EN)')
    parser.add_argument('--target_lang', default='KO', help='Target language (default: KO)')
    parser.add_argument('--auth_key', default=DEEPL_AUTH_KEY, help='DeepL API authentication key')
    parser.add_argument('--time_shift', type=int, default=0, help='Shift subtitle timing by N seconds (default: 0)')

    args = parser.parse_args()

    input_file_path = args.input_file
    output_file_path = args.output_file
    source_lang = args.source_lang
    target_lang = args.target_lang
    auth_key = args.auth_key
    time_shift = args.time_shift

    input_file_path = "test.srt"
    output_file_path = "test_translated.srt"
    source_lang = 'EN'

    config = TranslationConfig(input_file_path, output_file_path, source_lang, target_lang, auth_key)

    logging.info(f"Starting translation of {input_file_path} from {source_lang} to {target_lang}...")

    start_time = time.perf_counter()

    try:
        with open(input_file_path, 'r', encoding='utf-8') as f:
            srt_lines = f.readlines()

        blocks = parse_srt_blocks(srt_lines)

        translate_block_text(blocks, config)

        translated_srt_lines = rebuild_srt_content(blocks, time_shift)

        with open(output_file_path, 'w', encoding='utf-8') as f:
            f.writelines(translated_srt_lines)

        end_time = time.perf_counter()
        elapsed_time = end_time - start_time
        logging.info(f"Translation complete. Output saved to: {output_file_path}")
        logging.info(f"Time taken: {elapsed_time:.2f} seconds")
    except Exception as e:
        logging.error(f"An error occurred: {e}", exc_info=True)
