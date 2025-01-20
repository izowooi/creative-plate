import argparse
import os
import re
import requests
from dotenv import load_dotenv
load_dotenv(verbose=True)

DEEPL_AUTH_KEY = os.getenv('DEEPL_AUTH_KEY')
input_file_path = "960_audio.srt"
output_file_path = "960_audio_translated.srt"


def translate_request_deepl(text: str, source_lang: str = 'EN', target_lang: str = 'KO' ) -> str:
    #return text  # 테스트용: 번역 API 호출을 건너뛰고 원문 그대로 반환
    url_for_deepl = 'https://api-free.deepl.com/v2/translate'
    params = {
        'auth_key': DEEPL_AUTH_KEY,
        'text': text,
        'source_lang': source_lang,
        'target_lang': target_lang
    }
    result = requests.post(url_for_deepl, data=params, verify=True)
    # DeepL 응답에서 번역 결과 부분만 추출
    return result.json()['translations'][0]["text"]


def remove_bracketed_participants(line: str):
    pattern = r'(\[참석자\s*\d+\])'
    found = re.findall(pattern, line)  # 예: ["[참석자 2]"]
    line_cleaned = re.sub(pattern, '', line)  # 대사에서 제거
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

    return blocks


"""
하나의 블록에 대해,
- [참석자 ...] 제거 후,
- 블록 내 모든 대사를 합쳐서(deepl에) 한 번 번역하고,
- 다시 줄 단위로 쪼개며 [참석자 ...]도 재삽입.
"""
def translate_block_text(block):
    cleaned_lines = []
    bracket_map = []

    for line in block['text_lines']:
        line_no_bracket, found_brackets = remove_bracketed_participants(line)
        cleaned_lines.append(line_no_bracket)
        bracket_map.append(found_brackets)

    original_text_block = "\n".join(cleaned_lines)

    if original_text_block.strip():
        translated_text_block = translate_request_deepl(original_text_block)
    else:
        translated_text_block = ""

    translated_lines = translated_text_block.splitlines()

    if len(translated_lines) < len(cleaned_lines):
        translated_lines += [""] * (len(cleaned_lines) - len(translated_lines))
    elif len(translated_lines) > len(cleaned_lines):
        translated_lines = translated_lines[:len(cleaned_lines)]

    final_lines = []
    for i, t_line in enumerate(translated_lines):
        if bracket_map[i]:
            bracket_text = " ".join(bracket_map[i])
            new_line = bracket_text + " " + t_line
        else:
            new_line = t_line
        final_lines.append(new_line)

    block['text_lines'] = final_lines
    return block


"""
translate_block_text로 업데이트된 blocks를
다시 SRT 포맷(문자열 리스트)으로 만들어 반환.
"""
def rebuild_srt_content(blocks):
    output_lines = []
    for b in blocks:
        if b['index'] and b['time']:
            output_lines.append(b['index'] + "\n")  # 인덱스
            output_lines.append(b['time'] + "\n")  # 타임라인
            for line in b['text_lines']:
                output_lines.append(line + "\n")
            output_lines.append("\n")  # 블록 구분용 빈 줄
    return output_lines


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Translate SRT file using DeepL API')
    parser.add_argument('--input_file', required=True, help='Input SRT file path')
    parser.add_argument('--output_file', required=True, help='Output SRT file path')
    parser.add_argument('--source_lang', default='EN', help='Source language (default: EN)')
    parser.add_argument('--target_lang', default='KO', help='Target language (default: KO)')
    parser.add_argument('--auth_key', default=DEEPL_AUTH_KEY, help='DeepL API authentication key')

    args = parser.parse_args()

    input_file_path = args.input_file
    output_file_path = args.output_file
    source_lang = args.source_lang
    target_lang = args.target_lang
    auth_key = args.auth_key
    print(f"Translating {input_file_path} from {source_lang} to {target_lang}...")
    print(f"Output will be saved to {output_file_path}")

    with open(input_file_path, 'r', encoding='utf-8') as f:
        srt_lines = f.readlines()

    blocks = parse_srt_blocks(srt_lines)

    for b in blocks:
        translate_block_text(b)

    translated_srt_lines = rebuild_srt_content(blocks)

    with open(output_file_path, 'w', encoding='utf-8') as f:
        f.writelines(translated_srt_lines)

    print("Translation complete. Output saved to:", output_file_path)
