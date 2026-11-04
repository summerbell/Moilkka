/* Drawing the board: month calendar, week/day grid, my marks, roster, suggested slots, entry gate */
import { $, WD, EMPTY, FULLN, pad, ymd, fromKey, addDays, TODAY_K, esc, initial, coarse, reduced, withJ } from '../util.js';
import { HOLI } from '../holidays.js';
import {
  S, inRange, weekStartK, monthOf, colsNow, sortedPeople, ids, nameOf, isBase, modeOf, modeLabel, mineStr, strOf, dayKeys,
  counts, xWho, who, bgFor, bgLv, MINE_LV, mineView, canJoin, canPaintHere, xMode, meetHours
} from './state.js';
import { clearXHtml } from './paint.js';
import { renderPlaces } from './places.js';
import { renderMeets } from './meets.js';

const mdLabel = (d) => (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
const dayHead = (d) => mdLabel(d) + '<span class="rw"> (' + WD[d.getDay()] + ')</span>';
const tally = (s, ch) => { let c = 0; for (let i = 0; i < 24; i++) if (s[i] === ch) c++; return c; };
/* '..pppp..' → ['2–6시'] */
function ranges(s, ch) {
  const out = [];
  for (let h = 0; h < 24; h++) {
    if (s[h] !== ch) continue;
    let e = h; while (e + 1 < 24 && s[e + 1] === ch) e++;
    out.push(h + '–' + (e + 1) + '시'); h = e;
  }
  return out;
}

export function renderWho() {
  const el = $('#whoami');
  const adm = S.admin ? '<span class="tag">관리자</span>' : '';
  if (S.me) {
    el.innerHTML = adm + '<span class="av" style="background:var(--p' + (S.colorOf[S.me] || 1) + ')">' + esc(initial(S.myName)) + '</span>' +
      '<span class="wn"><span class="wl">나</span>' + esc(S.myName) + '</span>' +
      '<button type="button" class="link" data-act="leave">닉네임 바꾸기</button>';
  } else {
    el.innerHTML = adm + '<button type="button" class="btn primary" data-act="open-gate">닉네임으로 들어오기</button>';
  }
}

export function renderTabs() {
  const t = $('#tabs');
  t.innerHTML = S.MONTHS.map(([y, m], i) =>
    '<button type="button" role="tab" class="tab" data-tab="' + i + '" aria-selected="' + (i === S.monthIdx) + '"><span class="tm">' + (m + 1) + '월</span><span class="ty">' + y + '</span></button>'
  ).join('');
  /* long projects scroll the tabs sideways; keep the chosen month in view */
  const on = t.children[S.monthIdx];
  if (on && (on.offsetLeft < t.scrollLeft || on.offsetLeft + on.offsetWidth > t.scrollLeft + t.clientWidth)) t.scrollLeft = on.offsetLeft - (t.clientWidth - on.offsetWidth) / 2;
}

export function renderMonth() {
  const [y, m] = S.MONTHS[S.monthIdx];
  const first = new Date(y, m, 1), dim = new Date(y, m + 1, 0).getDate();
  const wk = new Set(S.mode === 'week' ? colsNow() : []);
  const mv = mineView(), mh = meetHours(), meNo = modeOf(S.me) === 'no';
  let h = WD.map((w, i) => '<span class="wdh' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</span>').join('');
  for (let i = 0; i < first.getDay(); i++) h += '<span></span>';
  for (let d = 1; d <= dim; d++) {
    const k = y + '-' + pad(m + 1) + '-' + pad(d), dow = (first.getDay() + d - 1) % 7, hol = HOLI[k], off = !inRange(k);
    let lab = (m + 1) + '월 ' + d + '일 ' + WD[dow] + '요일' + (hol ? ' ' + hol : '') + (mh[k] ? ', 일정 있음' : '');
    let ox = '', strip = '', mex = false;
    if (!off) {
      const xs = xWho(k);
      /* "can't go to this place" crosses out every day; the place bar already says so, so skip my cross there */
      mex = !!S.me && !meNo && xs.includes(S.me);
      if (mv) {
        const s = mineStr(k);
        for (let i = 0; i < 24; i++) strip += '<i style="background:' + (bgLv(s[i] === 'p' ? MINE_LV : 0, s[i] === 'n' ? MINE_LV : 0) || 'transparent') + '"></i>';
        if (s === FULLN) { ox = '<span class="x">✕종일</span>'; lab += ', 내가 종일 불가'; }
        else {
          const pc = tally(s, 'p'), nc = tally(s, 'n');
          ox = (pc ? '<span class="o">○' + pc + '</span>' : '') + (nc ? '<span class="x">✕' + nc + '</span>' : '');
          lab += (pc ? ', 내 선호 ' + pc + '시간' : '') + (nc ? ', 내 불가 ' + nc + '시간' : '');
        }
      } else {
        /* ○ = people with any preferred hour that day, ✕ = people out for the whole day */
        const os = ids().filter((id) => strOf(id, k).includes('p')).length, c = counts(k);
        for (let i = 0; i < 24; i++) strip += '<i style="background:' + (bgFor(c.p[i], c.n[i]) || 'transparent') + '"></i>';
        ox = (os ? '<span class="o">○' + os + '</span>' : '') + (xs.length ? '<span class="x">✕' + xs.length + '</span>' : '');
        lab += (os ? ', 선호 있는 사람 ' + os + '명' : '') + (xs.length ? ', 종일 불가 ' + xs.length + '명' : '');
      }
      if (xMode()) lab += ', 누르면 종일 불가 ' + (mex ? '해제' : '표시');
    }
    const cls = ['md', (dow === 0 || hol) ? 'sun' : '', (dow === 6 && !hol) ? 'sat' : '', k === TODAY_K ? 'today' : '', k === S.sel ? 'sel' : '',
      (wk.has(k) && k !== S.sel) ? 'inweek' : '', mex ? 'mex' : '', mh[k] ? 'hasmeet' : ''].filter(Boolean).join(' ');
    h += '<button type="button" class="' + cls + '" data-day="' + k + '"' + (off ? ' disabled' : '') + ' aria-label="' + lab + '"' + (k === S.sel ? ' aria-current="date"' : '') + '>' +
      '<span class="mdn">' + d + '</span>' + (hol ? '<span class="mdh">' + hol + '</span>' : '') +
      (off ? '' : '<span class="mdc" aria-hidden="true">' + ox + '</span><span class="strip" aria-hidden="true">' + strip + '</span>') + '</button>';
  }
  $('#month').innerHTML = h;
}

function renderLegend() {
  const mv = mineView();
  $('#lgMaxP').textContent = mv ? '내 선호' : '1 → ' + S.MAX + '명';
  $('#lgMaxN').textContent = mv ? '내 불가' : '1 → ' + S.MAX + '명';
  $('#lgOx').textContent = mv ? '날짜별 내 선호 · 불가 시간 수' : '날짜별 선호 시간이 있는 사람 · 종일 불가인 사람 수';
  $('#lgNote').textContent = mv ? '지금은 내가 칠한 것만 보여요. 모두의 표시를 보려면 시간표 위의 ‘모두’를 누르세요.'
    : '칸이 진할수록 같은 표시를 한 사람이 많아요. 날짜 아래 막대는 그날 0시부터 24시까지예요.';
}

/* "내 표시": what I painted at the current place, one line per day */
export function renderMine() {
  const sec = $('#mineSec');
  sec.hidden = !mineView();
  if (sec.hidden) return;
  const m = modeOf(S.me), P = S.place;
  $('#mineTitle').textContent = '내 표시' + (S.PLACES.length > 1 ? ' · ' + P : '');
  const days = m === 'no' ? [] : dayKeys(S.me).filter((k) => inRange(k) && mineStr(k) !== EMPTY).sort();
  let sum = '';
  if (m === 'no') sum = withJ(P, '은', '는') + ' 못 간다고 해 두었어요. 위의 장소 칸에서 바꿀 수 있어요.';
  else if (m === '') sum = withJ(P, '은', '는') + ' 아직 안 정했어요. 위에서 고르거나 시간표에서 바로 칠하세요.';
  else if (m === 'same') sum = withJ(P, '은', '는') + ' ‘' + modeLabel('same') + '’이라 ' + S.PLACES[0] + '에 칠한 시간이 그대로 보여요.';
  else if (days.length) sum = '날짜를 누르면 그날 시간표로 가요.';
  $('#mineSum').textContent = sum;
  $('#mineSum').hidden = !sum;
  $('#mineCount').textContent = days.length ? days.length + '일' : '';
  if (m === 'no') { $('#mineList').innerHTML = ''; return; }
  $('#mineList').innerHTML = !days.length
    ? '<li class="empty">아직 칠한 시간이 없어요. 시간표에서 선호·불가를 칠하면 여기에 날짜별로 정리돼요.</li>'
    : days.map((k) => {
      const s = mineStr(k), go = ranges(s, 'p'), no = ranges(s, 'n');
      const body = s === FULLN ? '<span class="i-no">✕ 종일 불가</span>'
        : (go.length ? '<span class="i-go">선호 ' + go.join(', ') + '</span>' : '') + (no.length ? '<span class="i-no">불가 ' + no.join(', ') + '</span>' : '');
      return '<li><button type="button" class="myrow" data-myday="' + k + '"><span class="rd">' + dayHead(fromKey(k)) + '</span><span class="myh">' + body + '</span></button></li>';
    }).join('');
}

function placeTag(id) {
  if (S.PLACES.length < 2) return '';
  if (isBase(S.place)) return S.PLACES.slice(1).every((pl) => modeOf(id, pl) === 'same') ? '<span class="mtag same">장소 무관</span>' : '';
  const m = modeOf(id);
  return '<span class="mtag ' + (m || 'unset') + '">' + esc(modeLabel(m)) + '</span>';
}
export function renderPeople() {
  const sp = sortedPeople(), P = esc(withJ(S.place, '은', '는'));
  $('#seatCount').textContent = sp.length + ' / ' + S.MAX;
  if (!sp.length) {
    $('#people').innerHTML = '<li class="empty">' + (S.dbState === 'ready' ? '아직 아무도 들어오지 않았어요. 닉네임으로 들어온 사람이 여기에 차례로 앉아요.' : '참여자 목록을 불러오는 중이에요.') + '</li>';
  } else {
    $('#people').innerHTML = sp.map((p) => {
      const m = modeOf(p.id);
      let stat;
      if (m === 'no') stat = '<span class="i-no">' + P + ' 못 가요</span>';
      else if (m === '') stat = P + ' 아직 안 정했어요';
      else {
        let pc = 0, nc = 0, xc = 0;
        dayKeys(p.id).forEach((k) => {
          if (!inRange(k)) return;
          const s = strOf(p.id, k);
          if (s === FULLN) { xc++; return; }
          pc += tally(s, 'p'); nc += tally(s, 'n');
        });
        stat = '<span class="i-go">선호 ' + pc + '시간</span> · <span class="i-no">불가 ' + nc + '시간</span>' + (xc ? ' · <span class="i-no">종일 불가 ' + xc + '일</span>' : '');
      }
      const act = S.confirmDel === p.id
        ? '<span class="confirm"><span>기록까지 지울까요?</span><button type="button" class="mini danger" data-del-yes="' + esc(p.id) + '">지우기</button><button type="button" class="mini" data-del-no="1">취소</button></span>'
        : (canJoin() ? '<button type="button" class="mini ghost" data-del="' + esc(p.id) + '" aria-label="' + esc(p.name) + ' 자리 비우기">자리 비우기</button>' : '');
      return '<li class="person"><span class="av" style="background:var(--p' + S.colorOf[p.id] + ')">' + esc(initial(p.name)) + '</span>' +
        '<span class="pmeta"><span class="pname">' + esc(p.name) + (p.id === S.me ? '<span class="tag">나</span>' : '') + placeTag(p.id) + '</span>' +
        '<span class="pstat">' + stat + '</span></span>' + act + '</li>';
    }).join('');
  }
  const left = Math.max(0, S.MAX - sp.length);
  let row = '';
  for (let i = 0; i < left; i++) row += '<span class="av empty" aria-hidden="true"></span>';
  $('#seatsRow').innerHTML = left ? row + '<span>빈 자리 ' + left + '개</span>' : '<span>자리가 모두 찼어요.</span>';
}

/* slots where two or more people prefer the same hours and nobody is out, found at every place */
export function renderRecs() {
  const multi = S.PLACES.length > 1, found = new Map();
  S.PLACES.forEach((pl) => {
    for (let d = fromKey(S.START_K); ymd(d) <= S.END_K; d = addDays(d, 1)) {
      const k = ymd(d), c = counts(k, pl);
      let h = 0;
      while (h < 24) {
        if (c.p[h] >= 2 && c.n[h] === 0) {
          let e = h;
          while (e + 1 < 24 && c.p[e + 1] === c.p[h] && c.n[e + 1] === 0) e++;
          /* the same slot at several places (people who said "same") is listed once with all its places */
          const key = k + '|' + h + '|' + (e + 1) + '|' + c.p[h], r = found.get(key);
          if (r) r.pls.push(pl); else found.set(key, { k, s: h, e: e + 1, c: c.p[h], pls: [pl] });
          h = e + 1;
        } else h++;
      }
    }
  });
  const out = [...found.values()].sort((a, b) => (b.c - a.c) || ((b.e - b.s) - (a.e - a.s)) || (a.k < b.k ? -1 : a.k > b.k ? 1 : a.s - b.s));
  const top = out.slice(0, 5), total = Math.max(ids().length, 1);
  $('#recHint').textContent = '불가 0명 · 선호 많은 순' + (multi ? ' · 장소별' : '');
  if (!top.length) {
    $('#recs').innerHTML = '<li class="empty">두 명 이상이 같은 시간을 선호하고 그 시간에 불가한 사람이 없으면 여기에 나와요.' + (multi ? ' 장소마다 따로 찾아요.' : '') + '</li>';
    return;
  }
  $('#recs').innerHTML = top.map((r) => {
    const pl = r.pls.includes(S.place) ? S.place : r.pls[0];
    const tags = !multi ? '' : r.pls.length === S.PLACES.length ? '<span class="ptag">모든 장소</span>' : r.pls.map((x) => '<span class="ptag">' + esc(x) + '</span>').join('');
    const all = r.c === total && total >= 2;
    return '<li class="recrow"><button type="button" class="rec" data-rec="' + r.k + '" data-h="' + r.s + '" data-pl="' + esc(pl) + '">' +
      '<span class="rd">' + dayHead(fromKey(r.k)) + tags + '</span>' +
      '<span class="rt">' + pad(r.s) + ':00–' + pad(r.e) + ':00</span>' +
      '<span class="rc">' + (all ? '<span class="all">모두</span>' : '<span class="dotg"></span>') + r.c + '/' + total + '명</span></button>' +
      (S.admin ? '<button type="button" class="mini" data-meet-rec="' + r.k + '|' + r.s + '|' + r.e + '|' + esc(pl) + '" aria-label="이 시간으로 일정 잡기">+ 일정</button>' : '') + '</li>';
  }).join('');
}

export function renderTools() {
  document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool)));
  const gw = $('#gw'), paint = canPaintHere();
  gw.classList.toggle('paint', paint && S.tool !== 'look');
  gw.classList.toggle('look', !paint || S.tool === 'look');
  $('#hint').innerHTML = hint();
  $('#month').classList.toggle('xmode', xMode());
  $('#xhint').hidden = !xMode();
}

function hint() {
  if (!S.me) return '닉네임으로 들어오면 시간을 칠할 수 있어요. 지금은 칸을 눌러 누가 표시했는지 볼 수 있어요.';
  if (S.readonly) return '저장이 거부돼서 칠할 수 없어요. Firestore 규칙을 확인하세요. 칸을 누르면 누가 표시했는지 보여요.';
  const m = modeOf(S.me), P = '<b>' + esc(S.place) + '</b>' + withJ(S.place, '은', '는').slice(-1);
  if (m === 'no') return P + ' 못 간다고 해 두었어요. 칠하려면 위의 장소 칸에서 <b>따로 칠하기</b>를 고르세요. 칸을 누르면 누가 표시했는지 보여요.';
  let pre = '';
  if (S.tool !== 'look' && m === 'same') pre = P + ' 지금 ' + esc(withJ(S.PLACES[0], '과', '와')) + ' 같게 해 두었어요. 여기서 칠하면 ' + esc(S.place) + '만 따로 칠하게 돼요. ';
  else if (S.tool !== 'look' && m === '') pre = P + ' 아직 안 정했어요. 위에서 고르거나 여기서 바로 칠하세요. ';
  const scroll = coarse() ? ' 화면을 내릴 땐 왼쪽 시간 눈금을 잡고 끌거나 <b>보기</b>로 바꾸세요.' : '';
  const clearAll = S.tool === 'xday' ? clearXHtml() : '';
  return pre + {
    pref: '칸을 드래그해 <b>선호 시간</b>을 칠하세요. 이미 초록으로 칠한 칸에서 시작하면 지워져요.' + scroll,
    no: '칸을 드래그해 <b>불가능한 시간</b>을 칠하세요. 이미 빨강으로 칠한 칸에서 시작하면 지워져요.' + scroll,
    xday: '달력의 날짜나 시간표의 아무 칸을 누르면 그날 하루가 통째로 <b>종일 불가(✕)</b>가 돼요. ✕인 날을 다시 누르면 풀려요. 시간표에선 옆으로 드래그해 여러 날을 한 번에 표시할 수 있어요.' + scroll + (clearAll ? '<span class="hact">' + clearAll + '</span>' : ''),
    erase: '드래그한 칸에서 <b>내 표시</b>만 지워요.' + scroll,
    look: '칸을 누르면 누가 표시했는지 보여요. 이 모드에선 화면을 자유롭게 스크롤할 수 있어요.'
  }[S.tool];
}

export function infoHtml(k, h) {
  const d = fromKey(k), w = who(k, h);
  const t = '<b>' + (d.getMonth() + 1) + '/' + d.getDate() + ' (' + WD[d.getDay()] + ') ' + pad(h) + ':00–' + pad(h + 1) + ':00</b>';
  if (!w.p.length && !w.n.length) return t + '<span class="muted">아직 아무도 표시하지 않았어요.</span>';
  const tag = (id) => modeOf(id) === 'no' ? '<span class="xtag">✕' + esc(S.place) + ' 못 감</span>' : strOf(id, k) === FULLN ? '<span class="xtag">✕종일</span>' : '';
  const list = (arr) => arr.map((id) => esc(nameOf(id)) + (id === S.me ? '(나)' : '') + tag(id)).join(', ');
  let s = t;
  if (w.p.length) s += '<span class="i-go">선호 ' + w.p.length + '명</span> ' + list(w.p) + ' ';
  if (w.n.length) s += '<span class="i-no">불가 ' + w.n.length + '명</span> ' + list(w.n);
  return s;
}
export function refreshInfo() {
  $('#info').innerHTML = S.focus ? infoHtml(S.focus.k, S.focus.h) : '<span class="muted">칸을 고르면 그 시간에 누가 선호하고 누가 안 되는지 여기에 나와요.</span>';
}

function chipsHtml(w) {
  const one = (id, cls) => '<span class="chip ' + cls + (id === S.me ? ' me' : '') + '"><i style="background:var(--p' + (S.colorOf[id] || 1) + ')"></i>' + esc(nameOf(id)) + '</span>';
  return w.p.map((id) => one(id, 'cp')).join('') + w.n.map((id) => one(id, 'cn')).join('');
}

export function renderDetail() {
  const cols = colsNow(), d0 = fromKey(cols[0]), d1 = fromKey(cols[cols.length - 1]);
  const tail = (S.PLACES.length > 1 ? ' · ' + S.place : '') + (mineView() ? ' · 내 표시만' : '');
  if (S.mode === 'week') {
    $('#dEyebrow').textContent = d0.getFullYear() + ' · 주간 보기' + tail;
    $('#dTitle').textContent = mdLabel(d0) + ' – ' + (d1.getMonth() !== d0.getMonth() ? (d1.getMonth() + 1) + '월 ' : '') + d1.getDate() + '일';
  } else {
    const hol = HOLI[S.sel];
    const xn = inRange(S.sel) && !mineView() ? xWho(S.sel).length : 0;
    $('#dEyebrow').textContent = d0.getFullYear() + ' · 하루 보기' + tail + (hol ? ' · ' + hol : '') + (xn ? ' · 종일 불가 ' + xn + '명' : '');
    $('#dTitle').textContent = mdLabel(d0) + ' ' + WD[d0.getDay()] + '요일';
  }
  $('#prev').disabled = S.mode === 'week' ? weekStartK(S.sel) <= S.START_K : S.sel <= S.START_K;
  $('#next').disabled = S.mode === 'week' ? ymd(addDays(fromKey(weekStartK(S.sel)), 6)) >= S.END_K : S.sel >= S.END_K;
  $('#todayBtn').hidden = !inRange(TODAY_K);
  $('#mWeek').setAttribute('aria-pressed', String(S.mode === 'week'));
  $('#mDay').setAttribute('aria-pressed', String(S.mode === 'day'));
  $('#vAll').setAttribute('aria-pressed', String(!mineView()));
  $('#vMine').setAttribute('aria-pressed', String(mineView()));
  $('#vMine').disabled = !S.me;
  $('#vMine').title = S.me ? '' : '닉네임으로 들어오면 내 표시만 볼 수 있어요';

  const mh = meetHours(), mv = mineView();
  let h = '';
  if (S.mode === 'week') {
    h += '<div class="ghead"><span></span>' + cols.map((k) => {
      const d = fromKey(k), dow = d.getDay(), hol = HOLI[k];
      const cls = ['dh', (dow === 0 || hol) ? 'sun' : '', (dow === 6 && !hol) ? 'sat' : '', k === TODAY_K ? 'today' : '', k === S.sel ? 'sel' : '', mh[k] ? 'hasmeet' : ''].filter(Boolean).join(' ');
      const xn = inRange(k) && !mv ? xWho(k).length : 0;
      return '<button type="button" class="' + cls + '" data-dayview="' + k + '"' + (inRange(k) ? '' : ' disabled') + ' aria-label="' + mdLabel(d) + ' 하루 보기' + (xn ? ', 종일 불가 ' + xn + '명' : '') + (mh[k] ? ', 일정 있음' : '') + '"' + (hol ? ' title="' + hol + '"' : '') + '><span class="dw">' + WD[dow] + (xn ? '<span class="dx">✕' + xn + '</span>' : '') + '</span><span class="dd">' + d.getDate() + '</span></button>';
    }).join('') + '</div>';
  }
  h += '<div class="gbody ' + S.mode + '" aria-label="' + (S.mode === 'week' ? '주간' : '하루') + ' 시간표">';
  for (let hr = 0; hr < 24; hr++) {
    h += '<div class="lab' + (hr % 6 === 0 ? ' six' : '') + '">' + pad(hr) + (S.mode === 'day' ? ':00' : '') + '</div>';
    cols.forEach((k, c) => {
      const off = !inRange(k), mt = mh[k] && mh[k].has(hr);
      h += '<div class="c' + (hr < 7 ? ' nt' : '') + (off ? ' off' : '') + (mt ? ' mt' : '') + '" data-k="' + k + '" data-h="' + hr + '" data-c="' + c + '">' + (S.mode === 'day' ? '<div class="chips"></div>' : '') + '</div>';
    });
  }
  h += '</div>';
  $('#gw').innerHTML = h;
  updateCells();
}

export function updateCells() {
  const cache = {}, mv = mineView();
  document.querySelectorAll('#gw .c').forEach((el) => {
    if (el.classList.contains('off')) return;
    const k = el.dataset.k, h = +el.dataset.h;
    const m = S.me ? mineStr(k)[h] : '.';
    if (mv) el.style.background = bgLv(m === 'p' ? MINE_LV : 0, m === 'n' ? MINE_LV : 0);
    else { const cnt = cache[k] || (cache[k] = counts(k)); el.style.background = bgFor(cnt.p[h], cnt.n[h]); }
    el.classList.toggle('mp', !mv && m === 'p');
    el.classList.toggle('mn', !mv && m === 'n');
    el.classList.toggle('fx', !!S.focus && S.focus.k === k && S.focus.h === h);
    if (S.mode === 'day' && el.firstElementChild) {
      const w = who(k, h), only = (arr) => arr.filter((id) => id === S.me);
      el.firstElementChild.innerHTML = chipsHtml(mv ? { p: only(w.p), n: only(w.n) } : w);
    }
  });
}

export function renderSave() {
  const el = $('#save');
  if (!S.me) { el.textContent = ''; return; }
  if (S.saveState === 'saving') el.textContent = '저장 중…';
  else if (S.saveState === 'saved') el.textContent = '저장됨 · ' + S.saveAt + ' · 모두에게 바로 보여요';
  else if (S.saveState === 'error') el.textContent = '마지막 변경을 저장하지 못했어요';
  else el.textContent = '칠하는 즉시 저장되고 모두에게 보여요';
}

export function renderGate() {
  const g = $('#gate');
  g.hidden = !S.gateOpen;
  if (!S.gateOpen) return;
  const sp = sortedPeople(), ok = canJoin();
  let seats = sp.map((p) =>
    '<button type="button" class="seat filled" data-join="' + esc(p.id) + '"' + (ok ? '' : ' disabled') + ' aria-label="' + esc(p.name) + '(으)로 다시 들어오기"><span class="av" style="background:var(--p' + S.colorOf[p.id] + ')">' + esc(initial(p.name)) + '</span><span class="sn">' + esc(p.name) + '</span></button>'
  ).join('');
  for (let i = sp.length; i < S.MAX; i++) seats += '<span class="seat"><span class="av empty"></span><span class="sn">빈 자리</span></span>';
  $('#gateSeats').innerHTML = seats;
  let st = '';
  if (S.dbState === 'connecting') st = '참여자 목록을 불러오는 중…';
  else if (S.dbState === 'slow') st = '저장소 응답이 늦어요. 네트워크를 확인하고 잠시만 기다려 주세요.';
  else if (S.dbState === 'off') st = 'Firebase에 연결할 수 없어요. config.js의 설정값과 인터넷 연결을 확인하세요.';
  else if (S.dbState === 'denied') st = 'Firestore 규칙이 읽기를 막고 있어요. firestore.rules 내용을 Firebase 콘솔의 규칙 탭에 게시하세요.';
  else if (S.dbState === 'error') st = '저장소 연결이 끊겼어요. 페이지를 새로 열어 주세요.';
  else if (S.readonly) st = '저장이 거부됐어요. firestore.rules 내용을 Firebase 콘솔의 규칙 탭에 게시했는지 확인하세요.';
  else if (sp.length >= S.MAX) st = S.MAX + '자리가 모두 찼어요. 위에서 내 자리를 눌러 들어오세요.';
  else st = (S.MAX - sp.length) + '자리 남았어요.';
  $('#gateStatus').textContent = st;
  $('#gateMsg').textContent = S.gateMsg;
  $('#joinBtn').disabled = !ok || S.joining;
  $('#nick').disabled = !ok;
  $('#joinBtn').textContent = S.joining ? '들어가는 중…' : '들어가기';
}

export function renderAll() {
  if (!S.proj) return;
  S.colorOf = {};
  sortedPeople().forEach((p, i) => { S.colorOf[p.id] = (i % 6) + 1; });
  if (S.me && !S.colorOf[S.me]) S.colorOf[S.me] = (S.people.size % 6) + 1;
  /* mid-drag, nothing above the grid may change height (the place bar and hint do when a place gets its own layer),
     or the cells would slide under the pointer; the drop redraws everything */
  if (S.drag) { renderMonth(); renderMine(); renderPeople(); renderRecs(); updateCells(); refreshInfo(); renderSave(); return; }
  renderWho(); renderMeets(); renderPlaces(); renderTabs(); renderMonth(); renderLegend(); renderMine(); renderPeople(); renderRecs(); renderTools();
  renderDetail();
  refreshInfo(); renderSave(); renderGate();
}

/* ---------- moving around ---------- */
export function select(k) {
  S.sel = k; S.monthIdx = monthOf(k);
  if (S.focus && !colsNow().includes(S.focus.k)) S.focus = null;
  renderAll();
}
export function step(dir) {
  let k = ymd(addDays(fromKey(S.sel), dir * (S.mode === 'week' ? 7 : 1)));
  if (k < S.START_K) k = S.START_K;
  if (k > S.END_K) k = S.END_K;
  select(k);
}
export function scrollToDetail() { $('#detail').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }
