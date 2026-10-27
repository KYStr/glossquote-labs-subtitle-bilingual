# 驗收規格：雙語字幕合併

## Job / Result / Contract / Oracle

Job：使用者已經有兩份不同語言的 SRT，希望按時間合併成可再播放的雙語 SRT，並人工處理不確定配對。

Result：主字幕時間軸的輸出 SRT；每句依使用者確認的配對呈現主文、次文，所有未配對句預設仍保留；同時提供可檢視的匹配摘要與錯誤。

Contract：兩個輸入各不超過 1,048,576 bytes、各最多 3,000 cues；僅受限 UTF-8 SRT profile；精確整數毫秒、start < end。eligible interval IoU 候選邊最多 50,000；超過整批回 CANDIDATE_LIMIT、無 partial output，提示縮短字幕片段。只有互為唯一最佳才自動配對；歧義須人工選。不得靜默丟句或做翻譯、上傳、ASR、轉檔。

Oracle：主 0..2000 A 與次 500..2000 B 的 IoU 為 0.75，輸出時間維持 0..2000，文字為 A 換行 B。兩個主 cue 競爭同一副 cue 時，IoU 不同由較高 mutual unique pair 自動配、較低者留 ambiguous；equal-best collision 時雙方都等待人工決定。

## 精確驗收案例

1. 解析有效 UTF-8、LF、CRLF、單獨 CR SRT；每種格式解析為相同 cue 序列。
2. 允許一個 UTF-8 BOM；兩個 BOM、無效 UTF-8、空檔案、空 cue 文字均拒絕且回傳明確錯誤碼與位移，不產生部分 cues。
3. 解析器拒絕非序號起始 1、序號跳號、非十進位序號、缺 timestamp、時間行含不支援設定、缺 cue 文字或非空多餘區塊。
4. 時間戳 00:00:01,000 至 00:00:02,003 解析為 1000 與 2003 ms；分鐘或秒 60、毫秒非三位、end 等於或早於 start 均拒絕。
5. 時間小時至少兩位並最多八位；超出安全整數範圍拒絕，不溢位或 round。
6. 輸入恰為 1,048,576 bytes 可進入解析；多一 byte 拒絕。每檔 3,000 cues 接受；3,001 cues 拒絕。
7. 區間主 [0,2000)、次 [500,2000) 的 IoU 精確為 3/4，可配對；輸出主時間與主先次後文字符合規格。
8. IoU 恰 1/2 的邊建立候選；小於 1/2 的邊不建立候選，顯示為未配對而非近似配對。
9. 用同一最大 IoU 的兩個次 cue 測試，主 cue 有 tie，不能自動配對；候選按精確比例再按來源 index 排序。
10. Main A=[0,1000)、Main B=[0,800)、Secondary X=[0,1000)：IoU(A,X)=1、IoU(B,X)=4/5；A-X 是 mutual unique 並自動配對，B-X 是 non-mutual ambiguous，不得依遍歷順序讓較低比例勝出。
11. Main A=[0,1000)、Main B=[0,1000)、Secondary X=[0,1000)：兩邊 IoU 均 1，X 有 equal-best tie；A-X 與 B-X 都不自動配對，均列人工處理。
12. 不相交 cues 分別列為 unmatchedMain 與 unmatchedSecondary；初始 Result 保留兩邊所有 cues。
13. 手動配對不得重複使用同一主或次 cue；低於 0.5 的手動覆寫需再次確認並標記 manual-override。
14. 最終輸出先按主時間軸 startMs，再按主 cue 優先、次 cue 次之及 sourceIndex 穩定排序；匹配輸出主句後接次句。未配對 cue 使用自己的時間與文字。
15. 明確排除未配對句後顯示排除數量並要求確認；取消確認維持包含狀態。
16. 輸出序號由 1 連續遞增；時間精確格式為 HH:MM:SS,mmm，至少兩位小時；UTF-8 無 BOM，區塊間一空白行，非空檔有 final LF。
17. 字幕字串如 <script>alert(1)</script> 只以純文字呈現並在 SRT 文字中保留，不解析或執行標籤；檔名與標籤不進入可執行 HTML。
18. 第三方字幕超過 byte/cue 限制時拒絕整個檔案，不以截斷方式略過 cue。
19. 執行中取消後 worker 終止、epoch 更新、byte buffers 清空；取消後不得產生 SRT 或把狀態標成 Ready。
20. job 甲取消後啟動 job 乙，再收到甲的延遲 success/error/progress 訊息；UI 必須忽略甲事件，不覆寫乙結果。
21. 新來源、清除或 pagehide 使舊輸出失效，撤銷本 app 建立的下載 ObjectURL；沒有 15 分鐘計時或背景自動過期。
22. 兩份來源相同或同名不自動推斷語言，不更動來源標記、不生成翻譯。
23. 使用者在選來源後切換靜態語言頁會離開目前頁面；連結旁有未匯出資料將遺失警告，且沒有 storage、query、hash 傳狀態。
24. 每個可操作控制有繁中與英文等價文字；載入英文頁直接呈現英文 H1、錯誤、進度、按鈕與 FAQ。
25. 320 px viewport 頁面單欄、不水平溢出；至少 1024 px 桌面畫面能同時看見檔案／摘要與預覽區域。
26. 檢查 package scripts 可執行 test/check/build，build 輸出靜態 dist/；無 npm runtime dependency、無 server-side upload、無 remote request。
27. 實際瀏覽器與真實媒體播放不屬此字幕合併核驗範圍，明確記為 NOT_RUN_USER_FOCUS_INCIDENT；不得標成 PASS。
28. MAX_ELIGIBLE_EDGES=50,000：250 identical main intervals × 200 identical secondary intervals 建立正好 50,000 edges，完成且 edge count 不超限；250×201 的第 50,001 edge 必須立刻回 CANDIDATE_LIMIT，停止 pair scan，error fileIndex/offset 為 null，matches/ambiguous/unmatched/keptSeparate/outputCues 均空、不顯示 preview、不建立 Blob。
29. ambiguous edge reasons 依 main-tie、secondary-tie、non-mutual 固定順序精確標記。status=review 時 outputCues=[]、下載 disabled；每個歧義 cue 必須配一個 eligible/manual-confirmed candidate 或明確 keep-separate。keep-separate 將該 cue 加入對應 keptSeparate 陣列並輸出為單行 cue，不算排除；既有 manual pair 與 kept-separate 是固定決策。每次確認後只在排除固定決策的 full residual graph 重算；automatic match 可被明確確認取代，釋出的另一 cue 返回圖內重分類。所有歧義消失後 status=ready 並輸出每個未排除來源 cue 恰一次，不能漏掉已保留分開項目。
30. Main A=[0,1000)、B=[0,800)、Secondary X=[0,1000)、Y=Z=[0,600)：初始 A-X IoU=1 automatic，B-X IoU=4/5 為 ambiguous；B-Y/B-Z=3/4，A-Y/A-Z=3/5。使用者選 B-X 時，pending confirmation 必須列出將取代 A-X 及釋出 A；在對話框 Cancel 後，原 analysis 各欄（A-X automatic、B-X ambiguous、outputCues 空）逐欄不變。確認後 B-X kind=manual；A 返回 residual graph，A-Y/A-Z 並列為 3/5 tie ambiguous，故 A 仍可見於 review 且沒有被丟失。後續重算不覆蓋固定 B-X。所有 cue 最終各只出現一次，沒有遍歷順序決勝。
31. Main M=[0,1000)、Secondary S=[0,400) 的 IoU=2/5，初始為兩個 unmatched standalone cue。選擇手動配對須顯示精確 2/5、低於 1/2 警告及確認按鈕；Cancel 完全維持原 ready Result 與兩個 standalone outputCues。確認後一次建立 kind=manual-override match，輸出一個 M 時間軸雙行 cue；此固定手動配對不被後續 residual graph 重算取代。
32. Main A=[0,1000)／Secondary X=[0,1000) 初始為 ready 的 automatic match。從該結果列選「保留 A 分開」時，先確認將移除 A-X 並釋出 X；Cancel 後 analysis 完全不變。確認後 A 進 keptSeparateMain，X 回 residual graph 並重分類為 unmatched standalone；ready 輸出 A、X 各一個獨立單行 cue，沒有 cue 遺失或重複。已固定 keptSeparateMain 不會由下一次 matching 重算配回 X。

## 命令與證據

Node.js 24、Windows PowerShell，於工具目錄執行：

    node --version
    node --test
    node scripts/check.mjs
    node scripts/build.mjs

不執行 npm install、不啟動網站、不使用瀏覽器。交付紀錄須逐條記錄命令退出碼及失敗輸出摘要；所有命令使用合成 SRT，不讀取使用者實際字幕。M1 若無可用 Node 24，列為 BLOCKED 並說明，不以其他版本冒充通過。
