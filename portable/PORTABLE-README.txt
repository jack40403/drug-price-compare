藥品比價小精靈 Portable
========================

啟動：雙擊 start.bat
驗證：雙擊 verify.bat

整個資料夾可以複製到隨身硬碟，不需要安裝 Node.js、Python、Java或資料庫。
請勿只複製 EXE；App、Data 與啟動腳本必須一起保留。

Data\config  儲存程式設定與登入資訊
Data\logs    儲存執行日誌
Data\nhi_index.json（產生後）儲存更新過的健保索引

portable-manifest.json 是完整檔案、大小與 SHA-256 清單。
verify.bat 會逐一驗證全部封裝檔案，可能需要數分鐘。

連接埠 3010 僅供選用的瀏覽器/手機 HTTP bridge 使用。若被占用，桌面版仍可正常使用。

注意：登入密碼使用 Windows DPAPI 加密。換到不同 Windows 帳號或電腦時，
可能需要在設定頁重新輸入一次密碼；這是為了避免隨身碟遺失後密碼可被直接讀取。
