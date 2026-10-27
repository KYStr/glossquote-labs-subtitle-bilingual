# M1 驗收對照

2026-10-23，Node v24.14.0。81 項離線 tests 通過；以下 PASS 只指明列的離線證據。全體瀏覽器能力仍 NOT_RUN_USER_FOCUS_INCIDENT。

|AC|離線證據|尚未驗證|
|---|---|---|
|1–6、18|parse-srt tests：UTF-8/BOM/newlines、序號/時間/offset、最大 8 位小時、精確 1 MiB 與 3,000 cues 邊界；失敗無 partial cues|實際瀏覽器選檔/解碼路徑|
|7–8|完整 Result 手寫 oracle、1500/2000→3/4、剛好 1/2 與低 1ms；actual.srt 36 bytes 對 expected.srt 相等|瀏覽器 preview/download|
|9–13|exact ratio 排序、ties/non-mutual、競爭勝出、one-to-one、固定 manual/keep-separate、2/5 override 確認|候選選單/互動|
|14、16|手寫 OutputCue 順序、主/副及 index tie-break、多行、1000 小時、UTF-8 無 BOM/final LF|實際瀏覽器下載檔|
|15|worker 排除確認/取消/計數/還原，配對端排除後釋出對端；預覽空時下載 disabled 的 controller guard|web dialog、排除列顯示與鍵盤|
|17|serializer 保留 script/style-looking 純文字；public 僅 textContent/安全 DOM，靜態禁用危險 API|瀏覽器 DOM 惡意文字不執行|
|19–20|controller transport harness：terminate、epoch、read 中取消、舊 success/error/progress 忽略；真實 Node worker transfer 有獨立測試|瀏覽器 Worker terminate 與事件排序|
|21|controller URL 建立/撤銷與 reset/source/pagehide、重複下載、無 timer API 靜態檢查；不是實際 15 分鐘瀏覽器測量|瀏覽器實際 URL lifecycle、pagehide/BFCache|
|22|同名/同內容來源保留獨立 main/secondary，交換後新 job/主時間軸|實際瀏覽器檔案資訊|
|23–24|兩靜態頁完整標題/description/H1、等價操作/FAQ/錯誤、語言警告/正常 anchor、相同 IDs、local asset closure|兩語實際載入、導覽、Network/Storage|
|25|CSS 明訂 48rem/75rem、單欄/雙區、min-width:0/wrap/focus/reduced-motion|320px/1024px render、200% zoom、鍵盤/AT/觸控/對比呈現；NOT_RUN|
|26|node --test/check/build 真實 exit0；16 檔 dist 與 public bytes/SHA 相同；未知/linked output拒絕且不刪；零依賴|live HTTP/server 未啟動；request handler 只有函式層測試|
|27|NOT_RUN_USER_FOCUS_INCIDENT，沒有瀏覽器/原生/播放器操作|保持未驗，不宣稱 PASS|
|28|250×200→50,000 邊；250×201 在第 50,001 比較停止；錯誤所有列表空、fileIndex/offset null、無 sources/Blob（controller test）|實際瀏覽器大圖與 Blob gate|
|29|每條 unresolved edge 一次、原因固定順序、review 無 output；固定 manual/keep-separate，final origins exactly-once|逐列可達性與密集資料 UI|
|30|core 完整 deepEqual + worker 完整流程：B-X pending 列 A-X/釋出 A；Cancel 完全不變；確認後 A-Y/Z=3/5 tie；固定 B-X；keep A 後 A,B/X,Y,Z 各恰一次|完整 browser 操作與確認內容呈現|
|31|core 2/5 精確 pending/Cancel/reference identity、manual-override output；controller pending 禁止下載、確認後可下載|瀏覽器低門檻警告與 dialog|
|32|core + worker ready automatic keep A、列釋出 X、Cancel 完全相同、接受後 A kept/X unmatched，各獨立輸出|ready automatic row 在 browser 的完整流程|

歷史測試失敗不刪除：[test-01](test-01.log)、[test-02](test-02.log)、[final](test-03-final.log)。所有輸入為合成資料，沒有使用者字幕、憑證、瀏覽器資料、外部請求或安裝。產物與來源清單交主代理製作單一整合 archive；本輪不額外建 ZIP。
