# B20-50-M2A — 本地發布設定準備

2026-10-27，Asia/Taipei。**本輪僅 M2A；沒有 GitHub 推送、部署、DNS／首頁整合或新 ZIP。** 延續原對話 requested Sol/max；沒有切模型、委派，backend 身分未由自述確認。root 審查本輪固定來源後，另行放行 M2B。

## 已有瀏覽器證據

root 的 `.runs/batch20-browser-release-2026-10-25/isolated/b20-50-r1` 有 38 案：**32 PASS、6 NOT_RUN、0 FAIL、prohibited 空**；Browser 145.0.7632.6、parent cleanup PASS。root 已看過 320px 成功截圖。本輪只讀取既有結果，未重啟 browser/native/server；參照與原檔 SHA 見 [browser-reference.json](evidence/m2a/browser-reference.json)。

六項仍是中英各自的 delayed private event delivery、真 200% 文字放大、native/真機/AT 範圍。沒有把這些改 PASS，也沒有宣稱外部驗收通過；前輪「未跑 browser」描述保留為歷史，以本輪追加交接說明新狀態。

## 產物保存與頁面 bytes

原 `release-artifacts/` 全部 18 檔已複製到 `evidence/m2a/before/release-artifacts/`，每檔 bytes/SHA-256 已核對。備份中的原 artifact manifest SHA-256 為 `7c0572463e122fe437d97d5f1d47381bbc53f4a30e1006f11fe0d8195c2ffc00`，不覆寫。

兩語正式 HTML 都**沒有候選／未發布標語**，因此沒有新增刪除規則，也沒有硬改任何頁面。原 17 個 site 檔（81,590 bytes）全部保留。依 root 在本輪追加的入口修正，只新增 `_redirects`，更新 sibling manifest；public/dist、產品 runtime、M1/M1B 舊證據及凍結包不改寫。

### root 追加的入口轉址

root 實測 42 站指出 `html_handling:none` 時 bare `/` 與 `/en/` 需顯式入口規則。本工具新增固定 `_redirects`，**每行為真 LF，含最後 LF**：

```text
/ /index.html 301
/en /en/index.html 301
/en/ /en/index.html 301
```

site allowlist 為原 17 檔加 `_redirects`，現在 18 檔；manifest 覆蓋新增檔，canonical 仍是兩個 `/index.html` 路徑，CSP/原 HTML/JS/CSS/robots/sitemap 不改。現有舊產物只能在 manifest 固定 7c057…、完整原 17 檔與完整備份都符合預期時受控升級；其他修改／缺檔／污染或備份不符都拒絕，絕不自動刪除。升級只建立 `_redirects` 並最後更新已驗證的 manifest；新版一致重建仍僅重用。這是根目錄入口準備，沒有在本輪對 50 站實際部署或 HTTP 301 實測。

## 固定 hosting 設定

[wrangler.jsonc](wrangler.jsonc) 是 canonical JSON 的 JSONC 子集；本地 checker 限定固定 bytes，拒絕 duplicate key、comment/隱藏 override、未知欄位及格式漂移，不是任意 JSONC 的編輯器。

|欄位|固定值|
|---|---|
|name|glossquote-subtitle-bilingual|
|compatibility_date|2026-10-24|
|workers_dev / preview_urls / send_metrics|全部 false|
|observability.enabled|false|
|observability.logs.enabled / invocation_logs|全部 false|
|observability.traces.enabled|false|
|routes|唯一 bilingual-subs.glossquote.com，custom_domain=true|
|assets.directory|./release-artifacts/site|
|assets.run_worker_first|false|
|assets.html_handling / not_found_handling|全部 none|
|build.command|npm run build:release|

沒有 edge Worker handler/main、bindings、storage、vars、account id、憑證或權限擴充。既有瀏覽器 merge-worker JS 是靜態資產，bytes 保持不變。設定不進 site，build:release/check:release 先驗設定再驗來源與產物；`npm run check` 也會核對 hosting 設定。

本輪使用 workers-best-practices 技能與官方文件核對欄位。技能預設建議當日 compatibility date／啟用 observability；這兩點依本次使用者指定的日期與 no-telemetry 契約處理，不新增審批門檻。Assets-only 可省略 main，且 run_worker_first=false 走 asset 配對；參照 [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) 與 [Static assets configuration](https://developers.cloudflare.com/workers/static-assets/binding/)。`html_handling=none` 對應停止內建 HTML rewrite，[官方 HTML handling 說明](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)；`invocation_logs=false` 的位置亦與 [Workers Logs 文件](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) 相符。

**未安裝／執行 Wrangler，未做 dry-run 或向帳戶送 API。** 本地檢查驗的是此固定契約，不冒充某一已安裝 Wrangler schema 或 Cloudflare 實際接收／hosting 生效。M2B／部署仍由 root 依核准版本及權限處理。

## 新增驗證

release HTML auditor 除原 title/description/H1/canonical/hreflang/robots 外，額外拒絕發布階段文案、兩語 encoded 文案、額外／inline／remote analytics script、未知 stylesheet/資產與事件屬性；產品語彙「字幕候選／candidate」仍允許。實體檔仍按固定 M1 source pin 重建 expected bytes，asset+manifest 一起修改不能通過。

原設定階段新增 41 個負例／設定驗證，與原 31 個 release tests 合併為 **72/72** 針對性測試通過。包含錯 name/date/domain/path、wildcard/extra route、workers.dev/preview/metrics/logs/traces 開啟、runtime/analytics/storage/env override、重複 JSON key、missing/非檔 config，以及中英標語／analytics。root 追加入口後，再加精確規則、302／外域／缺列／literal backslash-n／多列篡改與受控升級／備份拒絕測試；每個負例只寫 m2a 合成 copy，並驗失敗不破壞既有 bytes。

完整最終命令：

```text
node scripts/validate-m2a.mjs
# 依序透過既有 npm-cli.js 執行：
npm test
npm run check
npm run build:release
npm run check:release
```

runner 使用 offline、空白任務內 npm user/global config、任務內 cache；所有直接 child `shell:false/windowsHide:true`。沒有 install 或全域設定修改。三個既有 test 的變動只包含新增發布負例／config copy 及將合成輸出移到 `evidence/m2a/`，不寫原 m1/m1b 證據。

root 追加轉址前的設定階段完整驗證為 **153/153**，四個命令均 exit 0；[該輪收據](evidence/m2a/commands-final.json) 原樣保留，不冒充含轉址的最終版本。最終 exit／完整數量見 [final/commands-final.json](evidence/m2a/final/commands-final.json)，來源／產物／backup 完整 hashes 與原 140 檔 baseline 的差異見 [source-artifact-manifest.json](evidence/m2a/source-artifact-manifest.json)。前後環境比對完整 Snapshots，包含 HKCU/HKLM PATH type/hash/length/ephemeral arrays 與完整 Environment-key/TEMP/TMP；沒有 Git publication 區段，Git guard 不冒填 PASS。

本輪禁止的 browser/native、server、安裝、憑證、Git 全域設定、push/deploy、新 ZIP 都未執行；實際 hosting、M2B source publication、外部驗收仍未完成。唯一下一步是交 root 檢查固定來源，再依另行指令推進 M2B。

## 最終固定驗證（含入口追加）

|命令|Exit|實際結果|
|---|---:|---|
|針對性 release tests（含轉址）|0|81/81，0 skipped|
|npm test|0|162/162，0 FAIL、0 skipped|
|npm run check|0|16 preview 檔／2 語頁／11 JS，固定 hosting 設定通過|
|npm run build:release|0|migrated=true，18 site 檔／81,655 bytes|
|npm run check:release|0|同版來源／設定／產物通過|

`_redirects`：65 bytes，SHA-256 `9e47a2579b08f461b1124de1e42a1bde7a79ca29d77401104f6f432d8be90e1e`。

新 artifact manifest：5,237 bytes，SHA-256 `9e3564dd4acbe8f89ed8f579a8964d8a7d15c84983c6145a86c964a7e116cbce`。整個 release-artifacts 為19檔／86,892 bytes；舊18檔完整備份的 manifest仍是7c057…。

wrangler.jsonc SHA-256 `84a36563d8c93010a84c32b53589a81c6884b4d02d1c2f55b004521e8253cc49`。本輪兩個階段及整輪 Environment 的完整 Snapshots 均相同，見 [環境比較](evidence/m2a/environment-comparison.json)。所有必要命令已對最終版本執行；不重跑未變瀏覽器案例，不把50站 live轉址、Wrangler dry-run、六項人工／私有事件缺口或外驗冒填PASS。
