/* Project board (?p=<id>): loads the project, listens to its people and meetings, and wires up the clicks */
import { $, PID, BASE, TODAY_K, esc, dot, store, toast, narrow, monthsBetween } from '../util.js';
import { readProject, remember, forget } from '../projects.js';
import { S, PEOPLE, K_ME, K_NAME, K_LENS, inRange, monthOf, colsNow, idFor, xMode, forgetDerived } from './state.js';
import { renderAll, renderGate, renderPeople, renderTabs, renderMonth, renderTools, select, step, scrollToDetail } from './view.js';
import { bindGrid, toggleDay, clearAllX } from './paint.js';
import { setLens, editPlaces, bindPlaces } from './places.js';
import { watchMeets, onMeetClick, bindMeets, closeTop } from './meets.js';

const MISSING = '프로젝트를 찾을 수 없어요. 링크가 맞는지 확인하거나, 링크를 보낸 사람에게 다시 받아 주세요.';
const crumb = () => '<a class="crumb" href="' + esc(BASE) + '">모일까</a>';

export function init() {
  $('#eyebrow').innerHTML = crumb() + ' · 1시간 단위 일정 조율';
  bindGrid(); bindPlaces(); bindMeets();
  document.addEventListener('click', onClick);
  $('#joinForm').addEventListener('submit', (e) => { e.preventDefault(); join($('#nick').value); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || closeTop()) return;
    if (S.gateOpen) { S.gateOpen = false; renderGate(); }
  });
}
export function fail(msg) { S.dbState = 'off'; showStatus(msg); }
export function start(db) { S.DB = db; watchAdmin(); openProject(); }

function showStatus(msg, back) {
  const el = $('#pstatus');
  el.hidden = !msg;
  el.innerHTML = msg ? '<p>' + msg + '</p>' + (back ? '<a class="link" href="' + esc(BASE) + '">첫 화면으로</a>' : '') : '';
}

function setProject(p) {
  const first = !S.proj;
  const lensName = first ? store.get(K_LENS) : S.PLACES[S.lens];
  if (first || p.places.join('\n') !== S.PLACES.join('\n')) forgetDerived();
  S.proj = p; S.START_K = p.start; S.END_K = p.end; S.MAX = p.max; S.MONTHS = monthsBetween(p.start, p.end); S.PLACES = p.places;
  /* the lens follows its place by name, so it survives places being renamed around it */
  S.lens = S.PLACES.length > 1 ? S.PLACES.indexOf(lensName) : -1;
  if (first) { S.sel = inRange(TODAY_K) ? TODAY_K : S.START_K; S.gateOpen = !S.me; }
  else if (!inRange(S.sel)) S.sel = S.sel < S.START_K ? S.START_K : S.END_K;
  S.monthIdx = monthOf(S.sel);
  const ym = (k) => dot(k.slice(0, 7));
  document.title = p.title + ' · 모일까';
  $('#title').textContent = p.title;
  $('#eyebrow').innerHTML = crumb() + ' · ' + dot(S.START_K) + ' — ' + dot(S.END_K) + ' · 1시간 단위 · 최대 ' + S.MAX + '명';
  $('#gateEyebrow').textContent = (ym(S.START_K) === ym(S.END_K) ? ym(S.START_K) : ym(S.START_K) + ' — ' + ym(S.END_K)) + ' · ' + S.MAX + '자리';
  remember(p);
}

/* admins signed in on the project list get the meeting and place controls here too */
function watchAdmin() {
  if (S.DB.local) { S.admin = true; return; }
  let seq = 0;
  S.DB.auth.onChange(async (u) => {
    const t = ++seq;
    let a = false;
    if (u) { try { a = (await S.DB.collection('admins').doc(u.uid).get()).exists; } catch (e) { a = false; } }
    if (t !== seq) return;
    S.admin = a;
    if (!a) S.plEdit = false;
    renderAll();
  });
}

function openProject() {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(PID)) return showStatus(MISSING, true);
  showStatus('프로젝트를 불러오는 중…');
  const timer = setTimeout(() => { if (!S.proj) showStatus('저장소 응답이 늦어요. 네트워크를 확인하고 잠시만 기다려 주세요.'); }, 10000);
  let stops = null;
  S.DB.collection('projects').doc(PID).onSnapshot((snap) => {
    if (!snap.exists && snap.metadata.fromCache) return;
    clearTimeout(timer);
    const p = snap.exists ? readProject(PID, snap.data()) : null;
    if (!p) {
      if (stops) { stops.forEach((f) => f()); stops = null; }
      const was = !!S.proj;
      S.proj = null; S.gateOpen = false;
      $('#board').hidden = true; $('#gate').hidden = true;
      if (!snap.exists) forget(PID);
      showStatus(snap.exists ? '프로젝트 설정을 읽을 수 없어요.' : was ? '이 프로젝트는 삭제됐어요.' : MISSING, true);
      return;
    }
    setProject(p);
    showStatus('');
    $('#board').hidden = false;
    if (!stops) stops = [watchPeople(), watchMeets()];
    renderAll();
  }, (e) => {
    clearTimeout(timer);
    showStatus((e && e.code === 'not_granted') ? 'Firestore 규칙이 읽기를 막고 있어요. firestore.rules 내용을 Firebase 콘솔의 규칙 탭에 게시하세요.' : '저장소 연결이 끊겼어요. 페이지를 새로 열어 주세요.');
  });
}

function watchPeople() {
  const timer = setTimeout(() => { if (S.dbState === 'connecting') { S.dbState = 'slow'; renderAll(); } }, 10000);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x)) ? x : {};
  return S.DB.collection(PEOPLE).onSnapshot((snap) => {
    const next = new Map();
    snap.docs.forEach((d) => {
      const v = d.data() || {};
      if (typeof v.name !== 'string') return;
      const at = {};
      Object.keys(obj(v.at)).forEach((pl) => { at[pl] = obj(v.at[pl]); });
      next.set(d.id, { id: d.id, name: v.name.slice(0, 24), joinedAt: Number(v.joinedAt) || 0, slots: v.slots ? obj(v.slots) : null, days: obj(v.days), pl: obj(v.pl), at });
    });
    S.people = next;
    forgetDerived();
    if (!snap.metadata.fromCache) { clearTimeout(timer); if (S.dbState === 'connecting' || S.dbState === 'slow') S.dbState = 'ready'; }
    if (S.me && S.people.has(S.me)) { S.myName = S.people.get(S.me).name; store.set(K_NAME, S.myName); }
    if (S.me && !S.people.has(S.me) && !snap.metadata.fromCache && !S.joining && !S.writing) { toast('내 자리가 비워져서 다시 들어와야 해요.'); leave(); return; }
    renderAll();
  }, (e) => { clearTimeout(timer); S.dbState = (e && e.code === 'not_granted') ? 'denied' : 'error'; renderAll(); });
}

/* ---------- joining ---------- */
function openGate() { S.gateOpen = true; S.gateMsg = ''; renderGate(); setTimeout(() => { const n = $('#nick'); if (n && !n.disabled) n.focus(); }, 30); }
function setMe(id, name) {
  S.me = id; S.myName = name || (S.people.get(id) && S.people.get(id).name) || S.myName;
  store.set(K_ME, S.me); store.set(K_NAME, S.myName);
  S.gateOpen = false; S.gateMsg = ''; S.committed = {}; S.saveState = '';
  renderAll();
}
function leave() {
  S.me = null; S.myName = ''; S.committed = {}; S.saveState = '';
  store.set(K_ME, null); store.set(K_NAME, null);
  renderAll(); openGate();
}
function gateError(msg) { S.gateMsg = msg; renderGate(); }

async function join(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return gateError('닉네임을 입력하세요.');
  if ([...name].length > 12) return gateError('닉네임은 12자까지 쓸 수 있어요.');
  if (!S.DB || S.dbState !== 'ready') return gateError('아직 저장소에 연결되지 않았어요. 잠시 후 다시 눌러 주세요.');
  if (S.readonly) return gateError('보기 전용 권한이라 들어갈 수 없어요.');
  const id = idFor(name);
  if (S.people.has(id)) return setMe(id);
  if (S.people.size >= S.MAX) return gateError(S.MAX + '자리가 모두 찼어요. 내 자리를 누르거나, 둘러보기로 들어가 쓰지 않는 자리를 비워 주세요.');
  S.joining = true; S.gateMsg = ''; renderGate();
  try {
    const ref = S.DB.collection(PEOPLE).doc(id);
    const snap = await ref.get();
    if (!snap.exists) await ref.set({ name, joinedAt: Date.now(), days: {} });
    const existing = snap.exists && snap.data() && snap.data().name;
    S.joining = false;
    $('#nick').value = '';
    setMe(id, existing || name);
  } catch (e) {
    S.joining = false;
    const code = e && e.code;
    if (code === 'invalid_argument' || code === 'not_granted') { S.readonly = true; gateError('저장이 거부됐어요. Firestore 규칙(firestore.rules)을 게시했는지 확인하세요.'); }
    else if (code === 'quota_exceeded') gateError('오늘 쓸 수 있는 Firebase 무료 사용량을 다 썼어요. 한국 시간 오후 4~5시쯤 초기화되면 다시 시도하세요.');
    else gateError('들어가지 못했어요. 잠시 후 다시 시도하세요.');
    renderAll();
  }
}

async function removePerson(id) {
  S.confirmDel = null;
  if (!S.DB) return;
  try {
    await S.DB.collection(PEOPLE).doc(id).delete();
    if (id === S.me) { leave(); return; }
    toast('자리를 비웠어요.');
  } catch (e) {
    toast('자리를 비우지 못했어요. 쓰기 권한을 확인하세요.');
  }
  renderAll();
}

/* ---------- clicks ---------- */
function dayView(k, h) {
  S.mode = 'day'; store.set('six.mode', S.mode);
  if (h != null) S.focus = { k, h };
  select(k);
}
function onClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  const ds = t.dataset;
  if (onMeetClick(ds)) return;
  if (ds.tab != null) { S.monthIdx = +ds.tab; renderTabs(); renderMonth(); return; }
  if (ds.day) {
    if (xMode()) toggleDay(ds.day);
    else { select(ds.day); if (narrow()) scrollToDetail(); }
    return;
  }
  if (ds.dayview) { dayView(ds.dayview); return; }
  if (ds.myday) { dayView(ds.myday); if (narrow()) scrollToDetail(); return; }
  if (ds.mode) { S.mode = ds.mode; store.set('six.mode', S.mode); if (S.focus && !colsNow().includes(S.focus.k)) S.focus = null; renderAll(); return; }
  if (ds.view) { if (ds.view === 'mine' && !S.me) return; S.view = ds.view; store.set('six.view', S.view); renderAll(); return; }
  if (ds.tool) { S.tool = ds.tool; S.confirmClearX = false; store.set('six.tool', S.tool); renderTools(); renderMonth(); return; }
  if (ds.lens != null) { setLens(ds.lens); return; }
  if (ds.rec) { dayView(ds.rec, +ds.h); scrollToDetail(); return; }
  if (ds.join) { setMe(ds.join); return; }
  if (ds.del) { S.confirmDel = ds.del; renderPeople(); return; }
  if (ds.delYes) { removePerson(ds.delYes); return; }
  if (ds.delNo) { S.confirmDel = null; renderPeople(); return; }
  switch (ds.act) {
    case 'prev': step(-1); break;
    case 'next': step(1); break;
    case 'today': if (inRange(TODAY_K)) select(TODAY_K); break;
    case 'leave': leave(); break;
    case 'open-gate': openGate(); break;
    case 'browse': S.gateOpen = false; renderGate(); break;
    case 'clear-x': S.confirmClearX = true; renderTools(); break;
    case 'clear-x-yes': clearAllX(); break;
    case 'clear-x-no': S.confirmClearX = false; renderTools(); break;
    case 'pl-edit': editPlaces(true); break;
    case 'pl-cancel': editPlaces(false); break;
  }
}
