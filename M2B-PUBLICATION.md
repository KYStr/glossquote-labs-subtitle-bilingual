# 雙語字幕合併：M2B 公開來源

此獨立 repository 是 B20-50-M2B 審查用來源。主代理已通過 M2A 獨立審查並授權發布至公開的 [KYStr/glossquote-labs-subtitle-bilingual](https://github.com/KYStr/glossquote-labs-subtitle-bilingual)。此步驟不代表網站已部署，亦不代表外部驗收完成。

## 版本與驗證

- 保留 M2A 全部 56 個來源檔、目前 19 個 release-artifacts 檔及歷史合成測試證據，逐 byte 複製。
- release manifest SHA-256：`9e3564dd4acbe8f89ed8f579a8964d8a7d15c84983c6145a86c964a7e116cbce`。
- M2A source-set SHA-256：`2a77875291a35a07a74ca4686566d87257e3209bc571c2d297c3bed1ea09ceba`。此值只指 [M2A 來源清單](evidence/m2a/source-artifact-manifest.json) 的 56 檔，不包含本文件或 evidence。
- Node 24、內建模組、無 runtime/dev dependencies；不需要 npm install。使用 `npm test`、`npm run check`、`npm run build:release`、`npm run check:release`。
- 根目錄的 HANDOFF、TASK-ENTRY 與 M1/M1B/M2A 文件保留各自當時的狀態；精確公開 commit、完整 tracked inventory、乾淨 clone 命令及 guard 結果由主代理的 M2B publication receipt 記錄。

## 證據範圍

[瀏覽器參照](evidence/m2a/browser-reference.json)：主代理既有隔離執行 32 PASS／6 NOT_RUN／0 FAIL。本輪不另啟動瀏覽器。兩語各自的 private late-event delivery、真 200% 文字放大、native／真機／AT 共六項保持 NOT_RUN；外部驗收待進行。

所有 SRT 與 oracle 為合成資料。歷史失敗紀錄保留，不能與後續通過版本混算。本 repository 排除 dist、node_modules、npm cache/config、test-workspaces、舊工作副本，保留歷史 manifests、diffs、實測命令、oracle，以及 M2A 的完整舊 release-artifacts 備份。歷史證據中的本機路徑是當時命令的紀錄，不是 clone 的必要路徑。請勿把會覆寫歷史紀錄的 freeze／record／validate 腳本當成乾淨 clone 驗收命令。

本輪沒有 Cloudflare 部署、首頁變動、付費服務、憑證讀取、登入／權限擴充或持久環境設定修改。
