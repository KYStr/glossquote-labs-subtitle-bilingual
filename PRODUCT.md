# 產品需求：雙語字幕合併

M1 是可操作的本機字幕對齊工具：載入兩份 SRT、指定主/副語言、對齊/手動修正、預覽雙行字幕、下載新 SRT。來源檔保持不變，所有 cues 要保留或由使用者明確排除。

## Job、result、contract、oracle

Job v1：

    {
      schemaVersion: 1,
      jobId: "job-1",
      main: { sourceIndex: 0, name: "main.srt", cues: [...] },
      secondary: { sourceIndex: 1, name: "secondary.srt", cues: [...] },
      threshold: { numerator: 1, denominator: 2 }
    }

Cue v1: {sourceIndex,startMs,endMs,textLines}. sourceIndex 是該檔案內從0開始的順序。Parsed source cue number 不作 ID，輸出重新編號。Time 全是安全整數毫秒。

OutputCue v1: {startMs,endMs,lines,origin:{mainCueIndex,secondaryCueIndex}}。Matched cue 的兩個 origin 都是整數；main-only cue 的 secondaryCueIndex 為 null；secondary-only cue 的 mainCueIndex 為 null。lines 是輸出的逐行純文字陣列。

Match 與 ambiguous edge 的 intersectionMs/unionMs 保留未約分毫秒值；iou 是將 intersectionMs/unionMs 約成最簡分數後的 {numerator,denominator}。IoU 為零時表示為 0/1。

成功 Result v1：

    {
      schemaVersion: 1,
      jobId: "job-1",
      status: "ready",
      mainCueCount: 1,
      secondaryCueCount: 1,
      matches: [{
        mainCueIndex: 0,
        secondaryCueIndex: 0,
        intersectionMs: 1500,
        unionMs: 2000,
        iou: { numerator: 3, denominator: 4 },
        kind: "automatic"
      }],
      ambiguous: [],
      unmatchedMain: [],
      unmatchedSecondary: [],
      keptSeparateMain: [],
      keptSeparateSecondary: [],
      outputCues: [{
        startMs: 0,
        endMs: 2000,
        lines: ["A", "B"],
        origin: { mainCueIndex: 0, secondaryCueIndex: 0 }
      }]
    }

matches[].kind 固定為 automatic、manual 或 manual-override。ambiguous item 是 {mainCueIndex,secondaryCueIndex,intersectionMs,unionMs,iou:{numerator,denominator},reasons:["main-tie"|"secondary-tie"|"non-mutual"]}。每條尚未解決的 eligible edge 恰列一次。status="review" 表示 ambiguous 非空，outputCues=[] 且下載停用。unmatchedMain/Secondary 是目前 residual graph 中沒有 eligible edge 的 cues；keptSeparateMain/Secondary 是使用者明確選為獨立輸出的 cues，永遠不再配對。使用者可對含 ambiguous edge 的 connected candidate component 中任一 cue（包括顯示在歧義候選旁的 automatic-match endpoint）配一個候選或明確選擇保留分開。既有 manual/manual-override matches 與 kept-separate 決策是固定結果；只對其餘所有 cues 的 full residual graph 重算 mutual unique best。選擇已被 automatic match 占用的候選或把 automatic match cue 保留分開時，先顯示取代確認；確認後只移除衝突的 automatic match，釋出的另一 cue 回到 residual graph 並重算。確認取消時 Result 完全不變。全部歧義解決才 status="ready"、ambiguous=[] 並生成 outputCues：matches 每項一個雙行 cue、unmatched 與 keptSeparate cues 各自成單行 cue；任何來源 cue 均恰出現一次，除非使用者另行明確排除並確認。錯誤 Result 為 {schemaVersion:1,jobId,status:"error",error:{code,fileIndex,offset,messageKey},matches:[],ambiguous:[],unmatchedMain:[],unmatchedSecondary:[],keptSeparateMain:[],keptSeparateSecondary:[],outputCues:[]}。固定 errors：NO_FILES、TOO_MANY_FILES、FILE_TOO_LARGE、INVALID_ENCODING、INVALID_SRT、INVALID_TIMECODE、INVALID_CUE_ORDER、CANDIDATE_LIMIT、CANCELED、MATCH_CONFLICT、BUILD_FAILED。候選邊數超限時 fileIndex/offset 為 null，messageKey 提示縮短字幕片段後重試；全批不輸出 partial matches、preview 或 SRT。任何輸入 parse 失敗都不輸出 partial SRT。

## 功能需求

**FR-01 載入兩檔。** 選取兩份 SRT，初始第一檔為 main、第二檔 secondary；可交換主副。各檔最多1,048,576 bytes、3000 cues，總輸入至多2,097,152 bytes。若只選一檔，不開始配對。上限精確接受，超出拒絕整檔。

**FR-02 SRT profile。** 只接受 UTF-8，可有一個 BOM；fatal decode。可接受 CRLF、LF、CR。每 cue 為正整數序號、下一行精確時間行 start --> end、至少一行不為空的文字、其後空白分隔。Cue number 必須從1連續遞增。Timestamp 小時為2至8位十進數、分鐘/秒各00–59、毫秒三位；時間轉整數毫秒。startMs<endMs。拒絕額外 settings、非標準時間、小數位數錯、文字缺失和 malformed block。所有 cue text 都是不可信純文字，UI 永不當 HTML。

**FR-03 重疊計算。** 區間是半開 [startMs,endMs)。intersection=max(0,min(endA,endB)-max(startA,startB))；union=durationA+durationB-intersection；IoU=intersection/union。閾值固定 0.5，當且僅當 intersection×2 >= union 為 eligible。用 BigInt 交叉相乘比較 ratio，禁止浮點作配對決策。整批 eligible edge 上限 50,000；第 50,001 條 edge 觸發 CANDIDATE_LIMIT，立即停止建構並回傳零部分結果，提示縮短字幕片段後重試。

**FR-04 自動配對與歧義。** 建立所有 eligible edges。每個尚未被固定決策消耗的 main 和 secondary cue 各自找 IoU 唯一最高對象；相同最高分是 tie unresolved。僅在一對 cues 互相選為唯一最高時自動配對。自動配對後仍有 eligible edge 的未配對 cues 列 ambiguous，包含指向已自動配對對象的 non-mutual 提案；不能以遍歷順序自動選。若兩個 main 競爭同一 secondary 且 IoU 不同，較高者可成互為唯一最佳而自動配對，較低者留 ambiguous；若 IoU 相等造成 equal-best，該競爭邊不自動配對，列人工決定。ambiguous reasons 按 main-tie、secondary-tie、non-mutual 固定順序標記。使用者可對含 ambiguous edge 的 connected candidate component 中任一 cue（包括歧義候選旁的 automatic-match endpoint）選候選配對或「保留為分開字幕」；分開選擇將該 cue 固定為獨立輸出，不會靜默排除。配對候選若碰到 automatic match，或把 automatic match cue 保留分開，先請使用者確認取代；取消不變，確認後釋出原配對另一 cue 至 residual graph。manual pair 與 keep-separate 是固定決策，不會被後續重算覆蓋。每次確認後在排除固定決策的 full residual graph 重算自動配對、歧義和 unmatched，直到無 ambiguous；候選列表按精確 IoU 降序、再按對方 sourceIndex 排序。未決圖中無 eligible edge 才是 unmatched。不得把同一 cue 配多次。

**FR-05 手動配對。** 使用者可在未決 cues 間手動建立一對一配對，或對未固定手動配對的 cue 明確選「保留為分開字幕」；此操作也可從 ready 狀態的 automatic-match row 執行。eligible pair 標記 kind=manual；低於0.5也可明確 override，需顯示精確 IoU 並二次確認，確認後標記 kind=manual-override。若選擇的 cue 目前已有 automatic match，確認需列出將被取代的自動配對及其被釋出 cue；取消維持相同 Result，確認後建立 manual/manual-override match 或固定 keep-separate 決策，並對 residual graph 重算。已確認手動配對和保留分開選擇固定，不會被重算取代。對話框等待或取消不得改動 Result；只在確認後原子套用決策。解除手動配對後回到 residual graph 並重算。未處理 ambiguous 時不產生 SRT；不可覆寫 cue text 或時間。

**FR-06 未配對保留。** 未決圖無候選的 unmatched main 輸出 main-only；unmatched secondary 輸出為副語言獨立 cue。使用者明確選「保留分開」的 main/secondary 也各自輸出獨立 cue，並列於 keptSeparateMain/Secondary，不算排除。兩種保留狀態在預覽中明確標示；任何排除都必須逐項操作並確認。不得靜默捨棄 cue。

**FR-07 輸出時間與排序。** matched cue 用 main start/end；文字行先放 main textLines，再放 secondary textLines。Unmatched main 使用自己的時間/文字；unmatched secondary append cue 使用自己的時間/文字。最後輸出以 startMs 升冪排序；相同 startMs 時 main-origin 優先，再按主/副原始 sourceIndex 穩定排序。輸出 SRT cue number 重新由1連續編號，timestamp 格式 HH:MM:SS,mmm（hours 至少兩位，超過兩位不截斷）；每 cue 空行分隔。

**FR-08 進度、取消與 stale cleanup。** Parsing、pairing、輸出分成明確階段；取消、重選、swap main/secondary、重新開始或 pagehide 會終止舊 job，epoch 遞增，清除暫存。Stale worker event 不改 UI、不下載。配對確認對話框的取消只清除 pending decision，既有 Result 逐欄不變；確認時一次提交並重算。結果不設自動時間期限；待頁期間可反覆下載。

**FR-09 雙語頁面導覽。** /index.html 與 /en/index.html 為獨立靜態頁，語言 anchor 導頁。未下載的字幕工作會遺失，旁邊明示；不得 storage/query/hash/跨頁保存。

## Oracle 範例

main cue [0,2000] 文本 A；secondary cue [500,2000] 文本 B。intersection=1500、union=2000、IoU=3/4，符合唯一 mutual best；輸出 cue [0,2000]、兩行 A 然後 B。候選比較最多保留 50,000 edges；更多時 CANDIDATE_LIMIT 不回 partial result。更完整情境見 ACCEPTANCE.md。
