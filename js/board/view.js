/* Drawing the board: month calendar, week/day grid, brushes, my marks, roster, suggested slots, entry gate */
import { $, WD, EMPTY, FULLN, pad, ymd, fromKey, addDays, TODAY_K, esc, initial, coarse, reduced } from '../util.js';
import { HOLI } from '../holidays.js';
import {
  S, inRange, weekStartK, monthOf, colsNow, sortedPeople, ids, nameOf, mineStr, strOf, dayKeys, tally, xWho, who,
  ALL, maskOf, hasPlace, missesPlace, placeVar, placeInk, maskBg, maskInk, maskLabel, cellBg, mineBg, bgLv,
  mineView, canJoin, canPaint, xMode, meetHours
} from './state.js';
import { clearXHtml } from './paint.js';
import { renderPlaces } from './places.js';
import { renderMeets } from './meets.js';

const mdLabel = (d) => (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
const dayHead = (d) => mdLabel(d) + '<span class="rw"> (' + WD[d.getDay()] + ')</span>';
const multi = () => S.PLACES.length > 1;
/* the place the board is about: the lens, or the only place there is */
const lensPlace = () => (S.lens >= 0 ? S.lens : multi() ? -1 : 0);
const dot = (bg) => '<i class="pdot" style="background:' + bg + '"></i>';
/* '..1111..' → [['1', 2, 6]] */
function runs(s) {
  const out = [];
  for (let h = 0; h < 24; h++) {
    const c = s[h]; if (c === '.') continue;
    let e = h; while (e + 1 < 24 && s[e + 1] === c) e++;
    out.push([c, h, e + 1]); h = e;
  }
  return out;
}
/* people with any hour at each place that day */
function dayCounts(k) {
  const c = S.PLACES.map(() => 0);
  ids().forEach((id) => {
    let mk = 0;
    for (const ch of strOf(id, k)) mk |= maskOf(ch);
    S.PLACES.forEach((_, i) => { if (mk & (1 << i)) c[i]++; });
  });
  return c;
}
const digits = (arr) => arr.map((x, i) => '<i' + (x ? ' style="color:' + placeInk(i) + '"' : ' class="z"') + '>' + x + '</i>').join('·');

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
  const mv = mineView(), mh = meetHours(), L = lensPlace();
  let h = WD.map((w, i) => '<span class="wdh' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</span>').join('');
  for (let i = 0; i < first.getDay(); i++) h += '<span></span>';
  for (let d = 1; d <= dim; d++) {
    const k = y + '-' + pad(m + 1) + '-' + pad(d), dow = (first.getDay() + d - 1) % 7, hol = HOLI[k], off = !inRange(k);
    let lab = (m + 1) + '월 ' + d + '일 ' + WD[dow] + '요일' + (hol ? ' ' + hol : '') + (mh[k] ? ', 일정 있음' : '');
    let ox = '', strip = '', mex = false;
    if (!off) {
      const xs = xWho(k);
      mex = !!S.me && xs.includes(S.me);
      const xtxt = xs.length ? '<span class="x">✕' + xs.length + '</span>' : '';
      if (mv) {
        const s = mineStr(k);
        for (let i = 0; i < 24; i++) strip += '<i style="background:' + (mineBg(s[i]) || 'transparent') + '"></i>';
        if (s === FULLN) { ox = '<span class="x">✕종일</span>'; lab += ', 내가 종일 불가'; }
        else {
          let pc = 0, nc = 0;
          for (const c of s) { if (c === 'n') nc++; else if (c !== '.') pc++; }
          ox = (pc ? '<span class="o">○' + pc + '</span>' : '') + (nc ? '<span class="x">✕' + nc + '</span>' : '');
          lab += (pc ? ', 내가 되는 시간 ' + pc + '시간' : '') + (nc ? ', 내 불가 ' + nc + '시간' : '');
        }
      } else {
        const t = tally(k), dc = dayCounts(k);
        for (let i = 0; i < 24; i++) strip += '<i style="background:' + (cellBg(t, i) || 'transparent') + '"></i>';
        if (L >= 0) {
          /* ○ = people who can make this place some time that day, ✕ = people out for the whole day */
          ox = (dc[L] ? '<span class="o">○' + dc[L] + '</span>' : '') + xtxt;
          lab += (dc[L] ? ', 올 수 있는 사람 ' + dc[L] + '명' : '');
        } else {
          ox = (dc.some(Boolean) ? '<span class="pc">' + digits(dc) + '</span>' : '') + xtxt;
          lab += dc.some(Boolean) ? ', ' + S.PLACES.map((pl, i) => pl + ' ' + dc[i] + '명').join(', ') : '';
        }
        lab += xs.length ? ', 종일 불가 ' + xs.length + '명' : '';
      }
      if (xMode()) lab += ', 누르면 종일 불가 ' + (mex ? '해제' : '표시');
    }
    const cls = ['md', (dow === 0 || hol) ? 'sun' : '', (dow === 6 && !hol) ? 'sat' : '', k === TODAY_K ? 'today' : '', k === S.sel ? 'sel' : '',
      (wk.has(k) && k !== S.sel) ? 'inweek' : '', mex ? 'mex' : '', mh[k] ? 'hasmeet' : ''].filter(Boolean).join(' ');
    h += '<button type="button" class="' + cls + '" data-day="' + k + '"' + (off ? ' disabled' : '') + ' aria-label="' + esc(lab) + '"' + (k === S.sel ? ' aria-current="date"' : '') + '>' +
      '<span class="mdn">' + d + '</span>' + (hol ? '<span class="mdh">' + hol + '</span>' : '') +
      (off ? '' : '<span class="mdc" aria-hidden="true">' + ox + '</span><span class="strip" aria-hidden="true">' + strip + '</span>') + '</button>';
  }
  $('#month').innerHTML = h;
}

function renderLegend() {
  const mv = mineView(), L = lensPlace(), P = esc(S.PLACES[Math.max(0, L)]);
  const item = (sw, label) => '<span class="lgp">' + sw + label + '</span>';
  const common = '<div class="lg-row">' + item('<span class="sw ring"></span>', '내가 칠한 칸') + item('<span class="sw xsw"></span>', '내가 종일 불가로 표시한 날') + item('<span class="sw meetsw"></span>', '일정 잡힌 날·시간') + '</div>';
  const places = S.PLACES.map((pl, i) => '<span class="lgp">' + dot(placeVar(i)) + esc(pl) + '</span>').join('');
  let h;
  if (mv) {
    h = '<div class="lg-row"><b>내 표시</b>' + (multi() ? places + '<span class="lgp">' + dot('var(--g4)') + '어디든</span>' : '<span class="lgp">' + dot('var(--go)') + '가능</span>') +
      '<span class="lgp">' + dot(bgLv(0, 4)) + '불가</span></div>' +
      '<div class="lg-row"><span class="mono"><span class="i-go">○3</span> <span class="i-no">✕1</span></span>날짜별 내가 되는 시간 · 안 되는 시간 수</div>' +
      '<p>지금은 내가 칠한 것만 보여요. 여러 장소를 겹쳐 칠한 칸은 그 장소 색이 나눠져 보여요. 모두의 표시를 보려면 시간표 위의 ‘모두’를 누르세요.</p>';
  } else if (L < 0) {
    h = '<div class="lg-row"><b>장소</b>' + places + '<span class="lgp">' + dot('var(--g4)') + '어디나 같음</span></div>' +
      '<div class="lg-row"><span class="mono lgd">' + digits(S.PLACES.map((_, i) => i + 2)) + '</span>칸마다 ' + S.PLACES.map(esc).join('·') + '에 올 수 있는 사람 수 (주 보기)</div>' + common +
      '<div class="lg-row"><span class="sw" style="background:' + bgLv(0, 4) + '"></span>아무 데도 못 오는 사람만 있는 칸</div>' +
      '<p>칸 색은 그 시간에 가장 많이 올 수 있는 장소예요(모든 장소가 같으면 초록). 진할수록 많이 와요. 날짜 아래 숫자는 그날 장소별로 올 수 있는 사람 수예요.</p>';
  } else {
    const ramp = (pre) => '<span class="ramp">' + [1, 2, 3, 4, 5, 6].map((i) => '<i style="background:' + (pre === 'g' ? 'var(--g' + i + ')' : bgLv(0, i)) + '"></i>').join('') + '</span>';
    h = '<div class="lg-row"><b>가능</b>' + ramp('g') + '<span class="mono">1 → ' + S.MAX + '명</span></div>' +
      '<div class="lg-row"><b>불가</b>' + ramp('r') + '<span class="mono">1 → ' + S.MAX + '명</span></div>' +
      '<div class="lg-row"><span class="sw split"></span>올 수 있는 사람과 못 오는 사람이 섞인 칸</div>' + common +
      '<div class="lg-row"><span class="mono"><span class="i-go">○3</span> <span class="i-no">✕1</span></span>날짜별 ' + (multi() ? P + '에 ' : '') + '올 수 있는 사람 · 종일 불가인 사람 수</div>' +
      '<p>' + (multi() ? P + '에 올 수 있는 사람만 셌어요. ' : '') + '칸이 진할수록 같은 표시를 한 사람이 많아요. 날짜 아래 막대는 그날 0시부터 24시까지예요.</p>';
  }
  $('#legend').innerHTML = h;
}

/* "내 표시": what I painted, one line per day */
export function renderMine() {
  const sec = $('#mineSec');
  sec.hidden = !mineView();
  if (sec.hidden) return;
  const days = dayKeys(S.me).filter((k) => inRange(k) && mineStr(k) !== EMPTY).sort();
  $('#mineSum').textContent = days.length ? '날짜를 누르면 그날 시간표로 가요.' : '';
  $('#mineSum').hidden = !days.length;
  $('#mineCount').textContent = days.length ? days.length + '일' : '';
  $('#mineList').innerHTML = !days.length
    ? '<li class="empty">아직 칠한 시간이 없어요. 시간표에서 붓을 골라 칠하면 여기에 날짜별로 정리돼요.</li>'
    : days.map((k) => {
      const s = mineStr(k);
      const body = s === FULLN ? '<span class="i-no">✕ 종일 불가</span>'
        : runs(s).map(([c, a, b]) => '<span class="myr">' + dot(c === 'n' ? bgLv(0, 4) : maskBg(maskOf(c), 6)) + (c === 'n' ? '불가' : esc(maskLabel(maskOf(c)))) + ' ' + a + '–' + b + '시</span>').join('');
      return '<li><button type="button" class="myrow" data-myday="' + k + '"><span class="rd">' + dayHead(fromKey(k)) + '</span><span class="myh">' + body + '</span></button></li>';
    }).join('');
}

export function renderPeople() {
  const sp = sortedPeople();
  $('#seatCount').textContent = sp.length + ' / ' + S.MAX;
  if (!sp.length) {
    $('#people').innerHTML = '<li class="empty">' + (S.dbState === 'ready' ? '아직 아무도 들어오지 않았어요. 닉네임으로 들어온 사람이 여기에 차례로 앉아요.' : '참여자 목록을 불러오는 중이에요.') + '</li>';
  } else {
    $('#people').innerHTML = sp.map((p) => {
      const hp = S.PLACES.map(() => 0);
      let nc = 0, xc = 0;
      dayKeys(p.id).forEach((k) => {
        if (!inRange(k)) return;
        const s = strOf(p.id, k);
        if (s === FULLN) { xc++; return; }
        for (const c of s) { if (c === 'n') nc++; else S.PLACES.forEach((_, i) => { if (hasPlace(c, i)) hp[i]++; }); }
      });
      const can = multi() ? S.PLACES.map((pl, i) => '<span class="hp">' + dot(placeVar(i)) + esc(pl) + ' ' + hp[i] + '</span>').join(' ') : '<span class="i-go">가능 ' + hp[0] + '시간</span>';
      const stat = can + ' · <span class="i-no">불가 ' + nc + '시간</span>' + (xc ? ' · <span class="i-no">종일 불가 ' + xc + '일</span>' : '');
      const act = S.confirmDel === p.id
        ? '<span class="confirm"><span>기록까지 지울까요?</span><button type="button" class="mini danger" data-del-yes="' + esc(p.id) + '">지우기</button><button type="button" class="mini" data-del-no="1">취소</button></span>'
        : (canJoin() ? '<button type="button" class="mini ghost" data-del="' + esc(p.id) + '" aria-label="' + esc(p.name) + ' 자리 비우기">자리 비우기</button>' : '');
      return '<li class="person"><span class="av" style="background:var(--p' + S.colorOf[p.id] + ')">' + esc(initial(p.name)) + '</span>' +
        '<span class="pmeta"><span class="pname">' + esc(p.name) + (p.id === S.me ? '<span class="tag">나</span>' : '') + '</span>' +
        '<span class="pstat">' + stat + '</span></span>' + act + '</li>';
    }).join('');
  }
  const left = Math.max(0, S.MAX - sp.length);
  let row = '';
  for (let i = 0; i < left; i++) row += '<span class="av empty" aria-hidden="true"></span>';
  $('#seatsRow').innerHTML = left ? row + '<span>빈 자리 ' + left + '개</span>' : '<span>자리가 모두 찼어요.</span>';
}

/* slots where two or more people can make the same place, best place first; comparing places, each slot names
   the place most people can make and how the others do */
export function renderRecs() {
  const L = lensPlace(), pls = L >= 0 ? [L] : S.PLACES.map((_, i) => i), out = [];
  for (let d = fromKey(S.START_K); ymd(d) <= S.END_K; d = addDays(d, 1)) {
    const k = ymd(d), t = tally(k);
    const vec = (h) => pls.map((i) => t.a[i][h]).join(','), best = (h) => Math.max(...pls.map((i) => t.a[i][h]));
    let h = 0;
    while (h < 24) {
      const c = best(h);
      if (c >= 2) {
        let e = h;
        while (e + 1 < 24 && vec(e + 1) === vec(h)) e++;
        out.push({ k, s: h, e: e + 1, c, win: pls.filter((i) => t.a[i][h] === c), v: S.PLACES.map((_, i) => t.a[i][h]) });
        h = e + 1;
      } else h++;
    }
  }
  out.sort((a, b) => (b.c - a.c) || ((b.e - b.s) - (a.e - a.s)) || (a.k < b.k ? -1 : a.k > b.k ? 1 : a.s - b.s));
  const top = out.slice(0, 5), total = Math.max(ids().length, 1);
  $('#recHint').textContent = !multi() ? '많이 올 수 있는 순' : L < 0 ? '시간마다 가장 많이 오는 장소' : S.PLACES[L] + ' 기준 · 많이 올 수 있는 순';
  if (!top.length) {
    $('#recs').innerHTML = '<li class="empty">두 명 이상이 같은 시간에 ' + (multi() ? '같은 장소로 ' : '') + '올 수 있으면 여기에 나와요.</li>';
    return;
  }
  const tag = (i) => '<span class="ptag pl">' + dot(placeVar(i)) + esc(S.PLACES[i]) + '</span>';
  $('#recs').innerHTML = top.map((r) => {
    const pl = S.PLACES[r.win[0]], all = r.c === total && total >= 2;
    const others = L < 0 ? S.PLACES.map((_, i) => i).filter((i) => !r.win.includes(i)).map((i) => esc(S.PLACES[i]) + ' ' + r.v[i]).join(' · ') : '';
    return '<li class="recrow"><button type="button" class="rec" data-rec="' + r.k + '" data-h="' + r.s + '">' +
      '<span class="rd">' + dayHead(fromKey(r.k)) + '</span>' +
      '<span class="rt">' + pad(r.s) + ':00–' + pad(r.e) + ':00</span>' +
      '<span class="rc">' + (all ? '<span class="all">모두</span>' : '<span class="dotg"></span>') + r.c + '/' + total + '명</span>' +
      (multi() ? '<span class="rp">' + r.win.map(tag).join('') + (others ? '<span class="ro">' + others + '</span>' : '') + '</span>' : '') + '</button>' +
      (S.admin ? '<button type="button" class="mini" data-meet-rec="' + r.k + '|' + r.s + '|' + r.e + '|' + esc(pl) + '" aria-label="이 시간으로 일정 잡기">+ 일정</button>' : '') + '</li>';
  }).join('');
}

/* brushes: one per place (plus "어디든" when there are several), then 불가 / 종일 불가 / 지우기 / 보기 */
export function renderTools() {
  const P = S.PLACES.length;
  const tools = S.PLACES.map((_, i) => 'pl' + i).concat(P > 1 ? ['any'] : [], ['no', 'xday', 'erase', 'look']);
  if (!tools.includes(S.tool)) S.tool = 'look';
  const btn = (t, label, sw, tc) => '<button type="button" class="tool" data-tool="' + t + '" style="--tc:' + tc + '" aria-pressed="' + (S.tool === t) + '">' + sw + label + '</button>';
  const sw = (bg, cls) => '<span class="sw' + (cls ? ' ' + cls : '') + '"' + (bg ? ' style="background:' + bg + '"' : '') + '></span>';
  const first = S.PLACES.map((pl, i) => btn('pl' + i, P > 1 ? esc(pl) : '가능', sw(placeVar(i)), placeInk(i))).join('') +
    (P > 1 ? btn('any', P === 2 ? '둘 다' : '어디든', sw('var(--go)'), 'var(--go-ink)') : '');
  const second = btn('no', '불가', sw(bgLv(0, 4)), 'var(--no)') + btn('xday', '종일 불가', sw('', 'xday'), 'var(--no)') +
    btn('erase', '지우기', sw('', 'erase'), 'var(--ink)') + btn('look', '보기', sw('', 'look'), 'var(--ink)');
  $('#tools').innerHTML = P > 1
    ? '<div class="trow" style="--n:' + (P + 1) + '">' + first + '</div><div class="trow" style="--n:4">' + second + '</div>'
    : '<div class="trow" style="--n:5">' + first + second + '</div>';
  const gw = $('#gw'), paint = canPaint();
  gw.classList.toggle('paint', paint && S.tool !== 'look');
  gw.classList.toggle('look', !paint || S.tool === 'look');
  $('#hint').innerHTML = hint();
  $('#month').classList.toggle('xmode', xMode());
  $('#xhint').hidden = !xMode();
}

function hint() {
  if (!S.me) return '닉네임으로 들어오면 시간을 칠할 수 있어요. 지금은 칸을 눌러 누가 표시했는지 볼 수 있어요.';
  if (S.readonly) return '저장이 거부돼서 칠할 수 없어요. Firestore 규칙을 확인하세요. 칸을 누르면 누가 표시했는지 보여요.';
  const scroll = coarse() ? ' 화면을 내릴 땐 왼쪽 시간 눈금을 잡고 끌거나 <b>보기</b>로 바꾸세요.' : '';
  const names = S.PLACES.map(esc).join('·'), m = S.tool.match(/^pl(\d)$/);
  if (m) {
    const pl = '<b>' + esc(S.PLACES[+m[1]]) + '</b>';
    return (multi()
      ? pl + '에 갈 수 있는 시간을 드래그로 칠하세요. 다른 장소와 겹쳐 칠할 수 있고, 이미 ' + pl + ' 표시가 있는 칸에서 시작하면 ' + pl + '만 빠져요.'
      : '칸을 드래그해 <b>되는 시간</b>을 칠하세요. 이미 칠한 칸에서 시작하면 지워져요.') + scroll;
  }
  const clearAll = S.tool === 'xday' ? clearXHtml() : '';
  return {
    any: '<b>어디서든</b> 되는 시간(' + names + ' 모두)을 칠하세요. 이미 그렇게 칠한 칸에서 시작하면 지워져요.' + scroll,
    no: '<b>' + (multi() ? '어디서도 안 되는' : '안 되는') + ' 시간</b>을 칠하세요. 이미 불가로 칠한 칸에서 시작하면 지워져요.' + scroll,
    xday: '달력의 날짜나 시간표의 아무 칸을 누르면 그날 하루가 통째로 <b>종일 불가(✕)</b>가 돼요. ✕인 날을 다시 누르면 풀려요. 시간표에선 옆으로 드래그해 여러 날을 한 번에 표시할 수 있어요.' + scroll + (clearAll ? '<span class="hact">' + clearAll + '</span>' : ''),
    erase: '드래그한 칸에서 <b>내 표시</b>를 모두 지워요.' + scroll,
    look: (multi() ? '칠하려면 먼저 위에서 붓을 고르세요. 그 시간에 갈 수 있는 곳(' + names + ')을 고르고, 아무 데나 되면 <b>어디든</b>이에요. ' : '칠하려면 위에서 <b>가능</b>이나 <b>불가</b>를 고르세요. ') +
      '지금은 칸을 누르면 누가 표시했는지 보이고, 화면을 자유롭게 스크롤할 수 있어요.'
  }[S.tool];
}

export function infoHtml(k, h) {
  const d = fromKey(k), w = who(k, h), L = lensPlace();
  const t = '<b>' + (d.getMonth() + 1) + '/' + d.getDate() + ' (' + WD[d.getDay()] + ') ' + pad(h) + ':00–' + pad(h + 1) + ':00</b>';
  if (!w.n.length && w.at.every((a) => !a.length)) return t + '<span class="muted">아직 아무도 표시하지 않았어요.</span>';
  const tag = (id) => (strOf(id, k) === FULLN ? '<span class="xtag">✕종일</span>' : '');
  const list = (arr) => arr.map((id) => esc(nameOf(id)) + (id === S.me ? '(나)' : '') + tag(id)).join(', ');
  let s = t;
  if (L >= 0) {
    const pl = multi() ? esc(S.PLACES[L]) + ' ' : '', cant = ids().filter((id) => missesPlace(strOf(id, k)[h], L));
    if (w.at[L].length) s += '<span class="i-go">' + pl + '가능 ' + w.at[L].length + '명</span> ' + list(w.at[L]) + ' ';
    if (cant.length) s += '<span class="i-no">' + pl + '불가 ' + cant.length + '명</span> ' + list(cant);
    return s;
  }
  w.at.forEach((arr, i) => { if (arr.length) s += '<span class="pinfo" style="color:' + placeInk(i) + '">' + esc(S.PLACES[i]) + ' ' + arr.length + '명</span> ' + list(arr) + ' '; });
  if (w.n.length) s += '<span class="i-no">불가 ' + w.n.length + '명</span> ' + list(w.n);
  return s;
}
export function refreshInfo() {
  $('#info').innerHTML = S.focus ? infoHtml(S.focus.k, S.focus.h) : '<span class="muted">칸을 고르면 그 시간에 누가 어디로 올 수 있는지 여기에 나와요.</span>';
}

/* day view: a chip per person who marked the hour; comparing places, the chip says where they can go */
function chipsHtml(k, h) {
  const L = lensPlace(), only = mineView();
  return ids().filter((id) => !only || id === S.me).map((id) => {
    const c = strOf(id, k)[h];
    if (c === '.') return '';
    const no = L >= 0 ? missesPlace(c, L) : c === 'n';
    const mk = maskOf(c), where = L < 0 && !no ? '<small>' + esc(mk === ALL() ? '어디든' : S.PLACES.filter((_, i) => mk & (1 << i)).map((pl) => [...pl][0]).join('·')) + '</small>' : '';
    const border = no ? 'var(--no-ink)' : L >= 0 ? 'var(--go-ink)' : maskInk(mk);
    return '<span class="chip' + (no ? ' cn' : '') + (id === S.me ? ' me' : '') + '" style="border-color:' + border + '"><i style="background:var(--p' + (S.colorOf[id] || 1) + ')"></i>' + esc(nameOf(id)) + where + '</span>';
  }).join('');
}

export function renderDetail() {
  const cols = colsNow(), d0 = fromKey(cols[0]), d1 = fromKey(cols[cols.length - 1]);
  const tail = (multi() ? ' · ' + (S.lens < 0 ? '장소 비교' : S.PLACES[S.lens]) : '') + (mineView() ? ' · 내 표시만' : '');
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
  const cache = {}, mv = mineView(), L = lensPlace();
  /* comparing places in the week grid, each cell also shows how many can make each place */
  const nums = !mv && S.mode === 'week' && L < 0;
  document.querySelectorAll('#gw .c').forEach((el) => {
    if (el.classList.contains('off')) return;
    const k = el.dataset.k, h = +el.dataset.h;
    const m = S.me ? mineStr(k)[h] : '.';
    const t = mv ? null : cache[k] || (cache[k] = tally(k));
    el.style.background = mv ? mineBg(m) : cellBg(t, h);
    /* my ring: the colour of what I marked here */
    el.classList.toggle('mp', !mv && m !== '.');
    if (!mv && m !== '.') el.style.setProperty('--ring', m === 'n' || (L >= 0 && !hasPlace(m, L)) ? 'var(--no-ink)' : L >= 0 ? 'var(--go-ink)' : maskInk(maskOf(m)));
    el.classList.toggle('fx', !!S.focus && S.focus.k === k && S.focus.h === h);
    if (S.mode === 'day') { if (el.firstElementChild) el.firstElementChild.innerHTML = chipsHtml(k, h); return; }
    const html = nums && t.a.some((x) => x[h]) ? '<span class="cd">' + digits(t.a.map((x) => x[h])) + '</span>' : '';
    if (el._d !== html) { el.innerHTML = html; el._d = html; }
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
  /* mid-drag, nothing above the grid may change height, or the cells would slide under the pointer; the drop redraws everything */
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
