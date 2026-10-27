# 實作任務：雙語字幕合併

僅供 M1 candidate；每個任務在本資料夾允許的實作路徑內完成。Node.js 24 ESM、內建模組與瀏覽器原生 API；不 npm install、不新增 runtime dependency、不連網、不開 browser、不部署。M2 公開 GitHub 與 deploy 需主代理另行安排。

## T00 — Scaffold

- 建立 package.json scripts: dev、test、check、build；不定義 dependencies。
- 建立 docs 已列出的 public、scripts、test、dist 結構及 .gitignore。
- server 使用 Node built-in http，只綁 127.0.0.1:4230，只供本機 public 靜態檔；本任務不啟動 server。build 複製 public 到 dist 並確認 noindex。
- 建立繁中 /index.html 與英文 /en/index.html 兩份獨立頁，普通 anchor 切換，連結旁有未匯出資料遺失提醒；不得補跨頁狀態保存。
- 完成 node scripts/check.mjs 的離線靜態結構檢查。

## T10 — Parser 與精確 matching core

- 按 TECHNICAL.md 實作 UTF-8 SRT strict parser、timestamp 毫秒轉換與序列化。
- 實作 half-open interval intersection/union、BigInt 精確 ratio comparison、候選與互為唯一最佳分類。
- 僅保留至多 50,000 eligible edges；第 50,001 條即整批 CANDIDATE_LIMIT、停止建構、零 partial result，pair scan 每 1,024 次檢查取消。
- 保留人工歧義候選的排序穩定性；禁止浮點 tie 判斷。
- 寫 parser、IoU、matching、serialization 合成資料測試，涵蓋 ACCEPTANCE.md 1–18、28，含不同IoU競爭、equal-best collision 與 50k/50,001 edge 界線。

## T20 — Job 與取消

- 建 merge worker 的 jobId/epoch 狀態、進度、cancel、stale message 過濾與來源變更清理。
- 合併時維持來源 cue index，Result 明列 automatic/manual matches、帶 reasons 的 ambiguous edges、current residual no-edge unmatched 與 kept-separate；review 時不產生 SRT。每次決策只在排除 fixed manual pairs/kept-separate cues 的 full residual graph 重算；取代 automatic pair 需確認、釋出對端重新參與分類；低於門檻的 manual override 需顯示精確 IoU 二次確認。
- 寫 worker-state 測試覆蓋取消、延遲事件、重跑、review gate、keep-separate standalone 保留、automatic pair replacement、manual override 確認/取消、取消確認零狀態變更、released cue 重返圖內、fixed decisions 不被重算覆蓋與 no auto-expiry；涵蓋 ACCEPTANCE.md 19–27、29–32。

## T30 — 可操作雙語 UI

- 提供雙檔選擇、檔案大小／解析狀態、明確開始、取消、清除、配對摘要、歧義及未配對逐列人工選擇；取代自動配對或低於 IoU 門檻時顯示精確確認內容，Cancel 不改 Result。
- 依既定主時間軸輸出預覽；排除任一句都需逐句選擇並確認；低門檻人工配對要再次確認。
- 下載 SRT 前顯示輸出 cue 數與排除數；keep-separate cue 以獨立字幕列輸出，來源改動使結果清除，沒有逾時清除。
- 使用 textContent、安全的 DOM API、關聯 label/error、鍵盤可用、320px 單欄與桌面雙區；不將字幕字串當 HTML。
- 確認中英文兩頁提供對等操作與精確 FAQ、title、description、H1、noindex。

## T40 — Wrap-up 與 M1 驗證

- 按 ACCEPTANCE.md 對最終內容執行 node --version、node --test、node scripts/check.mjs、node scripts/build.mjs，記錄真實輸出與退出碼。
- 修復範圍內問題後重跑受影響的命令；確認 dist 只含靜態檔，git diff 只限允許路徑，source tree 沒有 npm lockfile、credential、使用者資料或 build cache。
- 將真實瀏覽器互動狀態記為 NOT_RUN_USER_FOCUS_INCIDENT；不要開 browser 或宣稱瀏覽器驗收完成。
- 更新 HANDOFF 與 TASK-ENTRY/evidence/m1 由主代理管理；spec 六份不得改寫。
- 停在 M1 candidate。不得建立公開 GitHub repository、push、設定 hosting 或部署；等待主代理後續 milestone 授權與 review。
