# 雙語字幕合併 — 實作者起點
這是核准規格，尚未實作。先讀 [AGENTS](AGENTS.md)、[PRODUCT](PRODUCT.md)、[TECHNICAL](TECHNICAL.md)、[UX-SEO](UX-SEO.md)、[ACCEPTANCE](ACCEPTANCE.md)、[TASKS](TASKS.md)，再依序做 M1。
主代理擁有規格決策、獨立驗收、共用首頁與部署；此原功能對話負責產品實作、修正及獲放行後 GitHub 公開來源。不可默默縮減必要需求或改其他工具。使用者要求具體工作結果，不能以範例 UI 代替實際產物。
M1：可操作雙語本地候選，Node 核心/工具鏈測試及 check/build 通過。所有無法安全執行的瀏覽器與原生檢查單獨 NOT_RUN，不代表完整產品驗收通過。必須交主代理讀實際 diff 和獨立重驗。
M2：主代理補完必要瀏覽器驗收後，另行放行此原對話公開 GitHub。M3：由主代理部署與首頁/看板整合。M4：外部覆核修正，由原對話處理。未獲下一階段指令前不自行跳階段，不輪詢等待。
對話配置要求 gpt-6.1-sol/max；派送參數可記錄，實際 backend 未獨立確認不可自稱已證實。
