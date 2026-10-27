# 雙語字幕合併 原功能對話契約
只修改 TASKS 所允許的本工具檔案；M1 允許 package.json、.gitignore、public/**、scripts/**、test/**、dist/**、HANDOFF.md、TASK-ENTRY.md。不可改六份規格、AGENTS、docs 契約、兄弟工具、共享首頁/看板、既有驗收包。任務 evidence 寫本工具 evidence/m1/** 或主代理指定唯一目錄。不要再委派或另開 chat。
原功能對話 requested gpt-6.1-sol/max；不以自述證明實際 backend。主代理負責架構、驗收及 hosting；你負責實作、原對話修正、獲 M2 放行後獨立公開 GitHub。一次一個 milestone。結束用 final 回報修改檔案、diff、實際命令/exit、未驗項及風險；不要只給計畫。
不得 CUA、hidden/IAB、互動本機 browser/native automation、視窗/焦點/鍵盤/IME/clipboard/原生 dialogs 或 screenshots；不可用使用者桌面試驗隔離。僅背景檔案/CLI/loopback HTTP 允許。必要 UI 標 NOT_RUN_USER_FOCUS_INCIDENT，主代理另以審核隔離機制處理；Node/離線 DOM 不能冒充真 browser。保留現有分頁及程序。
Node24 ESM builtins，零外部 runtime/dev 依賴，不 npm install。離線假資料測試。使用者資料僅記憶體，無帳號/storage/telemetry/遠端資源/使用者內容 URL/console；不讀其他帳戶檔案、憑證、browser profiles、token environment 或 credential store。Cloudflare 特例僅給主代理，不可使用。
持久 User/Machine 環境、PATH、TEMP/TMP、registry/services/pagefile/BCD 禁止修改。禁止 setx、持久 SetEnvironmentVariable、把 cache/temp/workspace 加 PATH。長測試前後用現有 check-persistent-environment.ps1 比對 HKCU/HKLM PATH hash/type/length/ephemeral entries 和全 Environment fingerprint；未知 drift 停止，不猜還原。工具用完整路徑或 process-local env。不得為建置安裝/配置服務。
Git 不得 global/system config 寫入或 gh auth setup-git/login/refresh，不得登入擴權、讀/印憑證、force/reset/clean；M2 使用審核 copy 和 per-command git -c，Git guard 前後相同。缺權限停止。只限 KYStr/glossquote-labs-subtitle-bilingual；未獲 M2 放行不推送，不部署，不付費，不動 040141.xyz/GlossGate。見 docs/GIT-PUBLICATION-SAFETY.md。
dev 僅 127.0.0.1:4230，port 衝突回報不殺程序；只停止本任務已識別自建可拋棄測試程序。規格衝突、必要新增依賴/權限、未知環境 drift、共享路徑衝突、相同問題兩輪無新進展時停止回報。
交固定候選 sources/hash 與證據，主代理製作單一整合 ZIP；不要另建多個使用者交付包。
