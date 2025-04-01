
# ComfyUI 설치
git clone https://github.com/comfyanonymous/ComfyUI.git
/opt/homebrew/opt/python@3.11/Frameworks/Python.framework/Versions/3.11/bin/python3.11 -m venv venv
source venv/bin/activate
pip3 install --upgrade pip
pip3 install --pre torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/nightly/cpu
python3 ./verify_torch.py
'''
import torch
if torch.backends.mps.is_available():
    mps_device = torch.device("mps")
    x = torch.ones(1, device=mps_device)
    print (x)
else:
    print ("MPS device not found.")
'''
pip install -r requirements.txt


## 커스텀 노드 매니저 설치
cd custom_nodes/
git clone https://github.com/ltdrdata/ComfyUI-Manager.git


## 커스텀 노드
ComfyUI-WD14-Tagger : 이미지에서 태그 생성
ComfyUI-Custom-Scripts : string 조합
ComfyUI impact pack : 이미지 리사이즈


# ComfyUI 실행 및 종료
source venv/bin/activate
python3 main.py --listen 0.0.0.0
deactivate


