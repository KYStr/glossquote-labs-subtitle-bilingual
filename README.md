# 雙語字幕合併 / Merge bilingual subtitles

候選 slug subtitle-bilingual；候選 domain bilingual-subs 由主代理另行驗證。規格狀態：尚未實作，不是 media/browser gate 通過證明。

這是給手上有兩個語言 SRT 字幕檔、想重疊對齊並輸出雙語字幕的人使用的本機工具。使用者指定主字幕與副字幕；工具依時間交集/聯集比率提出一對一配對，顯示歧義讓使用者決定，並可手動配對。使用者可確認取代自動配對，原配對釋出的 cue 會重新分類；也可將 cue 明確保留為獨立字幕。輸出每個匹配 cue 以主字幕時間為準，兩種語言文字堆疊；未配對主 cue 保留主文，未配對副 cue 保留為獨立 cue。

每個檔案最多 1 MiB、3000 cues；eligible IoU 候選總邊最多 50,000，超限拒絕整批以保護記憶體。只處理 SRT 時間和文字，不翻譯、不跑 ASR、不轉碼，也不宣稱媒體播放或所有 SRT 變體完整相容。所有輸入只留在分頁記憶體，不上傳或改來源。難度中高，核心在毫秒整數、重疊 IoU、避免多對一和保留 unmatched data。

M1 需交付可操作的雙語本機 candidate、Node24 offline tests/check/build。規格階段未實作或跑 browser；browser gates 是 NOT_RUN_USER_FOCUS_INCIDENT。非目標：雲端翻譯、語音辨識、音訊、外部轉換器、複雜 SRT styling 解析、讓 unmatched cues 靜默消失。閱讀 PRODUCT、TECHNICAL、UX-SEO、ACCEPTANCE、TASKS；共同要求見本目錄 AGENTS.md、START-HERE.md、HANDOFF.md 和 docs/。
