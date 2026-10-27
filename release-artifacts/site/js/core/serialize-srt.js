export function formatTimestamp(ms) {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError('INVALID_TIMECODE');
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms % 3_600_000 / 60_000);
  const s = Math.floor(ms % 60_000 / 1_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1_000).padStart(3, '0')}`;
}

export function sortOutput(cues) {
  return [...cues].sort((a, b) => a.startMs - b.startMs ||
    Number(a.origin.mainCueIndex === null) - Number(b.origin.mainCueIndex === null) ||
    (a.origin.mainCueIndex ?? a.origin.secondaryCueIndex) - (b.origin.mainCueIndex ?? b.origin.secondaryCueIndex));
}

export function serializeSrt(outputCues) {
  if (!outputCues.length) return '';
  return sortOutput(outputCues).map((cue, index) => {
    if (cue.startMs >= cue.endMs || !cue.lines.length || cue.lines.some(line => typeof line !== 'string' || !line.trim() || /[\r\n]/.test(line))) {
      throw new RangeError('INVALID_SRT');
    }
    return `${index + 1}\n${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}\n${cue.lines.join('\n')}`;
  }).join('\n\n') + '\n';
}
