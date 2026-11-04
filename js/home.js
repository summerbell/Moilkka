/* Project list (no ?p=): admins sign in with Google to create, link and delete projects;
   everyone else sees the projects this browser has opened before. */
import { $, BASE, TODAY_K, ymd, fromKey, dot, esc, newId, toast, copyText } from './util.js';
import { readProject, recents, forget, splitPlaces, placesError, cleanPlaces } from './projects.js';

let DB = null;
let authState = 'unknown', user = null, admin = false, homeErr = '';
let plist = [], plistState = 'loading', stopList = null, creating = false, createMsg = '', confirmProj = null;
const deleting = new Set();

export function init() {
  const n = new Date();
  $('#cStart').value = TODAY_K;
  $('#cEnd').value = ymd(new Date(n.getFullYear(), n.getMonth() + 3, 0));
  $('#home').hidden = false;
  document.addEventListener('click', onClick);
  $('#createForm').addEventListener('submit', (e) => { e.preventDefault(); createProject(); });
  renderHome();
}
export function fail(msg) { homeErr = msg; renderHome(); }

export function start(db) {
  DB = db;
  /* try-it-alone mode has no accounts: this browser is the admin */
  if (DB.local) { authState = 'local'; admin = true; watchProjects(); renderHome(); return; }
  DB.auth.onChange(async (u) => {
    if (stopList) { stopList(); stopList = null; }
    user = u || null; admin = false; plist = []; homeErr = '';
    authState = user ? 'checking' : 'out';
    renderHome();
    if (!user) return;
    const cur = user;
    try { admin = (await DB.collection('admins').doc(cur.uid).get()).exists; }
    catch (e) { homeErr = '관리자 정보를 읽지 못했어요. firestore.rules 내용을 Firebase 콘솔의 규칙 탭에 게시했는지 확인하세요.'; }
    if (user !== cur) return;
    authState = 'in';
    if (admin) watchProjects();
    renderHome();
  });
}

function watchProjects() {
  plistState = 'loading';
  stopList = DB.collection('projects').onSnapshot((snap) => {
    plist = snap.docs.map((d) => readProject(d.id, d.data())).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
    if (!snap.metadata.fromCache) plistState = 'ready';
    renderHome();
  }, (e) => { plistState = (e && e.code === 'not_granted') ? 'denied' : 'error'; renderHome(); });
}

function homeInfo() {
  let h = '<h2>링크로 들어오세요</h2><p class="lead">모일까는 프로젝트마다 따로 시간을 모아요. 받은 프로젝트 링크를 열면 닉네임만 정하고 바로 칠할 수 있어요.</p>';
  if (homeErr) h += '<p class="note err">' + esc(homeErr) + '</p>';
  if (authState === 'checking') h += '<p class="note">관리자 권한을 확인하는 중…</p>';
  else if (authState === 'in' && !admin) {
    h += '<div class="note"><b>이 계정은 아직 관리자가 아니에요.</b> Firebase 콘솔 → Firestore Database → 데이터에서 <code>admins</code> 컬렉션을 만들고, 아래 UID를 문서 ID로 하는 문서를 하나 추가한 뒤 새로고침하세요.' +
      '<span class="uidrow"><code class="uid">' + esc(user.uid) + '</code><button type="button" class="mini" data-act="copy-uid">복사</button></span></div>';
  }
  return h;
}
function projRow(p, manage) {
  let act = '';
  if (manage) {
    act = deleting.has(p.id) ? '<span class="confirm">지우는 중…</span>'
      : confirmProj === p.id
        ? '<span class="confirm"><span>기록까지 모두 지울까요?</span><button type="button" class="mini danger" data-pdel-yes="' + esc(p.id) + '">지우기</button><button type="button" class="mini" data-pdel-no="1">취소</button></span>'
        : '<span class="pacts"><button type="button" class="mini" data-copy="' + esc(p.id) + '">링크 복사</button><button type="button" class="mini ghost" data-pdel="' + esc(p.id) + '" aria-label="' + esc(p.title) + ' 지우기">지우기</button></span>';
  }
  return '<li class="proj"><a class="pmeta plink" href="?p=' + encodeURIComponent(p.id) + '"><span class="pname">' + esc(p.title) + '</span>' +
    '<span class="pstat"><span class="nw">' + esc(dot(p.start)) + ' — ' + esc(dot(p.end)) + '</span> · <span class="nw">최대 ' + (Number(p.max) || 6) + '명</span>' +
    (p.places ? ' · <span class="nw">' + esc(p.places.join('·')) + '</span>' : '') + '</span></a>' + act + '</li>';
}
function renderHome() {
  const manage = admin && (authState === 'in' || authState === 'local');
  const w = $('#whoami');
  if (authState === 'out') w.innerHTML = '<button type="button" class="link" data-act="login">관리자 로그인</button>';
  else if (user) w.innerHTML = '<span class="wn"><span class="wl">' + (manage ? '관리자' : '로그인') + '</span>' + esc(user.email || user.displayName || '') + '</span><button type="button" class="link" data-act="logout">로그아웃</button>';
  else w.innerHTML = '';
  $('#hCreate').hidden = !manage;
  $('#hInfo').hidden = manage;
  if (!manage) $('#hInfo').innerHTML = homeInfo();
  $('#cMsg').textContent = createMsg;
  $('#cBtn').disabled = creating;
  $('#cBtn').textContent = creating ? '만드는 중…' : '만들기';
  $('#hListTitle').textContent = manage ? '프로젝트' : '최근 연 프로젝트';
  const items = manage ? plist : recents();
  $('#hCount').textContent = manage && plistState === 'ready' ? items.length + '개' : '';
  let empty = '';
  if (manage && plistState === 'denied') empty = 'Firestore 규칙이 프로젝트 목록을 막고 있어요. firestore.rules 내용을 다시 게시하세요.';
  else if (manage && plistState === 'error') empty = '목록을 불러오지 못했어요. 페이지를 새로 열어 주세요.';
  else if (!items.length) empty = manage ? (plistState === 'ready' ? '아직 프로젝트가 없어요. 새 프로젝트를 만들어 보세요.' : '프로젝트를 불러오는 중이에요.') : '아직 연 프로젝트가 없어요. 받은 링크로 들어오면 여기에 남아요.';
  $('#projList').innerHTML = empty ? '<li class="empty">' + empty + '</li>' : items.map((p) => projRow(p, manage)).join('');
}

async function login() {
  homeErr = ''; renderHome();
  try { await DB.auth.signIn(); }
  catch (e) {
    const c = e && e.code;
    if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return;
    homeErr = {
      'auth/unauthorized-domain': '이 주소(' + location.hostname + ')가 Firebase 승인 도메인에 없어요. Authentication → 설정 → 승인된 도메인에 추가하세요.',
      'auth/operation-not-allowed': 'Google 로그인이 꺼져 있어요. Firebase 콘솔 Authentication → 로그인 방법에서 Google을 사용 설정하세요.',
      'auth/popup-blocked': '팝업이 막혔어요. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.'
    }[c] || '로그인하지 못했어요. 잠시 후 다시 시도하세요.';
    renderHome();
  }
}
function logout() {
  if (stopList) { stopList(); stopList = null; }
  DB.auth.signOut();
}

async function createProject() {
  const title = $('#cTitle').value.trim().replace(/\s+/g, ' ');
  const start = $('#cStart').value, end = $('#cEnd').value, max = Math.round(Number($('#cMax').value));
  const parts = splitPlaces($('#cPlaces').value);
  const fail = (m) => { createMsg = m; renderHome(); };
  if (!DB) return fail('아직 저장소에 연결되지 않았어요. 잠시 후 다시 눌러 주세요.');
  if (!title) return fail('프로젝트 이름을 입력하세요.');
  if (!start || !end) return fail('시작일과 종료일을 고르세요.');
  if (start > end) return fail('종료일이 시작일보다 빨라요.');
  if (Math.round((fromKey(end) - fromKey(start)) / 864e5) + 1 > 366) return fail('기간은 1년까지 잡을 수 있어요.');
  if (!(max >= 2 && max <= 12)) return fail('최대 인원은 2명에서 12명 사이로 정하세요.');
  const perr = placesError(parts);
  if (perr) return fail(perr);
  creating = true; createMsg = ''; renderHome();
  try {
    await DB.collection('projects').doc(newId()).set({ title, start, end, max, places: cleanPlaces(parts), createdAt: Date.now(), owner: user ? user.uid : 'local' });
    $('#cTitle').value = '';
    toast('‘' + title + '’ 프로젝트를 만들었어요. 목록에서 링크를 복사해 보내세요.');
  } catch (e) {
    createMsg = (e && e.code === 'not_granted') ? '만들기가 거부됐어요. 관리자 계정인지, 최신 firestore.rules를 게시했는지 확인하세요.' : '만들지 못했어요. 잠시 후 다시 시도하세요.';
  }
  creating = false; renderHome();
}
async function deleteProject(id) {
  confirmProj = null; deleting.add(id); renderHome();
  try {
    /* people and meetings first, so a half-finished delete can simply be retried */
    for (const sub of ['people', 'meets']) {
      const col = DB.collection('projects/' + id + '/' + sub);
      const snap = await col.get();
      await Promise.all(snap.docs.map((d) => col.doc(d.id).delete()));
    }
    await DB.collection('projects').doc(id).delete();
    forget(id);
    toast('프로젝트를 지웠어요.');
  } catch (e) {
    toast('프로젝트를 지우지 못했어요. 관리자 계정과 Firestore 규칙을 확인하세요.');
  }
  deleting.delete(id); renderHome();
}

function onClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  const ds = t.dataset;
  if (ds.copy) { copyText(BASE + '?p=' + ds.copy, '링크를 복사했어요. 참여자에게 보내세요.'); return; }
  if (ds.pdel) { confirmProj = ds.pdel; renderHome(); return; }
  if (ds.pdelYes) { deleteProject(ds.pdelYes); return; }
  if (ds.pdelNo) { confirmProj = null; renderHome(); return; }
  switch (ds.act) {
    case 'login': if (DB) login(); break;
    case 'logout': logout(); break;
    case 'copy-uid': if (user) copyText(user.uid, 'UID를 복사했어요.'); break;
  }
}
