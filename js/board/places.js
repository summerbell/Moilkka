/* Place switcher: which place the board shows, my mode for it, and (for admins) the list of places */
import { $, esc, store, toast, withJ } from '../util.js';
import { S, K_PLACE, isBase, modeOf, modeLabel, sortedPeople } from './state.js';
import { splitPlaces, placesError, cleanPlaces } from '../projects.js';
import { renderAll } from './view.js';

export function renderPlaces() {
  const el = $('#placebar'), base = S.PLACES[0], multi = S.PLACES.length > 1;
  el.hidden = !multi && !S.admin;
  if (el.hidden) return;
  let row = '<span class="pb-lab">장소</span>';
  row += multi
    ? '<div class="seg places" role="group" aria-label="볼 장소">' + S.PLACES.map((pl, i) =>
      '<button type="button" data-place="' + esc(pl) + '" aria-pressed="' + (pl === S.place) + '">' + esc(pl) + (i ? '' : '<small>기본</small>') + '</button>').join('') + '</div>'
    : '<span>' + esc(base) + '</span>';
  if (multi) {
    let sum;
    if (isBase(S.place)) sum = '여기서 칠한 시간이 다른 장소의 기준이 돼요';
    else {
      const n = { same: 0, own: 0, no: 0, '': 0 };
      sortedPeople().forEach((p) => { n[modeOf(p.id)]++; });
      sum = ['same', 'own', 'no', ''].filter((m) => n[m]).map((m) => modeLabel(m) + ' ' + n[m]).join(' · ') || '아직 들어온 사람이 없어요';
    }
    row += '<span class="pb-sum">' + esc(sum) + '</span>';
  }
  if (S.admin && !S.plEdit) row += '<button type="button" class="link" data-act="pl-edit">장소 후보 고치기</button>';
  $('#pbRow').innerHTML = row;
  $('#plForm').hidden = !S.plEdit;

  const me = $('#pbMe');
  me.hidden = !multi || !S.me;
  if (me.hidden) return;
  const others = S.PLACES.slice(1);
  const any = others.every((pl) => modeOf(S.me, pl) === 'same')
    ? '<span class="mtag same">장소 무관</span>'
    : '<button type="button" class="mini" data-act="anywhere" title="다른 장소도 모두 ' + esc(withJ(base, '과', '와')) + ' 같게">장소 무관</button>';
  if (isBase(S.place)) {
    me.innerHTML = '<span class="pb-q">내 다른 장소</span>' + others.map((pl) => {
      const m = modeOf(S.me, pl);
      return '<button type="button" class="mtag ' + (m || 'unset') + '" data-place="' + esc(pl) + '">' + esc(pl) + ' · ' + esc(modeLabel(m)) + '</button>';
    }).join('') + any;
  } else {
    const m = modeOf(S.me);
    const b = (v, label) => '<button type="button" data-pmode="' + v + '" aria-pressed="' + (m === v) + '">' + label + '</button>';
    me.innerHTML = '<span class="pb-q">' + esc(S.place) + '에서 나는</span>' +
      '<div class="seg modes" role="group" aria-label="' + esc(S.place) + ' 시간">' + b('same', esc(modeLabel('same'))) + b('own', '따로 칠하기') + b('no', '못 감') + '</div>' +
      (m ? '' : '<span class="pb-sum">아직 안 정했어요</span>') + any;
  }
}

export function switchPlace(pl) {
  if (!S.PLACES.includes(pl) || pl === S.place) return;
  S.place = pl; store.set(K_PLACE, pl);
  S.preview = null; S.drag = null; S.confirmClearX = false;
  renderAll();
}

function note(msg) {
  const n = $('#plMsg');
  n.textContent = msg || '쉼표로 나눠 4곳까지. 지금까지 기본으로 칠한 시간은 첫 번째 장소에 그대로 남아요. 다른 장소 이름을 바꾸면 그 장소에 따로 칠한 기록은 보이지 않아요.';
  n.classList.toggle('err', !!msg);
}
export function editPlaces(on) {
  S.plEdit = on && S.admin;
  if (S.plEdit) { $('#plInput').value = S.PLACES.join(', '); note(''); }
  renderPlaces();
  if (S.plEdit) $('#plInput').focus();
}
async function savePlaces() {
  const parts = splitPlaces($('#plInput').value), err = placesError(parts);
  if (err) return note(err);
  try { await S.DB.collection('projects').doc(S.proj.id).merge({ places: cleanPlaces(parts) }); }
  catch (e) { return note(e && e.code === 'not_granted' ? '저장이 거부됐어요. 관리자 계정인지, 최신 firestore.rules를 게시했는지 확인하세요.' : '저장하지 못했어요. 잠시 후 다시 시도하세요.'); }
  S.plEdit = false;
  toast('장소 후보를 바꿨어요.');
  renderAll();
}
export function bindPlaces() {
  $('#plForm').addEventListener('submit', (e) => { e.preventDefault(); savePlaces(); });
}
