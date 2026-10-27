# GitHub 發布與 Git 設定保護

2026-10-13 事件後新增。所有原功能對話、首頁發布與後續新工具均適用。

## 不得執行

- `gh auth setup-git`、`gh auth login`、`gh auth refresh`。
- 任何 `git config --global` / `--system` 寫入，以及直接編輯使用者或系統 Git 設定。
- 讀取、列印或匯出憑證；猜測還原既有 helper；以修改 Windows PATH/Environment 解決發布问题。
- 發布命令啟用 `GIT_TRACE_CURL`、`GIT_CURL_VERBOSE`、`GH_DEBUG=api` 或其他可能記錄認證請求的除錯輸出。發布 child process 不繼承這些除錯開關；只調整該次 process，不修改使用者環境。

這些限制不阻止使用已登入的官方 CLI 進行已授權的公開 repo 建立或推送。認證設定不足時停止回報，不自行重新設定。

## 必要發布步驟

1. 審核獨立 publishing copy、來源清單與固定測試結果。不要從根 repo 推送。
2. 執行 `node tool-projects/scripts/git-settings-guard.mjs capture .runs/<task>/git-settings-before.json`，每次使用新的證據檔。另外保留既有 Windows Environment guard。
3. 建 repo 可用既有 `gh repo create` 授權。推送只能在該 copy 使用每次命令的 `git -c` 設定；必要時以 `-c credential.helper= -c 'credential.https://github.com.helper=!gh auth git-credential'` 呼叫既有官方 CLI 認證，無全域寫入。不要另行執行 helper 以取得 Token，也不要使用 `gh auth token`。使用實際已確認的 gh 可執行路徑，保持 PowerShell 參數為陣列、不要拼接 shell 指令。
4. 用相同證據檔執行 guard `verify`，再驗公開可見性與 remote commit。任何設定漂移、登入/權限問題立即停止，交主代理。
5. 回報 Git 設定 guard、Environment guard、remote commit、visibility 和固定 ZIP。缺任何必要證據不標完整發布通過。

Guard 的範圍是這台機器已知的三個 user/system Git config 檔；它偵測前後變更，不是 OS 層封鎖，也不是憑證檢查。不可宣稱能攔截所有任意工具操作。原對話仍須遵守禁止命令與允許範圍。

## 本次恢复的精確界線

使用者要求撤銷誤執行的 helper 設定。主代理備份現況後，只移除 GitHub/Gist 四個已確認的 gh helper assignment，其他 bytes 保持不變，並驗到兩個主機繼承既有 system Credential Manager。沒有修改前快照，不能聲稱恢復原先可能被覆蓋的自訂值。備份保留於使用者 `.codex/recovery/`，不進 GitHub、不進驗收包；交付只含無憑證的回復紀錄。

