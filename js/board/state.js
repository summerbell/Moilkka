/* Board state shared by the board modules, and everything derived from it (whose marks, at which place, how many) */
import { PID, EMPTY, FULLN, store, valid, fromKey, addDays, ymd, withJ } from '../util.js';
import { DEFAULT_PLACES } from '../projects.js';

export const PEOPLE = 'projects/' + PID + '/people';
export const MEETS = 'projects/' + PID + '/meets';
export const K_ME = 'six.me.' + PID, K_NAME = 'six.name.' + PID, K_PLACE = 'six.place.' + PID;
export const TOOLV = { pref: 'p', no: 'n', erase: '.' };

export const S = {
  DB: null, dbState: 'connecting', readonly: false, joining: false, writing: false,
  /* period, seats and places come from the project document (see setProject) */
  proj: null, START_K: '', END_K: '', MAX: 6, MONTHS: [], PLACES: DEFAULT_PLACES.slice(), place: '',
  people: new Map(),
  me: store.get(K_ME), myName: store.get(K_NAME) || '',
  gateOpen: false, gateMsg: '',
  sel: '', monthIdx: 0,
  mode: store.get('six.mode') === 'day' ? 'day' : 'week',
  tool: ['pref', 'no', 'xday', 'erase', 'look'].includes(store.get('six.tool')) ? store.get('six.tool') : 'pref',
  /* 'mine' shows only my own marks so I can check what I painted */
  view: store.get('six.view') === 'mine' ? 'mine' : 'all',
  /* my unsaved changes, per layer ('' = the base place, otherwise a place name), and place modes not saved yet */
  committed: {}, pendingW: {}, pendingPl: {}, plOv: {},
  preview: null, drag: null, focus: null,
  confirmDel: null, confirmClearX: false,
  saveState: '', saveAt: '', colorOf: {},
  admin: false, meets: [], meetsState: 'loading', confirmMeet: null, plEdit: false
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

/* ---------- places ----------
   The first place is the base layer (each person's `days`). At any other place a person either reuses the base
   ('same'), paints their own layer in at[place] ('own'), can't go at all ('no'), or hasn't said yet (''). */
export const isBase = (pl) => pl === S.PLACES[0];
export function modeOf(id, pl = S.place) {
  if (isBase(pl)) return 'base';
  const p = S.people.get(id);
  const m = id === S.me && pl in S.plOv ? S.plOv[pl] : p && p.pl[pl];
  return m === 'same' || m === 'own' || m === 'no' ? m : '';
}
export function modeLabel(m) {
  return { same: withJ(S.PLACES[0], '과', '와') + ' 같음', own: '따로 칠함', no: '못 감', '': '미정' }[m] || '';
}
/* which stored day map a mode reads: '' = days, a place name = at[place], null = nothing */
export const layerOf = (m, pl) => (m === 'base' || m === 'same') ? '' : m === 'own' ? pl : null;
export function storedDays(id, L) { const p = S.people.get(id); return (p && (L ? p.at[L] : p.days)) || {}; }
export function layerStr(id, k, pl) {
  const m = modeOf(id, pl);
  if (m === 'no') return FULLN;
  const L = layerOf(m, pl);
  if (L == null) return EMPTY;
  if (id === S.me && S.committed[L] && k in S.committed[L]) return S.committed[L][k];
  const s = storedDays(id, L)[k];
  return valid(s) ? s : EMPTY;
}
/* the layer my paint goes to at the current place (null until that place has its own layer) */
export function paintLayer() { const m = modeOf(S.me); return m === 'base' ? '' : m === 'own' ? S.place : null; }
export function baseStr(k) { return layerStr(S.me, k, S.place); }
export function mineStr(k) { return S.preview && k in S.preview ? S.preview[k] : baseStr(k); }
export function strOf(id, k, pl = S.place) { return id === S.me && pl === S.place ? mineStr(k) : layerStr(id, k, pl); }
/* the days a person has anything stored for at a place */
export function dayKeys(id, pl = S.place) {
  const L = layerOf(modeOf(id, pl), pl);
  if (L == null) return [];
  const keys = new Set(Object.keys(storedDays(id, L)));
  if (id === S.me && S.committed[L]) Object.keys(S.committed[L]).forEach((k) => keys.add(k));
  return [...keys];
}

export function counts(k, pl = S.place) {
  const p = new Array(24).fill(0), n = new Array(24).fill(0);
  for (const id of ids()) {
    const s = strOf(id, k, pl); if (s === EMPTY) continue;
    for (let h = 0; h < 24; h++) { if (s[h] === 'p') p[h]++; else if (s[h] === 'n') n[h]++; }
  }
  return { p, n };
}
export function xWho(k) { return ids().filter((id) => strOf(id, k) === FULLN); }
export function who(k, h) {
  const p = [], n = [];
  for (const id of ids()) { const c = strOf(id, k)[h]; if (c === 'p') p.push(id); else if (c === 'n') n.push(id); }
  return { p, n };
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
/* in "내 표시" one person is the whole picture, so their marks get a strong shade */
export const MINE_LV = 4;
export const mineView = () => S.view === 'mine' && !!S.me;

export function canJoin() { return !!S.DB && S.dbState === 'ready' && !S.readonly; }
export function canPaint() { return !!S.me && !!S.DB && !S.readonly && !['off', 'error', 'denied'].includes(S.dbState); }
export function canPaintHere() { return canPaint() && modeOf(S.me) !== 'no'; }
export const xMode = () => S.tool === 'xday' && canPaintHere();

/* hours covered by a meeting, per day, for the calendar dot and the grid's accent bar */
export function meetHours() {
  const out = {};
  S.meets.forEach((m) => {
    const s = +m.start.slice(0, 2);
    let e = m.end ? Math.ceil((+m.end.slice(0, 2) * 60 + +m.end.slice(3, 5)) / 60) : s + 1;
    if (e <= s) e = s + 1;
    const set = out[m.date] || (out[m.date] = new Set());
    for (let h = s; h < e && h < 24; h++) set.add(h);
  });
  return out;
}
