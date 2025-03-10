# qr_generator.py 예시
import qrcode
import qrcode.constants
from PIL import Image
import uuid

def generate_qr_code(
    data: str,
    version=None,
    error_correction=qrcode.constants.ERROR_CORRECT_M,
    box_size=10,
    border=4
):
    if not data:
        return None, None

    qr = qrcode.QRCode(
        version=version,
        error_correction=error_correction,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)

    # ★ 변경 부분: 일반적인 PIL.Image 객체로 변환
    qr_image = qr.make_image(fill_color="black", back_color="white")
    # convert("RGB") 또는 get_image() 중 하나 사용
    if hasattr(qr_image, "convert"):
        # convert("RGB")로 PIL.Image.Image 객체로 변경
        pil_image = qr_image.convert("RGB")
    else:
        # 혹은 get_image() 메서드 사용 (qrcode.image.pil.PilImage가 제공)
        pil_image = qr_image.get_image().convert("RGB")

    # 임시 파일에 저장
    temp_filename = f"qr_{uuid.uuid4().hex}.png"
    pil_image.save(temp_filename)

    return pil_image, temp_filename