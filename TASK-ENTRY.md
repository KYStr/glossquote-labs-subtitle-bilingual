# B20-50-M1 — 雙語字幕合併

2026-10-23（Asia/Taipei）。只完成 M1 本地候選；不開 server、browser、chat 或子代理，不出版或部署。要求的對話設定為 gpt-6.1-sol/max；backend 未獨立驗證。

已讀本工具 14 份文件、根 AGENTS/SECURITY-BASELINE/PRODUCT-THESIS，以及完整共同設計契約（本工具 DESIGN-SYSTEM 與共同檔 SHA-256 相同）。原規格保持不變。

完成標準：實際雙語操作頁、完整確認/取消/residual graph 流程、真實 SRT writer，Node24 離線合成資料 tests/check/build 通過；瀏覽器能力明列 NOT_RUN_USER_FOCUS_INCIDENT。M2/M3 由主代理另行放行。

介面模式 Product App。外語學習者/字幕校對者在桌面或手機合併既有 SRT；核心物件是配對字幕及結果。固定顯示雙來源/開始/取消/交換/清除、配對摘要、逐列修正與主時間軸預覽；低頻的逐句排除與解除配對在相鄰列。桌面左修正右預覽，手機依序單欄；不用額外裝飾或外部資產。沿用家庭 tokens、系統字體、44px 控制與清楚文字狀態。

例行決策：parser offset 是原始 UTF-8 byte offset；序號採無前導零的正十進位整數；過多 cues 使用 INVALID_SRT。人工決策在 worker 內保留核心 context，不依靠 UI clone 推算。明確排除以獨立確認操作執行，釋出原配對另一端並重算，提供還原。

桌面：來源/動作 → 摘要 → [逐列配對 1fr | 輸出預覽 1fr] → 下載。
手機：來源 → 動作 → 摘要 → 逐列配對 → 預覽 → 下載。

驗證記錄與固定來源清單見 evidence/m1/ 與 HANDOFF.md。

M1 最終驗證：Node v24.14.0，`node --test` exit 0（81/81）、check exit 0（16 files/2 pages/11 JS）、build exit 0（16 files/80,553 bytes）。真實 Node worker thread/transfer 與獨立 SRT bytes oracle 通過；不代表 browser PASS。取消/過期訊息/URL cleanup 與 AC28–32 有獨立手寫預期。全 Environment Snapshots 前後相同。

歷史缺失已保留：test-01 的兩個測試 fixture/expectation 錯誤、環境 wrapper 的 null LASTEXITCODE 誤判；修正後驗證通過，未發生環境 drift。沒有服務、server、browser、子代理或背景 process 遺留；只啟動任務擁有的 Node test worker，測試內已 terminate。

實際改動只在 package/.gitignore/public/scripts/test/HANDOFF/TASK-ENTRY/evidence/m1 與生成 dist。原始規格唯讀；本工具尚未追蹤，無 tracked diff/commit；沒有 GitHub/部署/首頁變動。停在 M1，本輪不開後續 milestone，也不輪詢等待。

## B20-RP-50 / M1B（2026-10-23）

主代理已明確派送離線發布準備，取代前輪「停在 M1」的進度限制；這不是 M2 發布放行。已完整讀 `.runs/batch20-release-prep-2026-10-23/TASK.md` 的 10 項契約，沿用原產品與安全/設計內容。requested gpt-6.1-sol/max，backend 未獨立確認；沒有切換模型、再委派或開新 chat。

只改 package.json、scripts/**、test/**、本 TASK-ENTRY/HANDOFF，新增 M1B-RELEASE.md、evidence/m1b 與 release-artifacts。public/dist/舊 evidence/原規格/兄弟工具不寫入。兩個既有測試只將產物/臨時 copy 目錄改為 m1b，以免完整 npm test 覆寫歷史 M1。

完成標準：固定 origin `https://bilingual-subs.glossquote.com` 的獨立產物、head-only 雙語 SEO、robots/sitemap/完整安全 headers、閉合 allowlist/確定重建/來源與產物防竄改；完整 npm test/check/build:release/check:release 真實收據與環境前後相同；browser 仍 NOT_RUN_USER_FOCUS_INCIDENT。不做 GitHub/部署/首頁，也不啟動 serve。

初始 baseline 86 檔，其中 public/dist/舊 M1 evidence 55 檔另行逐 byte/SHA 保護。M1B 來源/產物與實際差異由 scripts/record-m1b.mjs 在收尾時產生；不執行會重寫 evidence/m1 的舊 scripts/freeze.mjs。31 項針對性發布測試已通過，最終完整命令以 evidence/m1b/commands-final.json 為準。

M1B 最終命令（一次完整 suite）：npm test exit 0，112 tests/112 pass/0 fail/0 skipped；npm run check、build:release、check:release 均 exit 0。site 17 檔/81,590 bytes，manifest SHA-256 `7c0572463e122fe437d97d5f1d47381bbc53f4a30e1006f11fe0d8195c2ffc00`。全部 Environment Snapshots 前後相等。原預覽 build 命令未重跑；既有 build 函式只由原工具鏈測試作用於 m1b 的合成 copy，不寫真 dist。

本輪沒有未解的實作阻擋或必須由主代理選擇的產品分歧。仍需主代理回收獨立驗證、補真實瀏覽器 gates 並另行決定 M2；停在 M1B，不公開、不部署、不輪詢或另開對話。

## B20-50-M2A（2026-10-27）

root 已有真 browser r1：32 PASS/6 NOT_RUN/0 FAIL，prohibited 空、parent cleanup PASS；本輪僅本地發布準備，不 rerun browser，也不是 M2B 放行。六個 NOT_RUN 的既有範圍不變。已讀根/工具 AGENTS、規格/HANDOFF，沿用原對話 Sol/max 要求，backend 未自證；無再委派。

初始 baseline 共 140 檔。舊 release-artifacts 18 檔完整保存於 evidence/m2a/before/release-artifacts 並核 SHA；兩語頁沒有未發布標語，不修改 release transformation 的輸出。public/dist/runtime、舊 evidence、M1B 文件及所有既有包不改。

新增固定 wrangler.jsonc，僅此工具 custom domain、assets-only，日期2026-10-24，開發/preview/metrics/observability/logs/invocation logs/traces 全 false，HTML/fallback none，build 使用既有 build:release。release/check 嚴拒設定漂移、analytics 和候選未發布文案；runtime 及頁面 bytes 不變。

41 個新增發布測試與舊31項合計72/72通過。最終完整 suite/check/build:release/check:release 由 scripts/validate-m2a.mjs 保存新收據；測試合成檔與暫存全導向 m2a。完成後 scripts/record-m2a.mjs 會核對 protected baseline/舊release backup，產生 source-set、artifact-set、config 與 manifest hashes。沒有執行舊 freeze/record/validate-m1b，避免寫歷史證據。

本輪採 workers-best-practices 作設定核對；使用者的固定日期與關閉 telemetry 明確優先於技能建議。只讀官方配置文件，未使用 Wrangler CLI、服務、憑證或 Cloudflare API。停在 M2A，待 root 審查後另行放行 M2B。

root 追加 M2A 入口規則：維持 html_handling:none，release 新增三行固定 _redirects（/、/en、/en/ 到 matching index.html，301，真 LF），manifest 必須覆蓋。上一段「輸出不變」指追加前設定階段；最終只改 manifest 並加 _redirects，其餘原17個site檔仍逐byte不變，舊18檔備份保留。

追加前完整153/153及check/buildrelease/checkrelease已通過且證據保留 evidence/m2a/ 根層。含轉址的最終檢查改寫新的 evidence/m2a/final，不覆蓋先前收據。受控升級只限已知 7c057… 舊 manifest 與完整同版 backup 全驗證成功；改過的產物或 backup、缺少backup皆拒絕。未重跑已通過的瀏覽器案例，50站真實入口301尚待 root M2B/部署時驗證。

M2A 最終：release 81/81、完整 npm test 162/162，check/build:release/check:release 全 exit0。實際 migrated=true；18個site檔81,655 bytes，新增_redirects65 bytes；新manifest9e3564dd4acbe8f89ed8f579a8964d8a7d15c84983c6145a86c964a7e116cbce。原17個site檔及CSP不變、舊18檔backup完整；全階段Environment Snapshots相等。資料只交root，無M2B/push/deploy/新ZIP。
