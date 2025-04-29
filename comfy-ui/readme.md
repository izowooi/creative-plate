
# ComfyUI 설치
```bash
git clone https://github.com/comfyanonymous/ComfyUI.git
/opt/homebrew/opt/python@3.11/Frameworks/Python.framework/Versions/3.11/bin/python3.11 -m venv venv
source venv/bin/activate
pip3 install --upgrade pip
pip3 install --pre torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/nightly/cpu
python3 ./verify_torch.py
```

```python
import torch
if torch.backends.mps.is_available():
    mps_device = torch.device("mps")
    x = torch.ones(1, device=mps_device)
    print (x)
else:
    print ("MPS device not found.")
```

```bash
pip install -r requirements.txt
```

## 커스텀 노드 매니저 설치
```bash
cd custom_nodes/
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
```

## 커스텀 노드
- ComfyUI-WD14-Tagger : 이미지에서 태그 생성
- ComfyUI-Custom-Scripts : string 조합
- ComfyUI impact pack : 이미지 리사이즈
- ComfyUI ArtVenture
- ComfyUI_essentials
- Comfyroll Studio
- WAS Node Suite
- comfyui_controlnet_aux
- ComfyUI_UltimateSDUpscale
- ComfyUI-Styles_CSV_Loader
- ComfyUI-Easy-Use
- Searge-LLM for ComfyUI v1.0
- ComfyUI-iTools
- ComfyUI-seamless-tiling
https://github.com/kaibioinfo/ComfyUI_AdvancedRefluxControl

# ComfyUI 실행 및 종료
```bash
source venv/bin/activate
python3 main.py --listen 0.0.0.0
deactivate
```


# 참고 자료
- [Comfyui-wiki](https://comfyui-wiki.com/ko/tutorial)

- [pixaroma](https://www.youtube.com/@pixaroma/videos)

- [openart](https://openart.ai/workflows/academy)

- [조피디 연구소](https://www.youtube.com/playlist?list=PLdWJCXJ7ciCCNbybpTPLq8RdDUSXPjI10)

- [ComfyUI Blog](https://blog.comfy.org/)

## Models
- https://comfyanonymous.github.io/ComfyUI_examples/flux/
- https://huggingface.co/xinsir/controlnet-union-sdxl-1.0

