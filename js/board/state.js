/* Board state shared by the board modules, and everything derived from it (who can come, where, how many) */
import { PID, EMPTY, FULLN, store, valid, isDayKey, fromKey, addDays, ymd } from '../util.js';
import { DEFAULT_PLACES } from '../projects.js';

export const PEOPLE = 'projects/' + PID + '/people';
export const MEETS = 'projects/' + PID + '/meets';
export const K_ME = 'six.me.' + PID, K_NAME = 'six.name.' + PID, K_LENS = 'six.lens.' + PID;

export const S = {
  DB: null, dbState: 'connecting', readonly: false, joining: false, writing: false,
  /* period, seats and places come from the project document (see setProject) */
  proj: null, START_K: '', END_K: '', MAX: 6, MONTHS: [], PLACES: DEFAULT_PLACES.slice(),
  people: new Map(),
  me: store.get(K_ME), myName: store.get(K_NAME) || '',
  gateOpen: false, gateMsg: '',
  sel: '', monthIdx: 0,
  mode: store.get('six.mode') === 'day' ? 'day' : 'week',
  /* the brush; checked against the project's places in setProject, and 'look' until someone picks one */
  tool: store.get('six.tool') || 'look',
  /* 'mine' shows only my own marks so I can check what I painted */
  view: store.get('six.view') === 'mine' ? 'mine' : 'all',
  /* whose availability colours the board: -1 compares every place, otherwise one place's index */
  lens: -1,
  /* my changes not saved yet, per day */
  committed: {}, pendingW: {},
  preview: null, drag: null, focus: null,
  confirmDel: null, confirmClearX: false,
  saveState: '', saveAt: '', colorOf: {},
  admin: false, meets: [], meetsState: 'loading', confirmMeet: null, plEdit: false,
  /* the meetings section shows cards, or per person which meetings they attend */
  meetView: store.get('six.meetview') === 'people' ? 'people' : 'cards'
};

export const inRange = (k) => k >= S.START_K && k <= S.END_K;
export const weekStartK = (k) => { const d = fromKey(k); return ymd(addDays(d, -d.getDay())); };
export function monthOf(k) { const d = fromKey(k); const i = S.MONTHS.findIndex(([y, m]) => y === d.getFullYear() && m === d.getMonth()); return i < 0 ? 0 : i; }
export function colsNow() {
  if (S.mode === 'day') return [S.sel];
  const s = fromKey(weekStartK(S.sel));
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(s, i)));
}

export function sortedPeople() {
  return [...S.people.values()].sort((a, b) => (a.joinedAt - b.joinedAt) || a.name.localeCompare(b.name, 'ko'));
}
export function ids() {
  const arr = sortedPeople().map((p) => p.id);
  if (S.me && !S.people.has(S.me)) arr.push(S.me);
  return arr;
}
export function nameOf(id) { return (S.people.get(id) && S.people.get(id).name) || (id === S.me ? S.myName : '?'); }
export function idFor(name) {
  const b = new TextEncoder().encode(name.toLowerCase());
  let h = ''; b.forEach((x) => { h += x.toString(16).padStart(2, '0'); });
  return 'n-' + h;
}

/* ---------- marks ----------
   Each person keeps one sheet, `slots`: per day 24 characters, one per hour.
   '.' = nothing marked, 'n' = can't make it anywhere, a hex digit = the places that work (bit i = PLACES[i]). */
export const ALL = () => (1 << S.PLACES.length) - 1;
export const maskOf = (c) => /^[0-9a-f]$/.test(c) ? parseInt(c, 16) & ALL() : 0;
export const maskChar = (m) => m ? m.toString(16) : '.';
export const hasPlace = (c, i) => !!(maskOf(c) & (1 << i));
/* marked, but not for place i */
export const missesPlace = (c, i) => c === 'n' || (c !== '.' && !hasPlace(c, i));

/* Sheets saved before `slots` existed: `days` was the first place, and each other place was
   'same' (= days), 'own' (its own sheet in at[place]) or 'no'. They are read into the new shape here;
   an 'own' sheet that is still an untouched copy of `days` counts as not set. */
function sameDays(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) { const x = valid(a[k]) ? a[k] : EMPTY, y = valid(b[k]) ? b[k] : EMPTY; if (x !== y) return false; }
  return true;
}
export function legacySlots(p, places = S.PLACES) {
  const base = p.days, out = {};
  const sheets = places.map((pl, i) => {
    if (!i) return base;
    const m = p.pl[pl];
    if (m === 'same') return base;
    if (m === 'own' && p.at[pl] && !sameDays(p.at[pl], base)) return p.at[pl];
    return null;
  });
  const keys = new Set();
  sheets.forEach((d) => d && Object.keys(d).forEach((k) => keys.add(k)));
  keys.forEach((k) => {
    if (!isDayKey(k)) return;
    const b = valid(base[k]) ? base[k] : EMPTY;
    let s = '';
    for (let h = 0; h < 24; h++) {
      let mk = 0;
      sheets.forEach((d, i) => { if (d && valid(d[k]) && d[k][h] === 'p') mk |= 1 << i; });
      s += mk ? mk.toString(16) : b[h] === 'n' ? 'n' : '.';
    }
    if (s !== EMPTY) out[k] = s;
  });
  return out;
}
const derived = new Map();
/* call whenever people or places change */
export function forgetDerived() { derived.clear(); }
export function storedSlots(id) {
  const p = S.people.get(id);
  if (!p) return {};
  if (p.slots) return p.slots;
  if (!derived.has(id)) derived.set(id, legacySlots(p));
  return derived.get(id);
}
export function baseStr(k) {
  if (k in S.committed) return S.committed[k];
  const s = storedSlots(S.me)[k];
  return valid(s) ? s : EMPTY;
}
export function mineStr(k) { return S.preview && k in S.preview ? S.preview[k] : baseStr(k); }
export function strOf(id, k) {
  if (id === S.me) return mineStr(k);
  const s = storedSlots(id)[k];
  return valid(s) ? s : EMPTY;
}
/* the days a person has anything stored for */
export function dayKeys(id) {
  const keys = new Set(Object.keys(storedSlots(id)));
  if (id === S.me) Object.keys(S.committed).forEach((k) => keys.add(k));
  return [...keys];
}

/* per hour: a[i] = people who can make place i, n = people out everywhere, m = people who marked anything */
export function tally(k) {
  const P = S.PLACES.length, a = Array.from({ length: P }, () => new Array(24).fill(0)), n = new Array(24).fill(0), m = new Array(24).fill(0);
  for (const id of ids()) {
    const s = strOf(id, k); if (s === EMPTY) continue;
    for (let h = 0; h < 24; h++) {
      const c = s[h]; if (c === '.') continue;
      m[h]++;
      if (c === 'n') { n[h]++; continue; }
      const mk = maskOf(c);
      for (let i = 0; i < P; i++) if (mk & (1 << i)) a[i][h]++;
    }
  }
  return { a, n, m };
}
export function xWho(k) { return ids().filter((id) => strOf(id, k) === FULLN); }
/* who marked hour h: per place, and out everywhere */
export function who(k, h) {
  const at = S.PLACES.map(() => []), n = [];
  for (const id of ids()) {
    const c = strOf(id, k)[h];
    if (c === 'n') n.push(id);
    else if (c !== '.') S.PLACES.forEach((_, i) => { if (hasPlace(c, i)) at[i].push(id); });
  }
  return { at, n };
}

/* ---------- colours ---------- */
/* one place: plain green; several: each place its own colour (--pc1…4), and green for "anywhere" */
export const placeVar = (i) => S.PLACES.length < 2 ? 'var(--go)' : 'var(--pc' + (i + 1) + ')';
export const placeInk = (i) => S.PLACES.length < 2 ? 'var(--go-ink)' : 'var(--pc' + (i + 1) + '-ink)';
const PCT = [0, 22, 38, 54, 70, 85, 100];
export const placeShade = (i, l) => l >= 6 ? placeVar(i) : 'color-mix(in oklab, ' + placeVar(i) + ' ' + PCT[l] + '%, var(--cell))';
/* several colours side by side in one cell */
export function splitBg(cols) {
  if (cols.length === 1) return cols[0];
  const w = 100 / cols.length;
  return 'linear-gradient(135deg, ' + cols.map((c, j) => c + ' ' + (j * w) + '% ' + ((j + 1) * w) + '%').join(', ') + ')';
}
/* a mask drawn as colours: every place = green, otherwise the colour of each place in it */
export function maskBg(mk, l) {
  if (!mk) return '';
  if (mk === ALL()) return S.PLACES.length < 2 ? placeShade(0, l) : 'var(--g' + l + ')';
  return splitBg(S.PLACES.map((_, i) => i).filter((i) => mk & (1 << i)).map((i) => placeShade(i, l)));
}
export const maskInk = (mk) => mk === ALL() ? 'var(--go-ink)' : (mk & (mk - 1)) ? 'var(--ink)' : placeInk(Math.log2(mk));
export function maskLabel(mk) {
  if (mk === ALL()) return S.PLACES.length < 2 ? '가능' : '어디든';
  return S.PLACES.filter((_, i) => mk & (1 << i)).join('·');
}

/* six shades whatever the seat count: a full house is always the darkest */
export const lvl = (c) => Math.min(6, Math.ceil(c * 6 / S.MAX));
export function bgFor(p, n) { return bgLv(lvl(p), lvl(n)); }
export function bgLv(p, n) {
  if (!p && !n) return '';
  if (p && !n) return 'var(--g' + p + ')';
  if (n && !p) return 'repeating-linear-gradient(-45deg, transparent 0 5px, var(--hatch) 5px 7px), var(--r' + n + ')';
  return 'linear-gradient(135deg, var(--g' + p + ') 0 50%, var(--r' + n + ') 50% 100%)';
}
/* the board's colour for hour h of a tally: one place = can/can't there; compare = the place most people can make */
export function cellBg(t, h) {
  if (S.lens >= 0 || S.PLACES.length < 2) { const i = Math.max(0, S.lens); return bgFor(t.a[i][h], t.m[h] - t.a[i][h]); }
  const best = Math.max(...t.a.map((x) => x[h]));
  if (!best) return t.n[h] ? bgLv(0, lvl(t.n[h])) : '';
  const l = lvl(best), win = t.a.map((x, i) => (x[h] === best ? i : -1)).filter((i) => i >= 0);
  /* every place equally good: the place doesn't matter, so plain green */
  return win.length === S.PLACES.length ? 'var(--g' + l + ')' : splitBg(win.map((i) => placeShade(i, l)));
}
/* in "내 표시" one person is the whole picture, so their marks get a strong shade */
export const MINE_LV = 4;
export const mineView = () => S.view === 'mine' && !!S.me;
export function mineBg(c) { return c === 'n' ? bgLv(0, MINE_LV) : maskBg(maskOf(c), MINE_LV); }

export function canJoin() { return !!S.DB && S.dbState === 'ready' && !S.readonly; }
export function canPaint() { return !!S.me && !!S.DB && !S.readonly && !['off', 'error', 'denied'].includes(S.dbState); }
export const isBrush = (t) => /^pl\d$/.test(t) || ['any', 'no', 'xday', 'erase'].includes(t);
export const xMode = () => S.tool === 'xday' && canPaint();

/* ---------- meetings ---------- */
/* the grid hours a meeting touches: '19:30'–'21:00' → [19, 21) */
export function meetSpan(start, end) {
  const s = +start.slice(0, 2);
  const e = end ? Math.ceil((+end.slice(0, 2) * 60 + +end.slice(3, 5)) / 60) : s + 1;
  return [s, Math.min(24, Math.max(e, s + 1))];
}
/* hours covered by meetings, per day, for the calendar dot and the grid's accent bar */
export function meetHours() {
  const out = {};
  S.meets.forEach((m) => {
    const [s, e] = meetSpan(m.start, m.end), set = out[m.date] || (out[m.date] = new Set());
    for (let h = s; h < e; h++) set.add(h);
  });
  return out;
}
/* a meeting without a guest list (made before lists existed) is for everyone */
export function attends(m, id) { return m.who ? id in m.who : S.people.has(id); }
/* how a person marked a meeting's hours at its place: 'yes' all can, 'part' some, 'no' any can't, '' nothing */
export function slotStatus(id, k, start, end, pl) {
  if (!inRange(k) || !start) return '';
  const i = S.PLACES.indexOf(pl), [s, e] = meetSpan(start, end), str = strOf(id, k);
  let a = 0, x = 0;
  for (let h = s; h < e; h++) {
    const c = str[h];
    if (c === 'n') x++;
    else if (c !== '.' && i >= 0) { if (hasPlace(c, i)) a++; else x++; }
  }
  return x ? 'no' : a === e - s ? 'yes' : a ? 'part' : '';
}
