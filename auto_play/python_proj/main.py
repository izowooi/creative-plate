import subprocess
import time
import os
from PIL import ImageChops, ImageStat, Image
import pyautogui


# 번들 아이디로 앱 실행
def launch_app_by_bundle_id(bundle_id):
    try:
        subprocess.run(["open", "-b", bundle_id], check=True)
        print(f"앱 실행: {bundle_id}")
    except subprocess.CalledProcessError as e:
        print(f"앱 실행 실패: {e}")


# 번들 아이디로 실행 중인 앱 종료
def terminate_app_by_bundle_id(bundle_id):
    try:
        subprocess.run(["osascript", "-e", f'tell application id "{bundle_id}" to quit'], check=True)
        print(f"앱 종료: {bundle_id}")
    except subprocess.CalledProcessError as e:
        print(f"앱 종료 실패: {e}")


def images_are_similar(img1, img2, threshold) -> bool:
    diff = ImageChops.difference(img1, img2)
    stat = ImageStat.Stat(diff)
    diff_score = sum(stat.mean)
    print(f"이미지 유사도: {diff_score}")
    return diff_score < threshold

target_size=(640, 640)

# 스크린샷 촬영 함수
def take_screenshots_during_execution(output_folder, duration=10, interval=0.5, diff_score_threshold=5):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    previous_screenshot = None
    start_time = time.time()

    while time.time() - start_time < duration:
        # 스크린샷 촬영
        screenshot_origin = pyautogui.screenshot()
        # YOLO에 맞춰 리사이즈
        screenshot = screenshot_origin.resize(target_size, Image.NEAREST)

        # 중복 여부 확인
        # if previous_screenshot:
        #     diff = ImageChops.difference(screenshot, previous_screenshot)
        #     if not diff.getbbox():  # 차이가 없으면 저장하지 않음
        #         print("변화 없음. 스크린샷 저장하지 않음.")
        #         time.sleep(interval)
        #         continue
        # 중복 여부 확인
        if previous_screenshot and images_are_similar(screenshot, previous_screenshot, diff_score_threshold):
            print("변화 없음. 스크린샷 저장하지 않음.")
        else:
            # 스크린샷 저장
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            screenshot_path = os.path.join(output_folder, f"screenshot_{timestamp}.png")
            screenshot.save(screenshot_path)
            #print(f"스크린샷 저장: {screenshot_path}")

            # 현재 스크린샷을 이전 스크린샷으로 저장
            previous_screenshot = screenshot

        # 대기
        time.sleep(interval)


if __name__ == "__main__":
    recording_duration_sec = 30
    recording_interval_sec = 0.5
    launch_time_sec = 5

    bundle_id = "com.haoplay.game.ios.exilium"

    output_folder = "./screenshots"

    launch_app_by_bundle_id(bundle_id)

    time.sleep(launch_time_sec)

    take_screenshots_during_execution(output_folder, duration=recording_duration_sec, interval=recording_interval_sec)

    # 앱 종료
    terminate_app_by_bundle_id(bundle_id)