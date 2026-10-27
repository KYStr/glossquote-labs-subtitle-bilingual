# 雙語字幕合併 交接
狀態（2026-10-23，Asia/Taipei）：**M1 本地候選已實作，Node24 離線驗證通過；等待主代理獨立審查與安全隔離的瀏覽器驗收。** 不是完整產品通過，也不是 awaiting external review 的正式 release。

初始歷史：原交接是「規格已準備、尚未實作／驗收／公開／部署」；本輪只推進 M1。

|範圍|狀態|
|---|---|
|本地實作/Node tests/check/build|PASS（僅離線範圍；81 tests）|
|真瀏覽器/原生/真機|NOT_RUN_USER_FOCUS_INCIDENT|
|GitHub/正式網址/首頁|NOT_PUBLISHED|
|外部驗收|NOT_RUN|

每輪記錄需求、實際檔案、差異、命令與 exit、固定檔案 bytes/SHA-256、未驗與已知限制；產品 source commit、reviewed commit、released commit 分開。不得刪歷史失敗或把缺口改 PASS。使用者接受保留手動待驗不等於豁免必要 gate。

## 本輪交付

版本 `0.1.0-m1`／任務 `B20-50-M1`。零 runtime/dev dependencies，未 npm install。新增 `package.json`、`.gitignore`、[TASK-ENTRY](TASK-ENTRY.md)、16 個 public 靜態檔、scripts 工具鏈與 7 個 test 檔；生成相同 16 檔 dist；證據只寫本工具 `evidence/m1/`。未改原 13 份唯讀規格/契約、共享首頁/看板/兄弟工具/GlossGate。

- 嚴格 UTF-8/BOM/newline/序號/時間 parser，1 MiB/3,000 cues 上限，不產生 partial cues。
- BigInt 精確 IoU、mutual unique best、完整歧義 reasons/候選排序、50,000 邊上限；第 50,001 次 eligible comparison 停止並回零部分結果。
- manual/manual-override 與 keep-separate 固定；只重算 full residual graph。取代 automatic pair 列出原配對/釋出句，低於 1/2 顯示精確比例；一個原子確認、Cancel 完全保留原 Result。
- ready 狀態也能保留 automatic endpoint 分開；解除手動配對、還原保留/排除、逐句確認排除。所有未排除來源恰出現一次；review 無 output/Blob。
- 真實 SRT serializer、主先副後、多行文字保留、穩定排序與 UTF-8 無 BOM；雙語來源操作/摘要/逐句修正/預覽/下載頁。
- worker generation、取消終止、stale event 過濾、來源/交換/清除/pagehide 撤銷 URLs；結果沒有計時到期。

## 實際驗證

Windows PowerShell，Node 可執行檔為 `C:/Program Files/nodejs/node.exe`。

|命令|Exit|結果|
|---|---:|---|
|`node --version`|0|v24.14.0|
|`node --test`|0|81 tests；81 PASS、0 FAIL、0 skipped|
|`node scripts/check.mjs`|0|16 靜態檔、2 語頁、11 JS syntax；本地 import/link closure、SEO/labels/noindex|
|`node scripts/build.mjs`|0|16 檔、80,553 bytes；public/dist 每檔 bytes/SHA-256 相同|

記錄：[命令及退出碼](evidence/m1/commands-final.json)、[最終 test](evidence/m1/test-03-final.log)、[check](evidence/m1/check-02-final.log)、[build](evidence/m1/build-01-final.log)。含真實 Node worker_threads 的 ArrayBuffer transfer 測試，**沒有瀏覽器能力的替代證明**。dev handler 只做函式層測試，未開 HTTP listener/server。

實際合成產物 [actual.srt](evidence/m1/oracle/actual.srt) 與手寫 [expected.srt](evidence/m1/oracle/expected.srt) 逐 byte 相等：36 bytes，SHA-256 `1ad73bd6afbbfee65042fa8dc9d127f0f7fb66025138d31bc1fd66712db47224`。主 0..2000 A、副 500..2000 B；結果 0..2000 A/B。

持久環境 [before](evidence/m1/environment-before.json)、[after](evidence/m1/environment-after.json) 都是 PASS，[完整 Snapshots 比對](evidence/m1/environment-comparison.json) 相等；HKCU/HKLM PATH hash/type/length/ephemeral entries、完整 Environment fingerprints 與 TEMP/TMP 均未變。沒有 Git 發布區段，Git settings guard 未執行。

保留歷史：[第一輪 test](evidence/m1/test-01.log) 71 項、69 PASS/2 FAIL；兩項是測試期待 offset 34 應為 33，及假 File 函式不可 structuredClone。修正測試後 [第二輪](evidence/m1/test-02.log) 79/79，再新增 worker AC30/32 得最終 81/81。第一次環境比較 wrapper 誤把 in-process PowerShell 成功後的 `LASTEXITCODE=null` 判成 FAIL；[原紀錄](evidence/m1/environment-comparison-01-wrapper-fail.json) 保留，兩次 Snapshot 實際完全相同，修正比較讀取 guard JSON 的 PASS 狀態；沒有觀察到 drift。

## 固定來源與範圍

[source-manifest.json](evidence/m1/source-manifest.json) 列每個來源/規格/交接檔及 dist 的 bytes/SHA-256；由 `node scripts/freeze.mjs` 在本交接寫完後產生並二次讀取確認來源不變。證據不放入 source manifest，dist 獨立列明；沒有自我引用的 manifest hash。

本工具原本即整目錄未追蹤；本輪 `git diff --stat -- .` 因此沒有 tracked diff，不能將空 diff 當成已提交或無新增檔的證據。新增及修改範圍以 [TASK-ENTRY](TASK-ENTRY.md)、允許的來源清單、實際檔案清單和固定 manifest 檢視。沒有 commit、push 或 auth/config 變更。

source commit／reviewed commit／released commit：均 `NOT_CREATED`。GitHub `KYStr/glossquote-labs-subtitle-bilingual`、正式 domain、Cloudflare、共享首頁都 `NOT_PUBLISHED`。沒有建立交付 ZIP；交主代理整合到單一外層驗收包。

## 必要未驗與下一步

所有真實 browser UI、320px/1024px render、鍵盤/焦點/dialog、原生選檔與實際下載、Network/Storage、瀏覽器 worker/Blob URL、真機、媒體播放器與輔助科技均 **NOT_RUN_USER_FOCUS_INCIDENT**。CSS/靜態掃描與 Node session/controller 測試只證明各自範圍。詳 [驗收對照](evidence/m1/ACCEPTANCE-MATRIX.md)。

候選需要從 HTTP static origin 載入 ES modules/worker；`dev` 僅 127.0.0.1:4230。本輪遵照指令沒有啟動 server，亦未確認 port 是否可用；不宣稱直接開 file:// 即可操作。只支援明訂的受限 SRT profile，不做翻譯、ASR、轉檔或通用播放器相容性保證。

主代理先審查固定 sources 及精確 oracle，之後在已驗證不影響使用者的隔離機制補齊瀏覽器必要 gates。未獲 M2 放行前不出版 GitHub；不跳到 M3 hosting/首頁。只有主代理補完其驗收並發指令後再推進。

## B20-RP-50 — M1B 離線發布準備（2026-10-23）

**本輪 M1B 已完成離線實作與驗證，等待主代理回收獨立核驗；不是 M2 發布放行。** 前述 M1 歷史與 source manifest 不重寫。要求模型 gpt-6.1-sol/max；backend 身分未以自述確認，沒有自行切模型/開對話/委派。

實際來源差異僅 11 檔：修改 `package.json`、`scripts/check.mjs`、`test/merge.test.mjs`、`test/toolchain.test.mjs`、本 `HANDOFF.md`、`TASK-ENTRY.md`；新增 `scripts/release.mjs`、`scripts/validate-m1b.mjs`、`scripts/record-m1b.mjs`、`test/release.test.mjs`、[M1B-RELEASE.md](M1B-RELEASE.md)。兩個既有 test 的唯一行為改動是將合成產物/臨時 copy 改寫到 m1b；產品測試 oracle 不變。新增本輪證據與 release-artifacts，不改 .gitignore。

新增 `build:release` / `check:release`，原 dev/test/check/build 保持。release origin 固定 `https://bilingual-subs.glossquote.com`，toolSlug=`subtitle-bilingual`；不接受 CLI/env 覆寫、無參數/未知 mode/多參數皆拒絕。public 的 16 檔由固定 M1 metadata SHA 保護；HTML 僅改 head robots/SEO links，12 個 JS/CSS 非 SEO 資產及 body 逐 byte 保留。robots/sitemap 只列本工具兩語 canonical；安全 headers 從 public/_headers 保留，僅改 X-Robots-Tag。沒有新增上線/通過宣稱。

`release-artifacts/site/` 是瀏覽器後續應審查的站點根目錄，17 檔、81,590 bytes；`release-artifacts/manifest.json` 是 sibling 審核檔，不進 site。manifest 固定 schemaVersion=1/mode=release-candidate/origin/toolSlug，列 17 個檔與完整 16 個 public source 的 path/bytes/SHA-256，沒有時間、亂數或本機絕對路徑。artifact manifest SHA-256：`7c0572463e122fe437d97d5f1d47381bbc53f4a30e1006f11fe0d8195c2ffc00`。

生成前完整檢查來源及既有輸出；全新檔案 exclusive create，合法相同產物重用且不重寫。篡改/多檔/缺檔/部分產物/未知檔目錄/來源變動/junction 一律拒絕，不遞迴刪除或覆寫。checker 每次重讀來源、重新生成 expected bytes、獨立檢查 title/description/H1/canonical/hreflang/robots，再比對實體檔及 manifest；連 asset+manifest 一起改也不能通過。

### 真實命令與收據

Node v24.14.0；現有 npm-cli.js 以 task-local 空白 user/global config、cache、offline 與關閉 update/audit/fund 執行，所有直接 child `shell:false/windowsHide:true`，沒有 install。

|命令|Exit|實際結果|
|---|---:|---|
|`node --test test/release.test.mjs`|0|31/31 針對性發布測試，0 skipped|
|`npm test`|0|112/112 完整測試，0 FAIL、0 skipped；其中 31 項為本輪新增|
|`npm run check`|0|preview 16 檔、2 頁、11 JS syntax；原 noindex 通過|
|`npm run build:release`|0|17 檔/81,590 bytes，第一次建立，reused=false|
|`npm run check:release`|0|同一固定來源/產物完整通過|

沒有重跑真 root preview build，也沒有啟動 dev/serve/HTTP listener。測試只對 m1b 任務內 copy 做修改/缺檔/junction/污染等負例；每項負例確認拒絕前後檔案 bytes 不變。

[命令總收據](evidence/m1b/commands-final.json)、[npm test](evidence/m1b/npm-test-final.log)、[check](evidence/m1b/npm-check-final.log)、[build:release](evidence/m1b/npm-build-release-final.log)、[check:release](evidence/m1b/npm-check-release-final.log)、[31 項測試](evidence/m1b/release-tests-01.log)。本輪沒有失敗測試、沒有略過檢查；這裡的 PASS 限離線範圍。

持久環境 [before](evidence/m1b/environment-before.json)、[after](evidence/m1b/environment-after.json) 都 PASS，[完整 Snapshots 相等](evidence/m1b/environment-comparison.json)，包含 HKCU/HKLM PATH hash/type/length/ephemeral arrays、完整 Environment-key 指紋與 TEMP/TMP，未觀察到 drift。沒有 Git/source publication 區段，Git settings guard 未執行，亦無 Git/auth/settings 寫入。

[本輪 source/artifact 固定清單](evidence/m1b/source-artifact-manifest.json) 列完整來源與 18 個產物（17 site + sibling manifest）的 bytes/SHA，以及相對 baseline 的 11 檔差異；另外確認原 public/dist/M1 evidence 共 55 檔全部未變。source manifest 不含 evidence、dist、release-artifacts；產物另列。原工具目錄仍未追蹤，不能以空 tracked diff 證明本輪沒有新增；以 baseline copies、差異與固定實體檔核對。

### 尚缺 gate、風險與主代理決定

browser/視覺/原生/真機/AT、實際 Worker/下載/headers/Network/Storage 仍 **NOT_RUN_USER_FOCUS_INCIDENT**。index/follow 與安全 headers 只是候選檔，不代表網站已上線或 hosting 配置已生效。來源變更須後續有界任務重新審核 M1 pin；若不完整輸出由外部修改或中斷造成，工具會拒絕自動修復，需要主代理決定安全復原範圍。本輪沒有此類阻擋，也沒有未決的產品分歧。

source/reviewed/released commit 仍 NOT_CREATED；GitHub/Cloudflare/DNS/hosting/首頁仍 NOT_PUBLISHED/NOT_DEPLOYED。沒讀憑證、沒安裝服務、沒付費、沒啟動 browser/native、沒留下背景服務。原 M1 ZIP/證據保留，沒有另外製作交付 ZIP；由主代理整合單一外層 archive。下一步只交主代理獨立核驗並按既定 gates 決定後續工作；本輪停在 M1B。

## B20-50-M2A — 設定與入口發布準備（2026-10-27）

**M2A 本地準備完成，等待 root 審查／另行放行 M2B；沒有推送或部署。** 本輪與 root 同步收到的入口修正已一併完成。原 M1/M1B 的文件、紀錄及凍結包保留，以下追加新事實，不覆寫歷史。

### 瀏覽器既有範圍

root 真正執行 `.runs/batch20-browser-release-2026-10-25/isolated/b20-50-r1`：Browser 145.0.7632.6，32 PASS／6 NOT_RUN／0 FAIL，prohibited=[]，parent cleanup PASS；root 已看 320px 成功圖。[參照與來源 hashes](evidence/m2a/browser-reference.json)。本輪只讀該結果，沒有重啟 browser/native/server，也沒有把 Node suite 冒充 browser。

六項是兩語各自的 private late-event delivery、真200%文字放大、native/真機/AT，保持 NOT_RUN。不是所有人工項通過，更不是外部驗收通過。原功能對話 requested Sol/max；未切模型／另委派，backend 身分未自行證實。

### 實際修改

新增 `wrangler.jsonc`、`scripts/validate-m2a.mjs`、`scripts/record-m2a.mjs`、[M2A-RELEASE.md](M2A-RELEASE.md)；修改 `scripts/release.mjs`、`scripts/check.mjs`、`test/release.test.mjs`、`test/merge.test.mjs`、`test/toolchain.test.mjs`、本 HANDOFF 與 TASK-ENTRY。package/.gitignore 不變。測試合成輸出與暫存全部移至 m2a；沒有寫 m1/m1b 舊證據。

Hosting 固定 `glossquote-subtitle-bilingual`／2026-10-24，workers_dev/preview_urls/send_metrics/observability/logs/invocation_logs/traces 全 false；唯一 bilingual-subs.glossquote.com custom domain，assets=`./release-artifacts/site`、run_worker_first=false、html_handling/not_found_handling=none，build=`npm run build:release`。沒有新增 edge runtime/main、bindings、storage、vars、帳戶／憑證或權限。checker 用固定 canonical JSON 拒絕漂移、unknown/duplicate keys、analytics 等覆寫。

兩語正式頁沒有候選／未發布標語，所以不改頁面或新增臆測刪除規則。release auditor 另拒絕兩語及 encoded 發布階段標語、inline/remote analytics script、額外 stylesheet/asset；真正產品語彙「字幕候選」保留。

root 指出 bare入口需顯式轉址，本輪新增 release `site/_redirects`，三行真LF與final LF：

```text
/ /index.html 301
/en /en/index.html 301
/en/ /en/index.html 301
```

site現在18檔／81,655 bytes；sibling manifest5,237 bytes，合計19檔／86,892 bytes。**唯一產物變更為新增_redirects與更新manifest；原17個site檔（HTML/JS/CSS/CSP/robots/sitemap）逐byte不變。** public/dist/runtime與所有舊evidence也不變。

原 release 18檔完整備份在 `evidence/m2a/before/release-artifacts/`，舊manifest SHA仍為 `7c0572463e122fe437d97d5f1d47381bbc53f4a30e1006f11fe0d8195c2ffc00`。升級只接受此已知舊版：來源pin、完整舊17檔、manifest及完整backup全部通過才寫新_redirects，最後更新已驗證manifest。任何未知、改過、缺少檔案／backup皆拒絕，不遞迴刪除，不覆蓋未管理資料。乾淨來源可直接生成新版；新版一致重建只重用。

### 真實驗證與版本收據

|階段／命令|Exit|結果|
|---|---:|---|
|設定階段 release tests|0|72/72|
|設定階段完整四個npm命令|0|153/153；root追加轉址前的收據，保留原樣|
|含轉址 release tests|0|81/81|
|最終 npm test|0|162/162，0 FAIL、0 skipped|
|最終 npm run check|0|preview16檔／2語頁／11 JS＋固定hosting|
|最終 npm run build:release|0|migrated=true；18 site檔／81,655 bytes|
|最終 npm run check:release|0|最終來源／設定／manifest／bytes通過|

Node v24.14.0，零新增依賴。既有 npm-cli.js 以 offline、空任務內 user/global config、任務內 cache 執行；直接 child 均 shell:false/windowsHide:true。沒有 npm install、Wrangler CLI、server、實際新 browser 或部署。

設定階段 [153項收據](evidence/m2a/commands-final.json)／[72項測試](evidence/m2a/release-tests-01.log)；入口追加後 [81項測試](evidence/m2a/release-redirects-tests-01.log)；最終 [commands](evidence/m2a/final/commands-final.json)、[test](evidence/m2a/final/npm-test-final.log)、[check](evidence/m2a/final/npm-check-final.log)、[build](evidence/m2a/final/npm-build-release-final.log)、[check:release](evidence/m2a/final/npm-check-release-final.log)。沒有刪除失敗或冒填未跑；本輪測試均無失敗／略過。

完整 Environment [before](evidence/m2a/environment-before.json)／[after](evidence/m2a/environment-after.json) 都 PASS，[全輪及入口階段 Snapshots](evidence/m2a/environment-comparison.json) 相同，涵蓋 HKCU/HKLM PATH type/hash/length/ephemeral arrays、完整 Environment/TEMP/TMP指紋。[設定階段比較](evidence/m2a/environment-comparison-config.json) 另保留。無持久環境或 Git/auth設定寫入；沒有 publication 區段，Git settings guard 未執行。

### 固定 bytes／hashes 與剩餘範圍

- 新manifest SHA-256：`9e3564dd4acbe8f89ed8f579a8964d8a7d15c84983c6145a86c964a7e116cbce`。
- _redirects（65 bytes）SHA-256：`9e47a2579b08f461b1124de1e42a1bde7a79ca29d77401104f6f432d8be90e1e`。
- wrangler.jsonc SHA-256：`84a36563d8c93010a84c32b53589a81c6884b4d02d1c2f55b004521e8253cc49`。

[source/artifact固定清單](evidence/m2a/source-artifact-manifest.json) 列每檔bytes/SHA、source-set與artifact-set hashes、140檔初始baseline的實際差異、所有舊證據／public／dist／17原site檔保護及舊18檔backup核對。source清單排除dist/evidence/release-artifacts，產物單列；空tracked diff不當作已提交證明。M2A以最終清單為準，M1/M1B清單保留其版本範圍。

50站真實 `/`／`/en`／`/en/` 301、Cloudflare hosting headers/DNS、Wrangler schema/dry-run、M2B公開來源及外部驗收仍未執行。六個 browser NOT_RUN 不變；既有32個 PASS因HTML/runtime/CSP不變沿用，不重新做瀏覽器測試。root將審查本M2A再另行放行M2B。沒有新ZIP、GitHub/push/deploy、付費、憑證存取或新服務，也未改共享首頁／看板／其他工具。
