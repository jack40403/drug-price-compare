import subprocess
import os
import sys

def launch_app(mode):
    print("="*40)
    print(f"  正在啟動：藥品比價小精靈 - {mode.upper()} 模式")
    print("="*40)
    
    # Set environment variable for the app mode
    env = os.environ.copy()
    env["APP_MODE"] = mode
    
    try:
        # Run npm run dev
        subprocess.run(["npm.cmd", "run", "dev"], shell=True, env=env)
    except Exception as e:
        print(f"啟動失敗: {e}")
        input("按任意鍵結束...")

if __name__ == "__main__":
    print("藥品比價小精靈 - Python 專業啟動器")
    print("1. Chrome 互動模式 (可見瀏覽器)")
    print("2. Python 自動模式 (隱藏瀏覽器)")
    
    choice = input("\n請輸入 1 或 2 (預設 1): ").strip()
    
    if choice == "2":
        launch_app("python")
    else:
        launch_app("chrome")
