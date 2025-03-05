# tesseract_test.py
import os
import pytesseract
from PIL import Image

# (선택) TESSDATA_PREFIX 환경변수를 파이썬 코드에서 강제로 지정하고 싶다면:
# os.environ["TESSDATA_PREFIX"] = "/opt/homebrew/share/tessdata"

def main():
    try:
        image = Image.open("test.png")  # 현재 경로의 test.png
        text = pytesseract.image_to_string(image, lang="jpn")
        print("=== 추출된 텍스트 ===")
        print(text)
    except Exception as e:
        print("OCR 처리 중 오류가 발생했습니다:", e)

if __name__ == "__main__":
    main()