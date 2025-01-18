import subprocess
import time

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

if __name__ == "__main__":
    # 소녀전선2 번들 아이디
    bundle_id = "com.haoplay.game.ios.exilium"

    # 앱 실행
    launch_app_by_bundle_id(bundle_id)

    # 10초 대기 후 앱 종료
    time.sleep(10)
    terminate_app_by_bundle_id(bundle_id)