/* Painting the grid with place brushes, the whole-day tool, and saving my changes in as few writes as possible */
import { $, EMPTY, FULLN, pad, sleep, toast } from '../util.js';
import { S, PEOPLE, ALL, maskOf, maskChar, inRange, baseStr, dayKeys, storedSlots, canPaint, colsNow } from './state.js';
import { renderAll, renderSave, updateCells, refreshInfo, infoHtml } from './view.js';

/* ---------- saving ---------- */
export function setSave(s) {
  S.saveState = s;
  if (s === 'saved') { const n = new Date(); S.saveAt = pad(n.getHours()) + ':' + pad(n.getMinutes()); }
  renderSave();
}
/* show a change at once and save it */
function setMine(ch) { Object.assign(S.committed, ch); Object.assign(S.pendingW, ch); flush(); }

function handleWriteErr(e) {
  const code = e && e.code;
  if (code === 'invalid_argument' || code === 'not_granted') { S.readonly = true; toast('저장이 거부됐어요. 최신 firestore.rules를 Firebase 콘솔에 게시했는지 확인하세요.'); }
  else if (code === 'quota_exceeded') toast('오늘 쓸 수 있는 Firebase 무료 사용량을 다 썼어요. 한국 시간 오후 4~5시쯤 초기화되면 다시 칠해 주세요.');
  else if (code === 'revoked') { S.dbState = 'off'; toast('이 페이지의 저장소 접근이 끊겼어요.'); }
  else toast('저장하지 못했어요. 잠시 후 다시 칠해 주세요.');
  S.saveState = 'error';
}
export async function flush() {
  if (S.writing || !S.DB || !S.me) return;
  const ch = Object.assign({}, S.pendingW);
  Object.keys(ch).forEach((k) => { delete S.pendingW[k]; });
  if (!Object.keys(ch).length) return;
  const p = S.people.get(S.me);
  /* the first save on the new sheet carries everything converted from the old one */
  const data = { slots: p && !p.slots ? Object.assign({}, storedSlots(S.me), ch) : ch };
  /* recreate my document if someone emptied my seat */
  if (!p) Object.assign(data, { name: S.myName, joinedAt: Date.now(), days: {} });
  S.writing = true; setSave('saving');
  const ref = S.DB.collection(PEOPLE).doc(S.me);
  let ok = false;
  try { await ref.merge(data); ok = true; }
  catch (e) {
    if (e && e.code === 'unavailable') {
      await sleep(400 + Math.random() * 700);
      try { await ref.merge(data); ok = true; } catch (e2) { handleWriteErr(e2); }
    } else handleWriteErr(e);
  }
  Object.keys(ch).forEach((k) => { if (S.committed[k] === ch[k] && !(k in S.pendingW)) delete S.committed[k]; });
  S.writing = false;
  if (ok) setSave('saved');
  renderAll();
  if (Object.keys(S.pendingW).length) flush();
}

/* ---------- painting ----------
   A place brush adds its place to the hours dragged over, or takes it away when the drag starts on an hour that
   already has it; places stack, so one hour can be 서울·대전. "어디든" does every place at once, "불가" marks
   hours that work nowhere, "지우기" clears. */
function brushOp(tool, c0) {
  const m = tool.match(/^pl(\d)$/);
  if (m) { const bit = 1 << +m[1]; return { bit, add: !(maskOf(c0) & bit) }; }
  if (tool === 'any') return { bit: ALL(), add: maskOf(c0) !== ALL() };
  if (tool === 'no') return { set: c0 === 'n' ? '.' : 'n' };
  return { set: '.' };
}
function applyOp(c, op) {
  if (op.set) return op.set;
  if (op.add) return maskChar(maskOf(c) | op.bit);
  /* taking a place away leaves "불가" and empty hours alone */
  return maskOf(c) ? maskChar(maskOf(c) & ~op.bit) : c;
}
function buildPreview() {
  const d = S.drag;
  const c0 = Math.min(d.a.c, d.b.c), c1 = Math.max(d.a.c, d.b.c);
  const h0 = Math.min(d.a.h, d.b.h), h1 = Math.max(d.a.h, d.b.h);
  S.preview = {};
  for (let c = c0; c <= c1; c++) {
    const k = d.cols[c];
    if (!k || !inRange(k)) continue;
    if (d.whole) { S.preview[k] = d.whole; continue; }
    const s = baseStr(k).split('');
    for (let h = h0; h <= h1; h++) s[h] = applyOp(s[h], d.op);
    S.preview[k] = s.join('');
  }
}
function commit() {
  const ch = {};
  if (S.preview) for (const k in S.preview) if (S.preview[k] !== baseStr(k)) ch[k] = S.preview[k];
  S.drag = null; S.preview = null;
  if (Object.keys(ch).length) setMine(ch);
  renderAll();
}
/* my crossed-out days, including ones not saved yet */
function myXDays() { return dayKeys(S.me).filter((k) => inRange(k) && baseStr(k) === FULLN).sort(); }
export function clearXHtml() {
  const n = myXDays().length;
  if (!n) { S.confirmClearX = false; return ''; }
  return S.confirmClearX
    ? '<span class="confirm"><span>종일 불가 ' + n + '일을 모두 풀까요?</span><button type="button" class="mini danger" data-act="clear-x-yes">모두 풀기</button><button type="button" class="mini" data-act="clear-x-no">취소</button></span>'
    : '<button type="button" class="mini" data-act="clear-x">✕ 모두 풀기 (' + n + '일)</button>';
}
export function clearAllX() {
  S.confirmClearX = false;
  const ch = {}, days = myXDays();
  days.forEach((k) => { ch[k] = EMPTY; });
  if (days.length) { setMine(ch); toast('종일 불가 ' + days.length + '일을 모두 풀었어요.'); }
  renderAll();
}
export function toggleDay(k) {
  if (!inRange(k)) return;
  setMine({ [k]: baseStr(k) === FULLN ? EMPTY : FULLN });
  renderAll();
}

const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); const c = el && el.closest ? el.closest('#gw .c') : null; return c && !c.classList.contains('off') ? c : null; };

export function bindGrid() {
  const gw = $('#gw');
  gw.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    const cell = e.target.closest('.c');
    if (!cell || cell.classList.contains('off')) return;
    const k = cell.dataset.k, h = +cell.dataset.h, c = +cell.dataset.c;
    S.focus = { k, h };
    if (S.tool === 'look' || !canPaint()) { updateCells(); refreshInfo(); return; }
    e.preventDefault();
    try { gw.setPointerCapture(e.pointerId); } catch (err) {}
    /* "종일 불가" drags across days and ignores the hours; it toggles off when it starts on a day already crossed out */
    const whole = S.tool === 'xday' ? (baseStr(k) === FULLN ? EMPTY : FULLN) : '';
    S.drag = { id: e.pointerId, a: { c, h }, b: { c, h }, whole, op: whole ? null : brushOp(S.tool, baseStr(k)[h]), cols: colsNow() };
    buildPreview(); updateCells(); refreshInfo();
  });
  gw.addEventListener('pointermove', (e) => {
    if (!S.drag) {
      if (e.pointerType === 'mouse') {
        const cell = e.target.closest('.c');
        if (cell && !cell.classList.contains('off')) $('#info').innerHTML = infoHtml(cell.dataset.k, +cell.dataset.h);
      }
      return;
    }
    if (e.pointerId !== S.drag.id) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const c = +cell.dataset.c, h = +cell.dataset.h;
    if (c === S.drag.b.c && h === S.drag.b.h) return;
    S.drag.b = { c, h }; S.focus = { k: cell.dataset.k, h };
    buildPreview(); updateCells(); refreshInfo();
  });
  gw.addEventListener('pointerup', (e) => { if (S.drag && e.pointerId === S.drag.id) commit(); });
  gw.addEventListener('pointercancel', (e) => { if (S.drag && e.pointerId === S.drag.id) { S.drag = null; S.preview = null; updateCells(); } });
  gw.addEventListener('pointerleave', (e) => { if (!S.drag && e.pointerType === 'mouse') refreshInfo(); });
}
