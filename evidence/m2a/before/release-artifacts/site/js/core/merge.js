import { sortOutput } from './serialize-srt.js';

export function buildOutput(main, secondary, matches, unmatchedMain, unmatchedSecondary, keptMain, keptSecondary) {
  const cues = matches.map(pair => ({
    startMs: main[pair.mainCueIndex].startMs,
    endMs: main[pair.mainCueIndex].endMs,
    lines: [...main[pair.mainCueIndex].textLines, ...secondary[pair.secondaryCueIndex].textLines],
    origin: { mainCueIndex: pair.mainCueIndex, secondaryCueIndex: pair.secondaryCueIndex }
  }));
  for (const index of [...unmatchedMain, ...keptMain]) {
    cues.push({ startMs: main[index].startMs, endMs: main[index].endMs, lines: [...main[index].textLines],
      origin: { mainCueIndex: index, secondaryCueIndex: null } });
  }
  for (const index of [...unmatchedSecondary, ...keptSecondary]) {
    cues.push({ startMs: secondary[index].startMs, endMs: secondary[index].endMs, lines: [...secondary[index].textLines],
      origin: { mainCueIndex: null, secondaryCueIndex: index } });
  }
  return sortOutput(cues);
}
