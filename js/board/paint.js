/* Painting the grid, the whole-day tool, place modes, and saving my changes in as few writes as possible */
import { $, EMPTY, FULLN, pad, sleep, toast, withJ } from '../util.js';
import { S, PEOPLE, TOOLV, inRange, isBase, modeOf, storedDays, layerStr, paintLayer, baseStr, dayKeys, canPaintHere, colsNow } from './state.js';
import { renderAll, renderSave, updateCells, refreshInfo, infoHtml } from './view.js';

/* ---------- saving ---------- */
export function setSave(s) {
  S.saveState = s;
  if (s === 'saved') { const n = new Date(); S.saveAt = pad(n.getHours()) + ':' + pad(n.getMinutes()); }
  renderSave();
}
const into = (o, k) => o[k] || (o[k] = {});
function queueWrite(L, ch) { Object.assign(into(S.pendingW, L), ch); flush(); }
/* show a change at once and save it; L is the layer ('' = base place) */
function setMine(L, ch) { Object.assign(into(S.committed, L), ch); queueWrite(L, ch); }

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
  /* everything waiting goes out as one merge into my document: days, at.<place> and pl */
  const data = {}, sent = {};
  Object.keys(S.pendingW).forEach((L) => {
    const m = S.pendingW[L]; delete S.pendingW[L];
    if (!Object.keys(m).length) return;
    sent[L] = m;
    if (L) into(data, 'at')[L] = m; else data.days = m;
  });
  const pls = Object.assign({}, S.pendingPl);
  Object.keys(pls).forEach((pl) => { delete S.pendingPl[pl]; });
  if (Object.keys(pls).length) data.pl = pls;
  if (!Object.keys(data).length) return;
  /* recreate my document if someone emptied my seat */
  if (!S.people.has(S.me)) Object.assign(data, { name: S.myName, joinedAt: Date.now(), days: data.days || {} });
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
  Object.keys(sent).forEach((L) => Object.keys(sent[L]).forEach((k) => {
    const c = S.committed[L];
    if (c && c[k] === sent[L][k] && !(S.pendingW[L] && k in S.pendingW[L])) delete c[k];
  }));
  Object.keys(pls).forEach((pl) => { if (S.plOv[pl] === pls[pl] && !(pl in S.pendingPl)) delete S.plOv[pl]; });
  S.writing = false;
  if (ok) setSave('saved');
  renderAll();
  if (Object.keys(S.pendingW).length || Object.keys(S.pendingPl).length) flush();
}

/* ---------- place modes ---------- */
export function setMode(pl, m) {
  const was = modeOf(S.me, pl);
  if (!S.me || isBase(pl) || was === m) return;
  const P = withJ(pl, '은', '는');
  let ch = null;
  if (m === 'own' && was === 'same') {
    /* keep what was on screen: an empty layer starts as a copy of the base, one painted before comes back as it was */
    const own = Object.assign({}, storedDays(S.me, pl), S.committed[pl] || {});
    if (Object.values(own).some((s) => typeof s === 'string' && s.length === 24 && s !== EMPTY)) toast(pl + '에 따로 칠해 두었던 시간을 다시 불러왔어요.');
    else {
      ch = {};
      dayKeys(S.me, S.PLACES[0]).forEach((k) => { const s = layerStr(S.me, k, S.PLACES[0]); if (s !== EMPTY) ch[k] = s; });
      toast(P + ' 따로 칠해요. ' + S.PLACES[0] + '에 칠한 시간을 옮겨 두었으니 다른 부분만 고치세요.');
    }
  } else if (m === 'own') toast(P + ' 따로 칠해요.');
  S.plOv[pl] = m; S.pendingPl[pl] = m;
  if (ch && Object.keys(ch).length) { Object.assign(into(S.committed, pl), ch); Object.assign(into(S.pendingW, pl), ch); }
  S.preview = null; S.confirmClearX = false;
  flush();
}
/* painting a place that reuses the base (or isn't decided yet) gives it its own layer first */
export function ensureOwn() {
  const m = modeOf(S.me);
  if (m === 'base' || m === 'own') return true;
  if (m === 'no') return false;
  setMode(S.place, 'own');
  return true;
}
/* "장소 무관": every other place follows the base */
export function anywhere() {
  if (!S.me) return;
  let n = 0;
  S.PLACES.slice(1).forEach((pl) => { if (modeOf(S.me, pl) !== 'same') { S.plOv[pl] = 'same'; S.pendingPl[pl] = 'same'; n++; } });
  if (n) { flush(); toast('모든 장소를 ' + withJ(S.PLACES[0], '과', '와') + ' 같게 했어요.'); }
}

/* ---------- painting ---------- */
function buildPreview() {
  const d = S.drag;
  const c0 = Math.min(d.a.c, d.b.c), c1 = Math.max(d.a.c, d.b.c);
  const h0 = Math.min(d.a.h, d.b.h), h1 = Math.max(d.a.h, d.b.h);
  S.preview = {};
  for (let c = c0; c <= c1; c++) {
    const k = d.cols[c];
    if (!k || !inRange(k)) continue;
    if (d.whole) { S.preview[k] = d.val; continue; }
    const s = baseStr(k).split('');
    for (let h = h0; h <= h1; h++) s[h] = d.val;
    S.preview[k] = s.join('');
  }
}
function commit() {
  const ch = {}, L = paintLayer();
  if (S.preview && L != null) for (const k in S.preview) if (S.preview[k] !== baseStr(k)) ch[k] = S.preview[k];
  S.drag = null; S.preview = null;
  if (Object.keys(ch).length) setMine(L, ch);
  renderAll();
}
/* my crossed-out days at this place, including ones not saved yet */
function myXDays() {
  if (paintLayer() == null) return [];
  return dayKeys(S.me).filter((k) => inRange(k) && baseStr(k) === FULLN).sort();
}
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
  if (days.length) { setMine(paintLayer(), ch); toast('종일 불가 ' + days.length + '일을 모두 풀었어요.'); }
  renderAll();
}
export function toggleDay(k) {
  if (!inRange(k) || !ensureOwn()) return;
  setMine(paintLayer(), { [k]: baseStr(k) === FULLN ? EMPTY : FULLN });
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
    if (S.tool === 'look' || !canPaintHere()) { updateCells(); refreshInfo(); return; }
    e.preventDefault();
    try { gw.setPointerCapture(e.pointerId); } catch (err) {}
    /* "종일 불가" drags across days and ignores the hours; it toggles off when it starts on a day already crossed out */
    const whole = S.tool === 'xday';
    /* the drag exists before ensureOwn so the redraw its save triggers keeps the layout still */
    S.drag = { id: e.pointerId, a: { c, h }, b: { c, h }, val: '.', whole, cols: colsNow() };
    ensureOwn();
    if (whole) S.drag.val = baseStr(k) === FULLN ? EMPTY : FULLN;
    else { const v = TOOLV[S.tool]; S.drag.val = v !== '.' && baseStr(k)[h] === v ? '.' : v; }
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
