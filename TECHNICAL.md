# 技術契約：雙語字幕合併

## 執行環境與樹

Node.js 24、ESM、零 dependencies，不 npm install。Candidate /index.html、/en/index.html；M1 noindex,nofollow,noarchive。Node dev server 僅綁 127.0.0.1:4230（4180+50），只 serve public/。無 network、upload、remote fonts、telemetry、storage、ASR、translation service、media conversion。自動 tests 用 synthetic cues。

    package.json
    .gitignore
    public/index.html
    public/en/index.html
    public/css/app.css
    public/js/app.js
    public/js/ui.js
    public/js/merge-worker.js
    public/js/core/decode.js
    public/js/core/parse-srt.js
    public/js/core/iou.js
    public/js/core/match.js
    public/js/core/merge.js
    public/js/core/serialize-srt.js
    scripts/serve.mjs
    scripts/check.mjs
    scripts/build.mjs
    test/parse-srt.test.mjs
    test/iou.test.mjs
    test/match.test.mjs
    test/merge.test.mjs
    test/worker-state.test.mjs

## Parser contract

parseSrt(bytes:ArrayBuffer) returns {ok:true,cues} or {ok:false,error:{code,offset}}. Check byteLength<=1,048,576 before decode. Strip only one UTF-8 BOM; fatal UTF-8 TextDecoder. Normalize CRLF and lone CR to LF. Ignore trailing empty lines. Every non-empty block requires exact sequential decimal cue number starting at1, timestamp line, one or more nonblank text lines. No cue settings or position tags accepted. Empty file/cue text invalid. Time regex hours [0-9]{2,8}, minutes and seconds [0-5][0-9], comma plus exactly3 digits. Compute hours*3,600,000 + minutes*60,000 + seconds*1,000 + milliseconds; ensure Number.isSafeInteger and end>start. Preserve source cue order and text lines byte-decoded as Unicode strings. Parse error means zero cues leave parser.

## Exact IoU and matching API

    intersectionMs(a,b): safe integer
    unionMs(a,b): safe integer > 0
    eligible(a,b): BigInt(intersectionMs)*2n >= BigInt(unionMs)
    normalizeRatio(numerator:number,denominator:number): {numerator:number,denominator:number} // gcd-reduced; 0 becomes 0/1
    compareRatio(a:{numerator:number,denominator:number},b:{numerator:number,denominator:number}): -1|0|1 using BigInt cross-products
    type AmbiguousCandidate = {
      mainCueIndex:number,
      secondaryCueIndex:number,
      intersectionMs:number,
      unionMs:number,
      iou:{numerator:number,denominator:number},
      reasons:Array<"main-tie"|"secondary-tie"|"non-mutual">
    }
    type Match = {mainCueIndex:number,secondaryCueIndex:number,intersectionMs:number,unionMs:number,iou:{numerator:number,denominator:number},kind:"automatic"|"manual"|"manual-override"}
    type OutputCue = {startMs:number,endMs:number,lines:string[],origin:{mainCueIndex:number|null,secondaryCueIndex:number|null}}
    type Decision = {type:"pair",mainCueIndex:number,secondaryCueIndex:number}|{type:"keep-separate",side:"main"|"secondary",cueIndex:number}
    type Analysis = {
      schemaVersion:1, jobId:string, status:"review"|"ready",
      mainCueCount:number, secondaryCueCount:number,
      matches:Match[],
      ambiguous:AmbiguousCandidate[],
      unmatchedMain:number[], unmatchedSecondary:number[],
      keptSeparateMain:number[], keptSeparateSecondary:number[],
      outputCues:OutputCue[]
    }
    type ErrorResult = {
      schemaVersion:1, jobId:string, status:"error",
      error:{code:string,fileIndex:number|null,offset:number|null,messageKey:string},
      matches:[], ambiguous:[], unmatchedMain:[], unmatchedSecondary:[],
      keptSeparateMain:[], keptSeparateSecondary:[], outputCues:[]
    }
    type PendingDecision = {
      jobId:string, decision:Decision,
      reasons:Array<"replace-automatic-match"|"below-threshold">,
      replacedAutomaticMatches:Match[], releasedMain:number[], releasedSecondary:number[],
      exactIou?:{numerator:number,denominator:number}
    }
    matchCues(main,secondary): Analysis
    resolveDecision(analysis,decision:Decision): {kind:"applied",analysis:Analysis}|{kind:"confirmation-required",pending:PendingDecision,analysis:Analysis}
    confirmDecision(analysis,pending:PendingDecision,accepted:boolean): Analysis

MAX_ELIGIBLE_EDGES = 50_000 for the complete two-file job.

Input intervals are half-open and valid start<end. Since durations can be up to the maximum timestamp, compute differences in safe integers; convert to BigInt before cross multiplication. normalizeRatio uses Euclid's algorithm on the nonnegative numerator and positive denominator, divides both by their greatest common divisor, and represents zero as 0/1. Do not use rounded floating IoU to rank or make equality decisions. UI percent is presentation only.

Matching and decision steps:
1. Iterate cue pairs in main sourceIndex then secondary sourceIndex order; generate eligible edges (IoU>=1/2) and retain raw intersectionMs/unionMs integers. In public Match/AmbiguousCandidate, expose iou as the gcd-reduced ratio; 0 is 0/1. Before retaining edge 50,001, abort the whole matching job with CANDIDATE_LIMIT, fileIndex=null, offset=null, messageKey=shorten-subtitles-and-retry; stop pair iteration and return no partial matches, ambiguous list, outputCues, preview, or downloadable Blob. Exactly 50,000 eligible edges is accepted. Check cancellation at least every 1,024 pair comparisons, including before the next pair.
2. Remove source cues already consumed by fixed manual/manual-override pairs or fixed kept-separate decisions. On the full remaining graph, each main and secondary cue finds its maximum ratio. Multiple equal maxima are ties; otherwise the unique max is its proposal.
3. Pair automatically only mutual unique max. Any remaining eligible edge is ambiguous, including a non-mutual proposal to a cue already in an automatic pair. For each edge add reason main-tie if its main has multiple equal-best edges, secondary-tie if its secondary has multiple equal-best edges, and non-mutual if endpoints did not mutually select this edge as unique best. Include all applicable reasons in fixed order main-tie, secondary-tie, non-mutual. Never resolve ambiguity by iteration order. If two main cues have different eligible IoU values to one secondary cue, the stronger unique mutual-best pair may be automatic and the lower non-mutual edge remains ambiguous. If both main cues have equal-best IoU to the same secondary cue, the secondary has a tie and neither competing edge auto-pairs. Ambiguous candidate lists sort ratio descending with exact compare, then opposing sourceIndex ascending.
4. A keep-separate decision may apply to any cue not already consumed by a fixed manual pair. It removes that cue from the residual graph, records its index in keptSeparateMain or keptSeparateSecondary, and fixes it as a standalone output cue. If it currently has an automatic match, require confirmation to remove that automatic pair; return the other endpoint to the residual graph. A cue with no eligible edges in the residual graph is unmatched and becomes a standalone output cue by default.
5. A pair decision may select an eligible ambiguous edge or two otherwise unmatched residual cues. If either endpoint is part of an automatic pair, resolveDecision returns confirmation-required with the exact automatic pair(s) that would be replaced and each released endpoint. If IoU is below 1/2, it also requires confirmation and includes the exact ratio. One confirmation lists both reasons when applicable. An eligible confirmed pair has kind=manual; a below-threshold confirmed pair has kind=manual-override. Until confirmDecision(...,true), analysis is unchanged. confirmDecision(...,false) clears only the pending proposal and returns the exact previous analysis. On acceptance, atomically remove only conflicting automatic pair(s), add the chosen manual or manual-override match, and return released endpoints to the residual graph. All prior manual/manual-override matches and kept-separate cues are fixed decisions and never reconsidered or overwritten. Recompute mutual unique max on the full residual graph after excluding fixed decisions; every released cue remains eligible for reclassification as automatic, ambiguous or unmatched. Manual pairing is one-to-one.
6. After every accepted decision, rebuild automatic matches, ambiguous edges and unmatched arrays from the full residual graph. In review status outputCues is empty and download disabled. Once no ambiguous edges remain, create outputCues per PRODUCT.md from automatic/manual matches, unmatched cues and kept-separate cues; preserve every source cue exactly once unless a separate explicit exclusion is confirmed.

## SRT serialization

serializeSrt(outputCues) orders as specified, assigns numbers 1..N, formats integer milliseconds as hours (minimum 2 digits), two digit minutes/seconds, three digit comma milliseconds. No rounding. For matching, main cue start/end defines interval; unmatched cue preserves its own. Text is opaque line text; UI uses textContent, never HTML parsing. SRT styling-looking strings remain source text and are not interpreted by this app. Writer joins cue lines with LF and one blank line between blocks, adds final LF if non-empty. Encode UTF-8 without BOM.

Output file name bilingual-subtitles.srt. No network or storage. Always include unmatched main and secondary cues in output; if user explicitly excludes any, show count and confirm before download. Output archive/result available until reset/source change/new job/pagehide; no auto-expiry timer.

## Worker and job cleanup

State: empty -> selected -> parsing -> matching -> review -> ready; tasks can transition to cancelling -> selected; parse error -> error with zero result; reset/source change/pagehide -> empty or selected. Only one pending decision dialog may exist; while it is open, other matching decisions are disabled. Starting/resetting a job invalidates it by jobId/epoch. A manual decision may enter awaiting-confirmation; acceptance applies atomically, cancellation restores the exact prior analysis, and any stale confirmation is ignored. merge-worker receives {type:"run",jobId,mainBytes,secondaryBytes}; sends progress stage/file; success returns full ResultV1; error returns code and offset. Cancel by terminate worker, increment epoch, clear byte buffers. Stale events are ignored. Swapping tracks is a new job and clears all previous automatic/manual matches and kept-separate decisions. Download URLs are created on explicit button, revoked on source change/reset/pagehide. No timed expiry.

## References and scripts

SRT has no single authoritative normative specification. The Library of Congress Sustainability of Digital Formats description records the common numbered cue/timecode/text-block profile and UTF encodings: [SubRip Subtitle format description](https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml). This candidate intentionally defines the stricter UTF-8 profile above; it does not claim universal SRT support.

package scripts dev=node scripts/serve.mjs, test=node --test, check=node scripts/check.mjs, build=node scripts/build.mjs. Build copies public/ to dist/. Check verifies noindex/no remote resource/storage and syntax/invariants; static checks are not security proof.
