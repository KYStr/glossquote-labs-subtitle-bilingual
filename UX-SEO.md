# 介面、雙語文案與搜尋摘要

## 語言頁面與搜尋資訊

繁中頁為 /index.html，英文頁為 /en/index.html。兩者是內容一致、獨立載入的靜態頁面，語言連結使用一般 anchor 導頁；每個連結旁都要顯示「切換語言會離開本頁，尚未匯出的字幕與結果會遺失」。不使用 storage、URL 參數或 hash 保存狀態。兩頁都設 noindex、nofollow、noarchive，不載 remote fonts、analytics 或第三方資源。

繁中 title：雙語字幕合併｜Gloss Tools

繁中 description：在本機合併兩份 SRT 字幕，按時間重疊配對、檢查歧義並保留未配對字幕，再下載雙語 SRT。

繁中 H1：把兩份 SRT 合成雙語字幕

English title: Merge Bilingual Subtitles | Gloss Tools

English description: Match two SRT files by timeline, review ambiguous and unmatched cues, then download a bilingual SRT locally.

English H1: Merge two SRT files into bilingual subtitles

繁中 FAQ：

- 會自動翻譯字幕嗎？不會，只按時間配對兩份既有字幕。
- 什麼情況會自動配對？交集／聯集比例至少 0.5，且兩側都是唯一最佳配對時才自動配對。
- 有歧義時可以直接下載嗎？不行。逐一配候選或明確保留分開字幕後，才會建立下載結果。選擇已自動配對的候選會先說明要取代哪一對；取消保留原結果。
- 可以手動配對低於 0.5 的句子嗎？可以，但確認前會顯示精確 IoU 與警告；取消不會改動既有配對。
- 可以把自動配對的句子保留為分開字幕嗎？可以。確認會列出被釋出的另一句；取消不改動原配對。
- 未配對字幕會消失嗎？不會；預設保留。若要排除，需逐句選擇並確認。
- 支援哪些字幕檔？本版定義受限 UTF-8 SRT 格式，不承諾支援所有 SRT 變體。
- 候選配對太多怎麼辦？超過 50,000 組符合時間門檻的候選時，整批停止並提示縮短字幕片段；不提供部分結果。
- 字幕會上傳嗎？不會。檔案在本機記憶體處理，沒有上傳、AI 或轉檔。

English FAQ:

- Does it translate subtitles? No. It only matches two existing subtitle files by time.
- When are cues matched automatically? Only when timeline IoU is at least 0.5 and each cue has a unique mutual best match.
- Can I download while matches are ambiguous? No. Pair each ambiguous cue or explicitly keep it separate before an output is created. If a candidate replaces an automatic pair, the confirmation names that pair; canceling preserves the existing result.
- Can I manually pair cues below 0.5 IoU? Yes, after reviewing the exact ratio and warning. Canceling leaves existing matches unchanged.
- Can I keep an automatic match as separate cues? Yes. The confirmation names the released cue; canceling keeps the original match.
- Are unmatched cues discarded? No. They stay in the output by default; excluding one requires an explicit choice and confirmation.
- Which subtitle files are supported? This release defines a strict UTF-8 SRT profile and does not claim support for every SRT variant.
- What if too many subtitle cues overlap? More than 50,000 eligible candidate pairs stops the whole job with a clear prompt to shorten the subtitle segments; no partial result is offered.
- Are my files uploaded? No. Files are processed in local memory without upload, AI, or conversion.

## 工作區線框

Desktop，至少 1024 CSS px：

    ┌──────────────────────────────────────────────────────────────┐
    │ Gloss Tools / 雙語字幕合併           語言：繁中 | English     │
    │ 切換提醒：尚未匯出的字幕與結果會遺失                      │
    ├──────────────────────────────────────────────────────────────┤
    │ 主字幕 [選擇 SRT] 檔名／大小／解析狀態                      │
    │ 次字幕 [選擇 SRT] 檔名／大小／解析狀態                      │
    │ [開始配對] [取消] [清除全部]   進度與明確錯誤                 │
    ├────────────────────────────┬─────────────────────────────────┤
    │ 配對摘要／歧義候選          │ 預覽：主句在上、次句在下        │
    │ 候選配對／保留分開／取代確認│ 主時間軸、輸出順序與排除確認    │
    │ 未配對逐列選對象／低分手動配對│ 待決時無結果下載，狀態明確提示│
    ├────────────────────────────┴─────────────────────────────────┤
    │ [下載雙語 SRT]；下載名稱 bilingual-subtitles.srt             │
    └──────────────────────────────────────────────────────────────┘

Mobile，寬度 320–767 CSS px，單欄，順序為主檔、次檔、動作／進度、摘要、逐列審閱、預覽、下載。按鈕全寬且文字換行不遮住狀態；每列不以顏色作唯一狀態標記。檔案選擇使用標準網頁 input，不觸發額外原生 dialog。鍵盤可到達配對、取消、選擇與下載控制；錯誤以文字關聯至對應檔案。

## 錯誤與狀態文案

繁中明確區分：檔案超限、不是有效 UTF-8、SRT 區塊格式錯誤、時間無效、線程已取消、配對需人工決定、自動配對取代確認、低於門檻配對確認、沒有任何輸出字幕。確認對話框等待或取消時原結果維持不變；取代確認列出原配對與將返回候選審查的 cue。錯誤不回傳部分結果，並保留使用者原始檔案選擇以便更正或清除。

English copy must preserve the same actions, limits, warnings, and status meanings as the Traditional Chinese page. Do not claim universal player or subtitle compatibility, translation, upload, privacy beyond the implemented local-only candidate, or a match that the algorithm did not make.

## 實際瀏覽器狀態

M1 靜態頁面與瀏覽器互動檢查為 NOT_RUN_USER_FOCUS_INCIDENT。只可在不影響使用者鍵盤、IME、剪貼簿、焦點或原有分頁的隔離機制已由主代理驗證後重開該檢查；文件與 Node CLI 測試不等於瀏覽器驗收。
