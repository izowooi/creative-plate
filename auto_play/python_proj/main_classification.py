print('hello world')
import os
import shutil
from sklearn.model_selection import train_test_split

# 원본 데이터 경로와 새 경로 설정
source_dir = "dataset"
train_dir = "dataset/train"
val_dir = "dataset/val"

# 각 폴더를 train/val로 나누기
for class_name in os.listdir(source_dir):
    class_path = os.path.join(source_dir, class_name)
    if not os.path.isdir(class_path):
        continue

    # 이미지 파일 가져오기
    images = [f for f in os.listdir(class_path) if f.endswith(('.jpg', '.png'))]
    train_files, val_files = train_test_split(images, test_size=0.2, random_state=42)

    # Train 폴더 생성 및 파일 복사
    os.makedirs(os.path.join(train_dir, class_name), exist_ok=True)
    for file in train_files:
        shutil.copy(os.path.join(class_path, file), os.path.join(train_dir, class_name, file))

    # Val 폴더 생성 및 파일 복사
    os.makedirs(os.path.join(val_dir, class_name), exist_ok=True)
    for file in val_files:
        shutil.copy(os.path.join(class_path, file), os.path.join(val_dir, class_name, file))

print("데이터 분할 완료!")