/* Meetings ("일정", projects/<id>/meets): everyone sees them at the top of the board; admins add, edit and delete.
   A meeting has a date, a start (and optional end) time and one of the project's places, and optionally a title
   (e.g. "보컬 연습"), the people attending, a venue name, a booking link, a photo and a memo. */
import { $, WD, TODAY_K, fromKey, pad, esc, initial, isDayKey, newId, store, toast } from '../util.js';
import { S, MEETS, inRange, sortedPeople, nameOf, attends, slotStatus } from './state.js';
import { renderAll, select, scrollToDetail } from './view.js';

/* photos live inside the meeting document (Firebase Storage needs a paid plan), so they are shrunk to a few hundred KB */
const IMG_MAX = 600000;
const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const STATUS = { yes: '가능', part: '일부', no: '불가', '': '' };
let form = null, saving = false, msg = '';

export function readMeet(id, v) {
  if (!v || !isDayKey(v.date) || !isTime(v.start)) return null;
  const str = (x, n) => typeof x === 'string' ? x.trim().slice(0, n) : '';
  const link = str(v.link, 500), img = typeof v.img === 'string' ? v.img : '';
  /* who = { personId: name }; the name keeps showing if that person later empties their seat */
  let who = null;
  if (v.who && typeof v.who === 'object' && !Array.isArray(v.who)) {
    who = {};
    Object.keys(v.who).forEach((pid) => { who[pid] = str(v.who[pid], 24) || '?'; });
  }
  return {
    id, date: v.date, start: v.start, end: isTime(v.end) ? v.end : '',
    title: str(v.title, 40), place: str(v.place, 20), venue: str(v.venue, 80), memo: str(v.memo, 300),
    link: /^https?:\/\//i.test(link) ? link : '',
    img: /^(data:image\/(png|jpe?g|webp|gif);base64,|https:\/\/)/i.test(img) ? img : '',
    who, createdAt: Number(v.createdAt) || 0
  };
}
export function watchMeets() {
  return S.DB.collection(MEETS).onSnapshot((snap) => {
    S.meets = snap.docs.map((d) => readMeet(d.id, d.data())).filter(Boolean);
    S.meetsState = 'ready';
    renderAll();
  }, (e) => { S.meets = []; S.meetsState = (e && e.code === 'not_granted') ? 'denied' : 'error'; renderAll(); });
}

/* ---------- cards and the per-person list ---------- */
/* upcoming first (soonest on top), then past ones (latest on top) */
function ordered() {
  const at = (m) => m.date + ' ' + m.start;
  const up = S.meets.filter((m) => m.date >= TODAY_K).sort((a, b) => (at(a) < at(b) ? -1 : 1));
  const past = S.meets.filter((m) => m.date < TODAY_K).sort((a, b) => (at(a) > at(b) ? -1 : 1));
  return up.concat(past);
}
function dday(k) {
  const n = Math.round((fromKey(k) - fromKey(TODAY_K)) / 864e5);
  return n === 0 ? '오늘' : n > 0 ? 'D-' + n : '지난 일정';
}
const colorVar = (pid) => S.colorOf[pid] ? 'var(--p' + S.colorOf[pid] + ')' : 'var(--line-strong)';
function personChip(pid, name) {
  const left = !S.people.has(pid);
  return '<span class="wchip' + (pid === S.me ? ' me' : '') + (left ? ' left' : '') + '"' + (left ? ' title="자리를 비운 사람"' : '') + '>' +
    '<i style="background:' + colorVar(pid) + '"></i>' + esc(left ? name : nameOf(pid)) + '</span>';
}
function whoLine(m) {
  const sp = sortedPeople();
  if (!m.who) return '<div class="mwho"><span class="ptag">전체' + (sp.length ? ' ' + sp.length + '명' : '') + '</span></div>';
  const ids = Object.keys(m.who);
  if (!ids.length) return '<div class="mwho">참가자 미정</div>';
  if (sp.length && sp.every((p) => p.id in m.who)) return '<div class="mwho"><span class="ptag">전체 ' + ids.length + '명</span></div>';
  const order = sp.map((p) => p.id).filter((pid) => pid in m.who).concat(ids.filter((pid) => !S.people.has(pid)));
  return '<div class="mwho"><span>참가 ' + ids.length + '명</span>' + order.map((pid) => personChip(pid, m.who[pid])).join('') + '</div>';
}
function card(m) {
  const d = fromKey(m.date), past = m.date < TODAY_K;
  let host = '';
  try { host = new URL(m.link).hostname.replace(/^www\./, ''); } catch (e) {}
  const acts = !S.admin ? ''
    : S.confirmMeet === m.id
      ? '<span class="confirm"><span>이 일정을 지울까요?</span><button type="button" class="mini danger" data-meet-del-yes="' + esc(m.id) + '">지우기</button><button type="button" class="mini" data-meet-del-no="1">취소</button></span>'
      : '<span class="pacts"><button type="button" class="mini" data-meet-edit="' + esc(m.id) + '">고치기</button><button type="button" class="mini ghost" data-meet-del="' + esc(m.id) + '">지우기</button></span>';
  return '<li class="meet' + (past ? ' past' : '') + (m.img ? ' hasimg' : '') + '">' +
    '<button type="button" class="mcal" data-meet-go="' + esc(m.id) + '" aria-label="' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 시간표 보기">' +
    '<span class="mm">' + (d.getMonth() + 1) + '월</span><span class="mdd">' + d.getDate() + '</span><span class="mw">' + WD[d.getDay()] + '요일</span></button>' +
    '<div class="mbody">' +
    '<div class="mwhen"><span class="mtime">' + esc(m.start) + (m.end ? '–' + esc(m.end) : '') + '</span><span class="dday">' + dday(m.date) + '</span>' +
    (S.me && attends(m, S.me) ? '<span class="mtag own">나도 참가</span>' : '') + '</div>' +
    (m.title ? '<div class="mtitle">' + esc(m.title) + '</div>' : '') +
    '<div class="mvenue">' + (m.place ? '<span class="ptag">' + esc(m.place) + '</span> ' : '') + esc(m.venue || (m.place ? '' : '장소 미정')) + '</div>' +
    (m.link ? '<a class="mlink" href="' + esc(m.link) + '" target="_blank" rel="noopener noreferrer">예약 링크' + (host ? ' · ' + esc(host) : '') + ' ↗</a>' : '') +
    (m.memo ? '<p class="mmemo">' + esc(m.memo) + '</p>' : '') + whoLine(m) + acts + '</div>' +
    (m.img ? '<button type="button" class="mthumb" data-img="' + esc(m.id) + '" aria-label="장소 사진 크게 보기"><img src="' + esc(m.img) + '" alt=""></button>' : '') +
    '</li>';
}
/* one row per person: the meetings they take part in */
function byPerson() {
  const rows = sortedPeople().map((p) => ({ id: p.id, name: p.name }));
  S.meets.forEach((m) => m.who && Object.keys(m.who).forEach((pid) => {
    if (!S.people.has(pid) && !rows.some((r) => r.id === pid)) rows.push({ id: pid, name: m.who[pid], left: true });
  }));
  if (!rows.length) return '<p class="empty">아직 들어온 참여자가 없어요.</p>';
  const list = ordered();
  return '<ul class="plist">' + rows.map((r) => {
    const ms = list.filter((m) => attends(m, r.id));
    const items = ms.length ? ms.map((m) => {
      const d = fromKey(m.date);
      return '<button type="button" class="bpi' + (m.date < TODAY_K ? ' past' : '') + '" data-meet-go="' + esc(m.id) + '"><b>' + (d.getMonth() + 1) + '/' + d.getDate() + '</b>' + esc(m.title || m.venue || m.place || '일정') + '</button>';
    }).join('') : '<span class="pstat">참가하는 일정이 없어요</span>';
    return '<li class="person"><span class="av" style="background:' + colorVar(r.id) + '">' + esc(initial(r.name)) + '</span>' +
      '<span class="pmeta"><span class="pname">' + esc(r.name) + (r.id === S.me ? '<span class="tag">나</span>' : '') + (r.left ? '<span class="mtag unset">자리 비움</span>' : '') + '</span>' +
      '<span class="bpm">' + items + '</span></span><span class="mono">' + ms.length + '개</span></li>';
  }).join('') + '</ul>';
}
export function renderMeets() {
  if (!S.admin && form) closeMeet();
  const el = $('#meets');
  el.hidden = !S.meets.length && !S.admin;
  if (el.hidden) return;
  let body;
  if (S.meets.length) body = S.meetView === 'people' ? byPerson() : '<ul class="mlist">' + ordered().map(card).join('') + '</ul>';
  else if (S.meetsState === 'denied') body = '<p class="note err">일정을 읽을 권한이 없어요. 최신 firestore.rules를 Firebase 콘솔 규칙 탭에 게시하세요.</p>';
  else body = '<p class="empty">아직 잡은 일정이 없어요. 추천 시간 옆의 <b>+ 일정</b>이나 오른쪽 위 버튼으로 잡으면 모두에게 보여요.</p>';
  const v = (key, label) => '<button type="button" data-meetview="' + key + '" aria-pressed="' + (S.meetView === key) + '">' + label + '</button>';
  el.innerHTML = '<div class="mhead"><h3 id="meetTitle">일정</h3>' +
    (S.meets.length ? '<span class="mono">' + S.meets.length + '개</span><div class="seg" role="group" aria-label="일정 보기">' + v('cards', '카드') + v('people', '사람별') + '</div>' : '') +
    (S.admin ? '<button type="button" class="mini" data-act="meet-new">+ 일정 잡기</button>' : '') + '</div>' + body;
}

/* ---------- add / edit dialog ---------- */
/* participants as toggles, each showing how they marked the chosen date, time and place */
function renderPicker() {
  if (!form) return;
  const k = $('#mDate').value, start = $('#mStart').value.slice(0, 5), end = $('#mEnd').value.slice(0, 5), pl = $('#mPlace').value;
  const sp = sortedPeople(), rows = sp.map((p) => [p.id, p.name, false]);
  form.who.forEach((name, pid) => { if (!S.people.has(pid)) rows.push([pid, name, true]); });
  $('#mWho').innerHTML = rows.length ? rows.map(([pid, name, left]) => {
    const st = left ? '' : slotStatus(pid, k, start, end, pl);
    return '<button type="button" class="pick' + (st ? ' ' + st : '') + '" data-pick="' + esc(pid) + '" aria-pressed="' + form.who.has(pid) + '">' +
      '<i style="background:' + colorVar(pid) + '"></i>' + esc(name) + (left ? '<small>자리 비움</small>' : STATUS[st] ? '<small>' + STATUS[st] + '</small>' : '') + '</button>';
  }).join('') : '<span class="pstat">아직 들어온 참여자가 없어요. 비워 두면 전체 일정이 돼요.</span>';
  const n = form.who.size;
  $('#mWhoSum').textContent = !sp.length ? '' : sp.every((p) => form.who.has(p.id)) ? '전체 ' + n + '명' : n ? sp.length + '명 중 ' + n + '명' : '아무도 안 골랐어요';
  $('#mWhoActs').hidden = !sp.length;
}
function renderDlg() {
  $('#meetDlg').hidden = !form;
  if (!form) return;
  const img = $('#mImgPrev');
  img.hidden = !form.img;
  if (form.img) img.src = form.img; else img.removeAttribute('src');
  $('#mImgClear').hidden = !form.img;
  $('#meetMsg').textContent = msg;
  $('#meetSave').disabled = saving || form.busy;
  $('#meetSave').textContent = form.busy ? '사진 줄이는 중…' : saving ? '저장 중…' : '저장';
  renderPicker();
}
/* m: an existing meeting, or a starting point { date, start, end, place, who } */
function openMeet(m) {
  if (!S.admin) return;
  const everyone = new Map(sortedPeople().map((p) => [p.id, p.name]));
  form = { id: m.id || '', createdAt: m.createdAt || 0, img: m.img || '', busy: false, who: m.who ? new Map(Object.entries(m.who)) : everyone };
  saving = false; msg = '';
  const places = S.PLACES.concat(m.place && !S.PLACES.includes(m.place) ? [m.place] : []);
  $('#mPlace').innerHTML = places.map((pl) => '<option value="' + esc(pl) + '">' + esc(pl) + '</option>').join('');
  $('#mPlace').value = places.includes(m.place) ? m.place : S.PLACES[Math.max(0, S.lens)];
  $('#mDate').value = m.date || S.sel;
  $('#mStart').value = m.start || '';
  $('#mEnd').value = m.end || '';
  $('#mTitle').value = m.title || '';
  $('#mVenue').value = m.venue || '';
  $('#mLink').value = m.link || '';
  $('#mMemo').value = m.memo || '';
  $('#mImgFile').value = '';
  $('#meetDlgTitle').textContent = form.id ? '일정 고치기' : '일정 잡기';
  renderDlg();
  setTimeout(() => $(m.start ? '#mTitle' : '#mStart').focus(), 30);
}
function closeMeet() { form = null; saving = false; msg = ''; renderDlg(); }
function pick(which) {
  if (!form) return;
  const sp = sortedPeople();
  if (which === 'none') form.who.clear();
  else {
    const k = $('#mDate').value, start = $('#mStart').value.slice(0, 5), end = $('#mEnd').value.slice(0, 5), pl = $('#mPlace').value;
    sp.forEach((p) => {
      if (which === 'all' || slotStatus(p.id, k, start, end, pl) === 'yes') form.who.set(p.id, p.name);
      else form.who.delete(p.id);
    });
  }
  renderPicker();
}

async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) return null;
    let side = 1280, q = 0.8;
    for (let t = 0; t < 6; t++) {
      const sc = Math.min(1, side / Math.max(w0, h0)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w0 * sc)); c.height = Math.max(1, Math.round(h0 * sc));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', q);
      if (out.length <= IMG_MAX) return out;
      side = Math.round(side * 0.8); q = Math.max(0.5, q - 0.1);
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}
async function pickImage(e) {
  const f = e.target.files && e.target.files[0], cur = form;
  if (!f || !cur) return;
  cur.busy = true; msg = ''; renderDlg();
  let url = null;
  try { url = await shrinkImage(f); } catch (err) { url = null; }
  cur.busy = false;
  if (form !== cur) return;
  if (url) cur.img = url; else msg = '이 사진은 쓸 수 없어요. JPG나 PNG 사진으로 다시 골라 주세요.';
  renderDlg();
}

async function saveMeet() {
  if (!form || saving || form.busy) return;
  const v = (s) => $(s).value.trim();
  const one = (s, n) => v(s).replace(/\s+/g, ' ').slice(0, n);
  const date = v('#mDate'), start = v('#mStart').slice(0, 5), end = v('#mEnd').slice(0, 5), place = v('#mPlace');
  const title = one('#mTitle', 40), venue = one('#mVenue', 80), memo = one('#mMemo', 300);
  let link = v('#mLink');
  const fail = (m) => { msg = m; renderDlg(); };
  if (!isDayKey(date)) return fail('날짜를 고르세요.');
  if (!isTime(start)) return fail('시작 시간을 정하세요.');
  if (end && !isTime(end)) return fail('끝 시간을 다시 골라 주세요.');
  if (end && end <= start) return fail('끝 시간이 시작보다 빨라요.');
  if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
  if (link) { try { new URL(link); } catch (e) { return fail('예약 링크 주소를 확인하세요.'); } }
  /* set (not merge) so a field cleared in the form disappears from the document too */
  const data = { date, start, place: place.slice(0, 20), createdAt: form.createdAt || Date.now() };
  if (end) data.end = end;
  if (title) data.title = title;
  if (venue) data.venue = venue;
  if (link) data.link = link.slice(0, 500);
  if (form.img) data.img = form.img;
  if (memo) data.memo = memo;
  /* with nobody in the project yet, leave the list out: the meeting is for everyone */
  if (S.people.size || form.who.size) {
    data.who = {};
    form.who.forEach((name, pid) => { data.who[pid] = S.people.has(pid) ? nameOf(pid) : name; });
  }
  saving = true; msg = ''; renderDlg();
  const edit = !!form.id;
  try {
    await S.DB.collection(MEETS).doc(form.id || newId()).set(data);
    closeMeet();
    toast(edit ? '일정을 고쳤어요.' : '일정을 잡았어요. 모두에게 바로 보여요.');
  } catch (e) {
    saving = false;
    fail(e && e.code === 'not_granted' ? '저장이 거부됐어요. 관리자 계정인지, 최신 firestore.rules를 게시했는지 확인하세요.'
      : e && e.code === 'quota_exceeded' ? '저장 공간이나 오늘의 무료 사용량이 모자라요. 사진을 빼고 다시 해 보세요.'
        : '저장하지 못했어요. 잠시 후 다시 시도하세요.');
  }
}
async function deleteMeet(id) {
  S.confirmMeet = null;
  try { await S.DB.collection(MEETS).doc(id).delete(); toast('일정을 지웠어요.'); }
  catch (e) { toast('일정을 지우지 못했어요. 관리자 계정과 Firestore 규칙을 확인하세요.'); }
  renderMeets();
}

/* the date block on a card jumps to that day (and the meeting's place) in the grid */
function goMeet(id) {
  const m = S.meets.find((x) => x.id === id);
  if (!m) return;
  if (!inRange(m.date)) { toast('이 일정은 프로젝트 기간 밖이라 시간표에 없어요.'); return; }
  S.mode = 'day'; store.set('six.mode', 'day');
  S.focus = { k: m.date, h: +m.start.slice(0, 2) };
  select(m.date);
  scrollToDetail();
}

function openLightbox(id) {
  const m = S.meets.find((x) => x.id === id);
  if (!m || !m.img) return;
  $('#lbImg').src = m.img;
  $('#lightbox').hidden = false;
}
function closeLightbox() { $('#lightbox').hidden = true; $('#lbImg').removeAttribute('src'); }
/* Escape closes the photo first, then the dialog */
export function closeTop() {
  if (!$('#lightbox').hidden) { closeLightbox(); return true; }
  if (form) { closeMeet(); return true; }
  return false;
}

export function onMeetClick(ds) {
  if (ds.meetview) { S.meetView = ds.meetview === 'people' ? 'people' : 'cards'; store.set('six.meetview', S.meetView); renderMeets(); return true; }
  if (ds.pick) {
    if (form) { if (form.who.has(ds.pick)) form.who.delete(ds.pick); else form.who.set(ds.pick, nameOf(ds.pick)); renderPicker(); }
    return true;
  }
  if (ds.meetEdit) { const m = S.meets.find((x) => x.id === ds.meetEdit); if (m) openMeet(m); return true; }
  if (ds.meetDel) { S.confirmMeet = ds.meetDel; renderMeets(); return true; }
  if (ds.meetDelYes) { deleteMeet(ds.meetDelYes); return true; }
  if (ds.meetDelNo) { S.confirmMeet = null; renderMeets(); return true; }
  if (ds.meetGo) { goMeet(ds.meetGo); return true; }
  if (ds.meetRec) {
    /* from a suggestion: the people who can make that whole slot there come pre-selected */
    const [k, s, e, ...rest] = ds.meetRec.split('|'), place = rest.join('|');
    const start = pad(+s) + ':00', end = +e < 24 ? pad(+e) + ':00' : '';
    const who = {};
    sortedPeople().forEach((p) => { if (slotStatus(p.id, k, start, end || '23:59', place) === 'yes') who[p.id] = p.name; });
    openMeet({ date: k, start, end, place, who });
    return true;
  }
  if (ds.img) { openLightbox(ds.img); return true; }
  switch (ds.act) {
    case 'meet-new': openMeet({ date: S.sel, start: S.focus && S.focus.k === S.sel ? pad(S.focus.h) + ':00' : '', place: S.PLACES[Math.max(0, S.lens)] }); return true;
    case 'meet-cancel': closeMeet(); return true;
    case 'meet-img-clear': if (form) { form.img = ''; $('#mImgFile').value = ''; renderDlg(); } return true;
    case 'pick-all': pick('all'); return true;
    case 'pick-yes': pick('yes'); return true;
    case 'pick-none': pick('none'); return true;
  }
  return false;
}
export function bindMeets() {
  $('#meetForm').addEventListener('submit', (e) => { e.preventDefault(); saveMeet(); });
  $('#mImgFile').addEventListener('change', pickImage);
  $('#lightbox').addEventListener('click', closeLightbox);
  /* availability next to each name follows the date, time and place being chosen */
  ['#mDate', '#mStart', '#mEnd', '#mPlace'].forEach((s) => $(s).addEventListener('input', renderPicker));
}
