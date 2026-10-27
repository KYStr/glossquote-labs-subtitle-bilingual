import { formatTimestamp } from './core/serialize-srt.js';
import { copy } from './i18n.js';

const $ = id => document.getElementById(id);
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const ratio = value => `${value.numerator}/${value.denominator}`;
const interval = cue => `${formatTimestamp(cue.startMs)} → ${formatTimestamp(cue.endMs)}`;
const PAGE_SIZE = 12;

export function createUI(controller) {
  const t = copy[document.documentElement.lang] ?? copy['zh-Hant'];
  const pages = { main: 0, secondary: 0, output: 0 };
  let current;
  let confirmationId = null;
  let returnFocusId = null;
  let previousFocusId = null;
  function button(text, action, id) {
    const node = element('button', text);
    node.type = 'button';
    if (id) node.id = id;
    node.disabled = Boolean(current.pending || current.commandBusy);
    node.addEventListener('click', action);
    return node;
  }
  function cueLabel(side, index) { return `${t[side]} · ${t.ordinal(index + 1)}`; }
  function cueText(side, index) {
    const cue = current.sources[side][index];
    return `${cueLabel(side, index)}\n${interval(cue)}\n${cue.textLines.join('\n')}`;
  }
  function pager(container, side, total, draw) {
    const max = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
    pages[side] = Math.min(pages[side], max);
    const page = element('nav', undefined, 'pager');
    page.setAttribute('aria-label', side === 'output' ? $('preview-title').textContent : t[side]);
    const previous = button(t.previous, () => { pages[side]--; draw(); });
    const next = button(t.next, () => { pages[side]++; draw(); });
    previous.disabled ||= pages[side] === 0;
    next.disabled ||= pages[side] === max;
    page.append(previous, element('span', t.showRange(total ? pages[side] * PAGE_SIZE + 1 : 0,
      Math.min(total, (pages[side] + 1) * PAGE_SIZE), total)), next);
    container.append(page);
  }
  function drawSide(side) {
    const container = $(`${side}-cues`);
    container.replaceChildren();
    const source = current.sources[side];
    pages[side] = Math.min(pages[side], Math.max(0, Math.ceil(source.length / PAGE_SIZE) - 1));
    const result = current.result;
    const pairByIndex = new Map(result.matches.map(pair => [pair[`${side}CueIndex`], pair]));
    const ambiguousByIndex = new Map();
    for (const edge of result.ambiguous) {
      const index = edge[`${side}CueIndex`];
      if (!ambiguousByIndex.has(index)) ambiguousByIndex.set(index, []);
      ambiguousByIndex.get(index).push(edge);
    }
    for (const cue of source.slice(pages[side] * PAGE_SIZE, (pages[side] + 1) * PAGE_SIZE)) {
      const index = cue.sourceIndex;
      const pair = pairByIndex.get(index);
      const edges = ambiguousByIndex.get(index) ?? [];
      const excluded = current.excluded[side].includes(index);
      const kept = result[side === 'main' ? 'keptSeparateMain' : 'keptSeparateSecondary'].includes(index);
      const fixed = pair && pair.kind !== 'automatic';
      const row = element('article', undefined, 'cue-row');
      row.append(element('h4', cueLabel(side, index)), element('p', interval(cue), 'time'),
        element('p', cue.textLines.join('\n'), 'cue-text'));
      const status = excluded ? t.excluded : kept ? t.kept : pair ? t[pair.kind] : edges.length ? t.ambiguous : t.unmatched;
      row.append(element('p', status, `cue-state ${edges.length ? 'attention' : ''}`));
      if (pair) {
        const other = side === 'main' ? 'secondary' : 'main';
        const partnerIndex = pair[`${other}CueIndex`];
        row.append(element('p', `${t.matchPartner}: ${cueLabel(other, partnerIndex)} · ${t.exact} ${ratio(pair.iou)}`));
        row.append(element('p', current.sources[other][partnerIndex].textLines.join('\n'), 'partner-text'));
      }
      if (edges.length) {
        // Every unresolved edge remains inspectable, without flooding the main worksheet.
        const details = element('details');
        details.append(element('summary', `${t.ambiguous} (${edges.length})`));
        const list = element('ul', undefined, 'edge-list');
        const other = side === 'main' ? 'secondary' : 'main';
        for (const edge of edges) {
          const item = element('li', `${cueLabel(other, edge[`${other}CueIndex`])} · ${ratio(edge.iou)} · ${edge.reasons.map(reason => t[reason]).join(' / ')}`);
          list.append(item);
        }
        details.append(list); row.append(details);
      }
      const actions = element('div', undefined, 'row-actions');
      if (excluded) {
        actions.append(button(t.restore, () => controller.command({ type: 'restore-excluded', side, cueIndex: index }), `restore-${side}-${index}`));
      } else {
        if (fixed) actions.append(button(t.release, () => controller.command({ type: 'release-match',
          mainCueIndex: pair.mainCueIndex, secondaryCueIndex: pair.secondaryCueIndex }), `release-${side}-${index}`));
        else if (kept) actions.append(button(t.releaseKeep, () => controller.command({ type: 'release-separate', side, cueIndex: index }), `release-${side}-${index}`));
        else {
          actions.append(button(t.pair, () => controller.command({ type: 'candidates', side, cueIndex: index }), `pair-${side}-${index}`));
          actions.append(button(t.keep, () => controller.command({ type: 'decision', decision: { type: 'keep-separate', side, cueIndex: index } }), `keep-${side}-${index}`));
        }
        actions.append(button(t.exclude, () => controller.command({ type: 'exclude', side, cueIndex: index }), `exclude-${side}-${index}`));
      }
      row.append(actions); container.append(row);
    }
    pager(container, side, source.length, () => drawSide(side));
  }
  function drawPreview() {
    const container = $('preview'); container.replaceChildren();
    if (!current.result || current.result.status === 'error') { container.append(element('p', t.noOutput, 'empty-state')); return; }
    if (current.result.status === 'review') { container.append(element('p', t.reviewOutput, 'empty-state')); return; }
    const cues = current.result.outputCues;
    if (!cues.length) { container.append(element('p', t.noCues, 'empty-state')); return; }
    pages.output = Math.min(pages.output, Math.max(0, Math.ceil(cues.length / PAGE_SIZE) - 1));
    for (const [index, cue] of cues.slice(pages.output * PAGE_SIZE, (pages.output + 1) * PAGE_SIZE).entries()) {
      const row = element('article', undefined, 'output-cue');
      row.append(element('h3', `${pages.output * PAGE_SIZE + index + 1} · ${interval(cue)}`, 'time'));
      const hasMain = cue.origin.mainCueIndex !== null;
      const hasSecondary = cue.origin.secondaryCueIndex !== null;
      if (hasMain && hasSecondary) {
        const mainLines = current.sources.main[cue.origin.mainCueIndex].textLines.length;
        row.append(element('p', cue.lines.slice(0, mainLines).join('\n'), 'cue-text'),
          element('p', cue.lines.slice(mainLines).join('\n'), 'cue-text secondary-text'));
        row.append(element('p', `${cueLabel('main', cue.origin.mainCueIndex)} + ${cueLabel('secondary', cue.origin.secondaryCueIndex)}`, 'origin'));
      } else {
        const side = hasMain ? 'main' : 'secondary';
        const originIndex = cue.origin[`${side}CueIndex`];
        const kept = current.result[hasMain ? 'keptSeparateMain' : 'keptSeparateSecondary'].includes(originIndex);
        row.append(element('p', cue.lines.join('\n'), 'cue-text'), element('p', `${cueLabel(side, originIndex)} · ${kept ? t.kept : t.unmatched}`, 'origin'));
      }
      container.append(row);
    }
    pager(container, 'output', cues.length, drawPreview);
  }
  function drawCandidates() {
    const panel = $('candidate-panel');
    panel.hidden = !current.candidates;
    if (!current.candidates) return;
    const data = current.candidates;
    $('candidate-source').textContent = cueText(data.side, data.cueIndex);
    const select = $('candidate-select'); select.replaceChildren();
    for (const candidate of data.candidates) {
      const other = data.side === 'main' ? 'secondary' : 'main';
      const index = candidate[`${other}CueIndex`];
      const cue = current.sources[other][index];
      select.append(element('option', `${t.ordinal(index + 1)} · ${ratio(candidate.iou)} · ${interval(cue)} · ${cue.textLines.join(' ').slice(0, 64)}`));
    }
    $('candidate-help').textContent = data.candidates.length ? t.candidateHelp : t.noCandidates;
    function selected() {
      const candidate = data.candidates[select.selectedIndex];
      $('candidate-text').textContent = candidate ? cueText(data.side === 'main' ? 'secondary' : 'main', candidate[data.side === 'main' ? 'secondaryCueIndex' : 'mainCueIndex']) : '';
    }
    select.onchange = selected;
    select.disabled = Boolean(current.pending || current.commandBusy || !data.candidates.length);
    $('apply-pair').disabled = select.disabled;
    $('apply-pair').onclick = () => {
      const candidate = data.candidates[select.selectedIndex];
      if (candidate) controller.command({ type: 'decision', decision: { type: 'pair', mainCueIndex: candidate.mainCueIndex, secondaryCueIndex: candidate.secondaryCueIndex } });
    };
    selected();
  }
  function drawConfirmation() {
    const dialog = $('confirmation');
    if (!current.pending) {
      if (dialog.open) dialog.close();
      if (confirmationId !== null && returnFocusId) $(returnFocusId)?.focus();
      confirmationId = null; return;
    }
    $('confirm-yes').disabled = current.commandBusy;
    $('confirm-no').disabled = current.commandBusy;
    if (confirmationId === current.pending.decisionId) return;
    confirmationId = current.pending.decisionId;
    returnFocusId = previousFocusId;
    const pending = current.pending;
    const body = $('confirmation-body'); body.replaceChildren();
    const decision = pending.decision;
    body.append(element('p', decision.type === 'pair' ? t.decisionPair : decision.type === 'exclude' ? t.decisionExclude : t.decisionKeep));
    if (decision.type === 'pair') {
      body.append(element('p', cueText('main', decision.mainCueIndex), 'cue-text'),
        element('p', cueText('secondary', decision.secondaryCueIndex), 'cue-text'));
    } else body.append(element('p', cueText(decision.side, decision.cueIndex), 'cue-text'));
    if (pending.exactIou) body.append(element('p', `${t.exact}: ${ratio(pending.exactIou)}`, 'time'));
    if (pending.reasons.includes('below-threshold')) body.append(element('p', t.belowWarning, 'notice'));
    if (pending.reasons.includes('exclude-cue')) body.append(element('p', t.excludeWarning, 'notice'));
    if (pending.replacedAutomaticMatches.length) {
      body.append(element('p', t.replaceWarning));
      for (const pair of pending.replacedAutomaticMatches) {
        body.append(element('p', `${cueText('main', pair.mainCueIndex)}\n+\n${cueText('secondary', pair.secondaryCueIndex)}`, 'cue-text'));
      }
    }
    for (const side of ['main', 'secondary']) {
      const released = pending[side === 'main' ? 'releasedMain' : 'releasedSecondary'];
      if (released.length) {
        body.append(element('p', t[side === 'main' ? 'releasedMain' : 'releasedSecondary']));
        for (const index of released) body.append(element('p', cueText(side, index), 'cue-text'));
      }
    }
    body.append(element('p', t.unchanged));
    if (!dialog.open) dialog.showModal();
  }
  function render(state) {
    const priorCandidates = current?.candidates;
    const focusId = document.activeElement?.id;
    if (focusId && !['confirm-yes', 'confirm-no'].includes(focusId)) previousFocusId = focusId;
    current = state;
    const running = ['parsing', 'matching'].includes(state.phase);
    const excludedCount = state.excluded.main.length + state.excluded.secondary.length;
    $('start').disabled = running || !state.files.every(Boolean) || Boolean(state.pending) || state.commandBusy;
    $('cancel').disabled = !running;
    $('swap').disabled = running || !state.files.every(Boolean);
    $('download').disabled = state.phase !== 'ready' || !state.result?.outputCues.length || Boolean(state.pending) || state.commandBusy;
    $('download').classList.toggle('primary', !$('download').disabled);
    $('start').classList.toggle('primary', state.phase !== 'ready');
    $('workspace').setAttribute('aria-busy', String(running || state.commandBusy));
    $('status').textContent = state.commandBusy ? t.busy : running ? t[state.stage] :
      state.error?.code === 'CANCELED' ? t.canceled : t[`${state.phase}State`] ?? t[state.phase];
    $('job-error').textContent = state.error ? t.errors[state.error.code] ?? t.errors.BUILD_FAILED : '';
    for (const [index, side] of ['main', 'secondary'].entries()) {
      const file = state.files[index];
      const parsed = state.sources?.[side];
      $(`${side}-meta`).textContent = file ? `${file.name} · ${file.size.toLocaleString(document.documentElement.lang)} ${t.bytes} · ${parsed ? `${t.parsedFile}: ${parsed.length}` : running && state.fileIndex === index ? t.parsingFile : t.selected}` : t.emptyFile;
      const associated = state.error?.fileIndex === index;
      $(`${side}-error`).textContent = associated ? `${t.errors[state.error.code]}${state.error.offset !== null ? ` (${t.offset(state.error.offset)})` : ''}` : '';
      $(`${side}-file`).setAttribute('aria-invalid', String(associated));
    }
    $('summary').textContent = state.sources ? t.summary(state.result, excludedCount) : t.noReview;
    $('output-count').textContent = state.sources && state.phase === 'ready' ? t.outputCount(state.result.outputCues.length, excludedCount) : '';
    for (const side of ['main', 'secondary']) {
      if (state.sources) drawSide(side); else $(`${side}-cues`).replaceChildren();
    }
    drawPreview(); drawCandidates(); drawConfirmation();
    if (!state.pending && focusId && !['confirm-yes', 'confirm-no'].includes(focusId) && !$(focusId)?.disabled) $(focusId)?.focus();
    if (state.candidates && state.candidates !== priorCandidates && !state.commandBusy && !state.pending) $('candidate-select').focus();
  }
  $('start').addEventListener('click', () => controller.start());
  $('cancel').addEventListener('click', () => controller.cancel());
  $('clear').addEventListener('click', () => {
    $('main-file').value = ''; $('secondary-file').value = '';
    for (const key of Object.keys(pages)) pages[key] = 0;
    controller.clear();
  });
  $('swap').addEventListener('click', () => {
    $('main-file').value = ''; $('secondary-file').value = '';
    for (const key of Object.keys(pages)) pages[key] = 0;
    controller.swap();
  });
  for (const [index, side] of ['main', 'secondary'].entries()) {
    $(`${side}-file`).addEventListener('change', event => {
      const files = controller.getState().files;
      files[index] = event.target.files[0] ?? null;
      for (const key of Object.keys(pages)) pages[key] = 0;
      controller.setFiles(files);
    });
  }
  $('close-candidates').addEventListener('click', () => controller.closeCandidates());
  $('confirm-yes').addEventListener('click', () => controller.confirm(true));
  $('confirm-no').addEventListener('click', () => controller.confirm(false));
  $('confirmation').addEventListener('cancel', event => { event.preventDefault(); controller.confirm(false); });
  $('download').addEventListener('click', () => {
    const download = controller.download();
    if (!download) return;
    const anchor = element('a'); anchor.href = download.url; anchor.download = download.name;
    document.body.append(anchor); anchor.click(); anchor.remove();
    $('status').textContent = t.downloadDone;
  });
  return { render };
}
