/* Confirmed meetings (projects/<id>/meets): everyone sees them at the top of the board; admins add, edit and delete.
   A meeting has a date, a start (and optional end) time, one of the project's places, and optionally a venue name,
   a booking link, a photo and a memo. */
import { $, WD, TODAY_K, fromKey, pad, esc, isDayKey, newId, store, toast } from '../util.js';
import { S, MEETS, K_PLACE, inRange } from './state.js';
import { renderAll, select, scrollToDetail } from './view.js';

/* photos live inside the meeting document (Firebase Storage needs a paid plan), so they are shrunk to a few hundred KB */
const IMG_MAX = 600000;
const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
let form = null, saving = false, msg = '';

export function readMeet(id, v) {
  if (!v || !isDayKey(v.date) || !isTime(v.start)) return null;
  const str = (x, n) => typeof x === 'string' ? x.trim().slice(0, n) : '';
  const link = str(v.link, 500), img = typeof v.img === 'string' ? v.img : '';
  return {
    id, date: v.date, start: v.start, end: isTime(v.end) ? v.end : '',
    place: str(v.place, 20), venue: str(v.venue, 80), memo: str(v.memo, 300),
    link: /^https?:\/\//i.test(link) ? link : '',
    img: /^(data:image\/(png|jpe?g|webp|gif);base64,|https:\/\/)/i.test(img) ? img : '',
    createdAt: Number(v.createdAt) || 0
  };
}
export function watchMeets() {
  return S.DB.collection(MEETS).onSnapshot((snap) => {
    S.meets = snap.docs.map((d) => readMeet(d.id, d.data())).filter(Boolean);
    S.meetsState = 'ready';
    renderAll();
  }, (e) => { S.meets = []; S.meetsState = (e && e.code === 'not_granted') ? 'denied' : 'error'; renderAll(); });
}

/* ---------- cards ---------- */
/* upcoming first (soonest on top), then past ones (latest on top) */
function ordered() {
  const at = (m) => m.date + ' ' + m.start;
  const up = S.meets.filter((m) => m.date >= TODAY_K).sort((a, b) => (at(a) < at(b) ? -1 : 1));
  const past = S.meets.filter((m) => m.date < TODAY_K).sort((a, b) => (at(a) > at(b) ? -1 : 1));
  return up.concat(past);
}
function dday(k) {
  const n = Math.round((fromKey(k) - fromKey(TODAY_K)) / 864e5);
  return n === 0 ? '오늘' : n > 0 ? 'D-' + n : '지난 약속';
}
function card(m) {
  const d = fromKey(m.date), past = m.date < TODAY_K;
  let host = '';
  try { host = new URL(m.link).hostname.replace(/^www\./, ''); } catch (e) {}
  const acts = !S.admin ? ''
    : S.confirmMeet === m.id
      ? '<span class="confirm"><span>이 약속을 지울까요?</span><button type="button" class="mini danger" data-meet-del-yes="' + esc(m.id) + '">지우기</button><button type="button" class="mini" data-meet-del-no="1">취소</button></span>'
      : '<span class="pacts"><button type="button" class="mini" data-meet-edit="' + esc(m.id) + '">고치기</button><button type="button" class="mini ghost" data-meet-del="' + esc(m.id) + '">지우기</button></span>';
  return '<li class="meet' + (past ? ' past' : '') + (m.img ? ' hasimg' : '') + '">' +
    '<button type="button" class="mcal" data-meet-go="' + esc(m.id) + '" aria-label="' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 시간표 보기">' +
    '<span class="mm">' + (d.getMonth() + 1) + '월</span><span class="mdd">' + d.getDate() + '</span><span class="mw">' + WD[d.getDay()] + '요일</span></button>' +
    '<div class="mbody">' +
    '<div class="mwhen"><span class="mtime">' + esc(m.start) + (m.end ? '–' + esc(m.end) : '') + '</span><span class="dday">' + dday(m.date) + '</span></div>' +
    '<div class="mvenue">' + (m.place ? '<span class="ptag">' + esc(m.place) + '</span> ' : '') + esc(m.venue || (m.place ? '' : '장소 미정')) + '</div>' +
    (m.link ? '<a class="mlink" href="' + esc(m.link) + '" target="_blank" rel="noopener noreferrer">예약 링크' + (host ? ' · ' + esc(host) : '') + ' ↗</a>' : '') +
    (m.memo ? '<p class="mmemo">' + esc(m.memo) + '</p>' : '') + acts + '</div>' +
    (m.img ? '<button type="button" class="mthumb" data-img="' + esc(m.id) + '" aria-label="장소 사진 크게 보기"><img src="' + esc(m.img) + '" alt=""></button>' : '') +
    '</li>';
}
export function renderMeets() {
  if (!S.admin && form) closeMeet();
  const el = $('#meets');
  el.hidden = !S.meets.length && !S.admin;
  if (el.hidden) return;
  let body;
  if (S.meets.length) body = '<ul class="mlist">' + ordered().map(card).join('') + '</ul>';
  else if (S.meetsState === 'denied') body = '<p class="note err">약속을 읽을 권한이 없어요. 최신 firestore.rules를 Firebase 콘솔 규칙 탭에 게시하세요.</p>';
  else body = '<p class="empty">아직 정한 약속이 없어요. 추천 시간 옆의 <b>+ 약속</b>이나 오른쪽 위 버튼으로 잡으면 모두에게 보여요.</p>';
  el.innerHTML = '<div class="sec-head"><h3 id="meetTitle">약속</h3>' +
    (S.admin ? '<button type="button" class="mini" data-act="meet-new">+ 약속 잡기</button>' : '<span class="mono">' + S.meets.length + '건</span>') + '</div>' + body;
}

/* ---------- add / edit dialog ---------- */
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
}
function openMeet(m) {
  if (!S.admin) return;
  form = { id: m.id || '', createdAt: m.createdAt || 0, img: m.img || '', busy: false };
  saving = false; msg = '';
  const places = S.PLACES.concat(m.place && !S.PLACES.includes(m.place) ? [m.place] : []);
  $('#mPlace').innerHTML = places.map((pl) => '<option value="' + esc(pl) + '">' + esc(pl) + '</option>').join('');
  $('#mPlace').value = places.includes(m.place) ? m.place : S.place;
  $('#mDate').value = m.date || S.sel;
  $('#mStart').value = m.start || '';
  $('#mEnd').value = m.end || '';
  $('#mVenue').value = m.venue || '';
  $('#mLink').value = m.link || '';
  $('#mMemo').value = m.memo || '';
  $('#mImgFile').value = '';
  $('#meetDlgTitle').textContent = form.id ? '약속 고치기' : '약속 잡기';
  renderDlg();
  setTimeout(() => $(m.start ? '#mVenue' : '#mStart').focus(), 30);
}
function closeMeet() { form = null; saving = false; msg = ''; renderDlg(); }

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
  const date = v('#mDate'), start = v('#mStart').slice(0, 5), end = v('#mEnd').slice(0, 5), place = v('#mPlace');
  const venue = v('#mVenue').replace(/\s+/g, ' ').slice(0, 80), memo = v('#mMemo').replace(/\s+/g, ' ').slice(0, 300);
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
  if (venue) data.venue = venue;
  if (link) data.link = link.slice(0, 500);
  if (form.img) data.img = form.img;
  if (memo) data.memo = memo;
  saving = true; msg = ''; renderDlg();
  const edit = !!form.id;
  try {
    await S.DB.collection(MEETS).doc(form.id || newId()).set(data);
    closeMeet();
    toast(edit ? '약속을 고쳤어요.' : '약속을 잡았어요. 모두에게 바로 보여요.');
  } catch (e) {
    saving = false;
    fail(e && e.code === 'not_granted' ? '저장이 거부됐어요. 관리자 계정인지, 최신 firestore.rules를 게시했는지 확인하세요.'
      : e && e.code === 'quota_exceeded' ? '저장 공간이나 오늘의 무료 사용량이 모자라요. 사진을 빼고 다시 해 보세요.'
        : '저장하지 못했어요. 잠시 후 다시 시도하세요.');
  }
}
async function deleteMeet(id) {
  S.confirmMeet = null;
  try { await S.DB.collection(MEETS).doc(id).delete(); toast('약속을 지웠어요.'); }
  catch (e) { toast('약속을 지우지 못했어요. 관리자 계정과 Firestore 규칙을 확인하세요.'); }
  renderMeets();
}

/* the date block on a card jumps to that day (and the meeting's place) in the grid */
function goMeet(id) {
  const m = S.meets.find((x) => x.id === id);
  if (!m) return;
  if (!inRange(m.date)) { toast('이 약속은 프로젝트 기간 밖이라 시간표에 없어요.'); return; }
  if (S.PLACES.includes(m.place)) { S.place = m.place; store.set(K_PLACE, m.place); }
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
  if (ds.meetEdit) { const m = S.meets.find((x) => x.id === ds.meetEdit); if (m) openMeet(m); return true; }
  if (ds.meetDel) { S.confirmMeet = ds.meetDel; renderMeets(); return true; }
  if (ds.meetDelYes) { deleteMeet(ds.meetDelYes); return true; }
  if (ds.meetDelNo) { S.confirmMeet = null; renderMeets(); return true; }
  if (ds.meetGo) { goMeet(ds.meetGo); return true; }
  if (ds.meetRec) {
    const [k, s, e, ...pl] = ds.meetRec.split('|');
    openMeet({ date: k, start: pad(+s) + ':00', end: +e < 24 ? pad(+e) + ':00' : '', place: pl.join('|') });
    return true;
  }
  if (ds.img) { openLightbox(ds.img); return true; }
  switch (ds.act) {
    case 'meet-new': openMeet({ date: S.sel, start: S.focus && S.focus.k === S.sel ? pad(S.focus.h) + ':00' : '', place: S.place }); return true;
    case 'meet-cancel': closeMeet(); return true;
    case 'meet-img-clear': if (form) { form.img = ''; $('#mImgFile').value = ''; renderDlg(); } return true;
  }
  return false;
}
export function bindMeets() {
  $('#meetForm').addEventListener('submit', (e) => { e.preventDefault(); saveMeet(); });
  $('#mImgFile').addEventListener('change', pickImage);
  $('#lightbox').addEventListener('click', closeLightbox);
}
