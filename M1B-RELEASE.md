# B20-RP-50 — 雙語字幕合併離線發布準備

2026-10-23（Asia/Taipei）。**M1B release candidate，尚未上線，也不是 M2 放行。** 預定 origin 是 `https://bilingual-subs.glossquote.com`，toolSlug 為 `subtitle-bilingual`。原功能對話要求 gpt-6.1-sol/max；不以自述確認 backend 身分。

此輪依主代理 `.runs/batch20-release-prep-2026-10-23/TASK.md` 完成發布工具鏈，不變更產品 runtime、公用首頁或 M1 preview。M1 的實際產品能力與未驗範圍沿用 [HANDOFF](HANDOFF.md) 及既有證據；這不是新的瀏覽器通過證明。

## 重現

現有 Node v24.14.0、npm；不安裝套件。

```text
npm test
npm run check
npm run build:release
npm run check:release
```

本輪收據用 `node scripts/validate-m1b.mjs` 依序呼叫現有 npm-cli.js 執行以上四項；所有直接 child 都 `shell:false`、`windowsHide:true`。npm 強制 offline、關閉更新/audit/fund、空白任務內 user/global config 與任務內 cache，避免讀取使用者 npm 設定或將測試快取寫到帳戶位置。沒有 install。此 runner 防止覆蓋既有 final 收據；後續驗證者可直接執行四個命令，應另外保存自己的證據。

核心介面為 `node scripts/release.mjs build` / `check`。無參數、錯 mode、額外參數一律 exit 1；沒有 deploy、任意 origin、環境變數或憑證介面。原 dev/test/check/build 保留，preview 來源未變，因此本輪不重跑原 preview build。

## 審查的產物

瀏覽器驗收者應使用 **`release-artifacts/site/`** 作為靜態站點根目錄。`release-artifacts/manifest.json` 是其 sibling，**不在 site 中**。不要用 `dist/` 代替正式 SEO 候選，也不要將整個工具資料夾當作站點根目錄。ES modules/worker 需要 HTTP origin；本輪未啟動 server，也未確認 port/實際瀏覽器載入能力。任何後續瀏覽器操作都必須先由主代理確認隔離機制符合使用者焦點限制。

site 是原 public 16 檔加 `sitemap.xml` 的去重集合，共 17 檔。兩語 HTML 只修改 head 中 robots 與 canonical/alternate links；body、既有 title/description/H1、語言導覽/警告、全部 JS/CSS 等 12 個非 SEO 資產逐 byte 不變。沒有新增已上線、瀏覽器通過、評價或 structured data 聲明。

- 每頁唯一 canonical：`/index.html`、`/en/index.html`。
- 每頁同時具有 zh-Hant/en/x-default 互返，x-default 指中文。
- release meta robots 是 `index,follow`；robots Allow 並列 sitemap；sitemap 只列兩個 canonical，不捏造 lastmod。
- `_headers` 基於既有 **public/_headers**，只將 X-Robots-Tag 改為 `index, follow`。CSP、connect-src/script-src、worker、隱私及安全 headers 完整保留。這只是配置檔，不能視為實際 hosting header 通過。
- public 與原 dist 保持 noindex，沒有寫入 canonical/sitemap；原 M1 evidence 不覆寫。

## 來源與防竄改

manifest schemaVersion=1，mode=`release-candidate`，固定 origin/toolSlug；`files` 列全部 site 檔案，`sourceFiles` 列完整 public 來源。每個 entry 都是排序、無重複的相對 POSIX path/bytes/sha256。manifest 不列自身，不含亂數、時間或本機絕對路徑。

`scripts/release.mjs` 固定 M1 public metadata 指紋 `70979b1ef42cf37cae7034124f813e18f3553e1378a92bdd2cca03538dbf3b55`，其計算為完整來源 entry 按 path 排序後 `sha256(JSON.stringify(rows))`。build/check 都實讀來源，拒絕來源變動；check 重新生成預期 bytes、獨立審查雙語完整 SEO、重算每個實體檔案，不採信可被一起改掉的 manifest。

建立前完整檢查來源與現有輸出。第一次只用 exclusive creation；現有輸出只有全數符合預期時重用，且不重寫。modified/extra/missing/partial/unmanaged、symlink/junction、未知檔案/資料夾一律拒絕，不遞迴刪除、不自動修復或覆蓋。若外部修改或寫入中斷留下部分產物，需由主代理決定安全復原範圍；此輪不猜測或刪除。這是靜態檔案核對與拒絕覆寫機制，不是 OS 層對抗同時寫入程序的鎖。

## 驗證與未驗

31 項針對性發布測試已通過：[log](evidence/m1b/release-tests-01.log)。涵蓋固定 domain、雙語 SEO、preview/body/runtime 不變、重建確定、來源變更、asset+manifest 一起竄改、污染/多檔/缺檔、未知目錄、junction、無效 CLI，以及失敗前後 bytes 不變。負例只修改任務內合成 copy。

完整 npm 命令的實際 exit/test 數、來源與產物 hashes、前後環境指紋及差異由 [本輪交接](HANDOFF.md) 與 `evidence/m1b/` 收據列明；[source-artifact-manifest](evidence/m1b/source-artifact-manifest.json) 另外確認原 public/dist/M1 evidence 沒有改動。

真實 browser/視覺/320px/1024px/鍵盤/焦點/dialog、原生選檔/下載、真機/AT、實際 Network/Storage/Worker/headers/hosting 均 **NOT_RUN_USER_FOCUS_INCIDENT**。沒有 GitHub/public source commit、DNS、Cloudflare、hosting 或首頁變更，沒有建立新的使用者交付 ZIP。主代理仍須獨立驗證，再依後續有界任務補必要 gate；不得直接上線此候選。

最終收據：完整 npm test **112/112 PASS、0 FAIL、0 skipped**；check/build:release/check:release 全部 exit 0。17 個 site 檔共 **81,590 bytes**；[artifact manifest](release-artifacts/manifest.json) SHA-256 為 `7c0572463e122fe437d97d5f1d47381bbc53f4a30e1006f11fe0d8195c2ffc00`。前後 Environment 完整 Snapshots 相同。詳 [四個命令收據](evidence/m1b/commands-final.json)、[環境比較](evidence/m1b/environment-comparison.json)。
