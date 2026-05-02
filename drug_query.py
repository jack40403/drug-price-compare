#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
藥品比價查詢腳本
============================================================
用法:
  python drug_query.py              <- 排程模式，讀 drug_list.txt
  python drug_query.py 舒脈康       <- 手動模式，查指定藥品
  python drug_query.py 舒脈康 脈優  <- 手動模式，一次查多個
============================================================
"""

import sys
import os
import time
import json
import subprocess
import urllib.request
import urllib.error
from datetime import datetime

# ===== 設定區 =====
TELEGRAM_BOT_TOKEN = "8784135205:AAH0c402I2FyCrP3Qdff4er-7dyh981CpHw"
TELEGRAM_CHAT_ID   = "5804441069"
API_URL            = "http://127.0.0.1:3010/api/invoke"
BAT_FILE           = r"C:\drug-price-compare\open_in_chrome_browser.bat"
DRUG_LIST_FILE     = r"C:\drug-price-compare\drug_list.txt"

ALL_PLATFORMS = [
    "binli", "chahwa", "jhaohong", "yeschain",
    "yusheng", "coda", "mdt", "yc", "taichung"
]

PLATFORM_NAMES = {
    "binli":     "彬利",
    "chahwa":    "嘉鏵",
    "jhaohong":  "兆宇",
    "yeschain":  "耀聖",
    "yusheng":   "裕生",
    "coda":      "可達",
    "mdt":       "MDT",
    "yc":        "YC",
    "taichung":  "台中",
}
# ==================


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")


# ── 伺服器管理 ──────────────────────────────────────────

def is_server_running():
    try:
        urllib.request.urlopen("http://127.0.0.1:3010", timeout=3)
        return True
    except Exception:
        return False


def start_server():
    if is_server_running():
        log("伺服器已在運行中")
        return True

    log("啟動後端伺服器 (open_in_chrome_browser.bat)...")
    subprocess.Popen(
        BAT_FILE,
        shell=True,
        creationflags=subprocess.CREATE_NEW_CONSOLE
    )

    log("等待伺服器啟動（最多 60 秒）...")
    for i in range(20):
        time.sleep(3)
        if is_server_running():
            log(f"伺服器已就緒（{(i+1)*3} 秒）")
            return True
        log(f"  等待中... {(i+1)*3}s")

    log("❌ 伺服器啟動逾時")
    return False


# ── API 搜尋 ────────────────────────────────────────────

def search_drug(drug_name):
    payload = json.dumps({
        "channel": "perform-search",
        "args": [{"searchTerm": drug_name, "platforms": ALL_PLATFORMS}]
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ── 格式化結果 ───────────────────────────────────────────

def format_results(drug_name, results):
    now = datetime.now().strftime("%m/%d %H:%M")

    if not results:
        return (
            f"❌ *{drug_name}* 比價結果\n"
            f"各平台均無資料（可能尚未登入或無此藥品）\n"
            f"_{now}_"
        )

    # 依平台分組
    by_platform = {}
    for r in results:
        p = r.get("platform", "unknown")
        by_platform.setdefault(p, []).append(r)

    lines = [f"💊 *{drug_name}* 比價結果", f"_{now}_", ""]

    for platform, items in by_platform.items():
        pname = PLATFORM_NAMES.get(platform, platform)
        lines.append(f"🏪 *{pname}*")

        for item in items:
            name      = item.get("name", "")
            spec      = item.get("spec", "")
            price     = item.get("price", 0)
            unit      = item.get("unit", "")
            stock     = str(item.get("stock", ""))
            cheapest  = item.get("isCheapest", False)

            # 價格
            if price > 0:
                price_str = f"${price}" + (f"/{unit}" if unit else "")
            else:
                price_str = "洽詢"

            # 庫存
            stock_lower = stock.lower()
            if any(k in stock_lower for k in ["缺", "無貨", "out", "sold", "停供"]) or stock in ("0", ""):
                stock_str = "⚠️ 缺貨"
            else:
                stock_str = f"庫存 {stock}"

            badge    = "✅ " if cheapest else "  "
            spec_str = f" {spec}" if spec else ""
            lines.append(f"{badge}{name}{spec_str}")
            lines.append(f"   💰 {price_str}  {stock_str}")

        lines.append("")

    return "\n".join(lines)


# ── Telegram ────────────────────────────────────────────

def send_telegram(text):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = json.dumps({
        "chat_id":    TELEGRAM_CHAT_ID,
        "text":       text,
        "parse_mode": "Markdown"
    }).encode("utf-8")

    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


# ── 藥品清單讀取 ─────────────────────────────────────────

def load_drug_list():
    if not os.path.exists(DRUG_LIST_FILE):
        log(f"找不到 {DRUG_LIST_FILE}")
        return []
    with open(DRUG_LIST_FILE, "r", encoding="utf-8") as f:
        drugs = [
            line.strip()
            for line in f
            if line.strip() and not line.startswith("#")
        ]
    return drugs


# ── 主流程 ───────────────────────────────────────────────

def main():
    if len(sys.argv) > 1:
        drug_names = sys.argv[1:]
        mode = "手動"
    else:
        drug_names = load_drug_list()
        mode = "排程"

    log(f"模式：{mode}  藥品：{drug_names}")

    if not drug_names:
        log("沒有要查詢的藥品，結束")
        send_telegram("⚠️ 藥品比價：drug_list.txt 是空的，請加入要查詢的藥品")
        return

    if not start_server():
        send_telegram("❌ 藥品比價服務無法啟動，請手動確認後端是否正常")
        return

    # 額外緩衝，確保 Playwright / 各 connector 初始化完成
    log("等待 5 秒讓系統穩定...")
    time.sleep(5)

    for drug in drug_names:
        log(f"搜尋中：{drug}")
        try:
            results = search_drug(drug)
            log(f"  取得 {len(results)} 筆結果")
            msg = format_results(drug, results)
            send_telegram(msg)
            log(f"  ✅ Telegram 已傳送")
        except urllib.error.URLError as e:
            err_msg = f"❌ 查詢「{drug}」失敗（網路/API 錯誤）：{e.reason}"
            log(err_msg)
            send_telegram(err_msg)
        except Exception as e:
            err_msg = f"❌ 查詢「{drug}」時發生錯誤：{str(e)}"
            log(err_msg)
            send_telegram(err_msg)

    log("全部完成")


if __name__ == "__main__":
    main()
