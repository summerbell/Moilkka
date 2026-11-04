/* The view bar ("보기": compare every place, or one place) and, for admins, editing the list of places */
import { $, esc, store, toast } from '../util.js';
import { S, K_LENS, MEETS, sortedPeople, storedSlots, maskOf, maskChar, placeVar, forgetDerived } from './state.js';
import { cleanPlaces } from '../projects.js';
import { renderAll } from './view.js';

export function renderPlaces() {
  const el = $('#placebar'), multi = S.PLACES.length > 1;
  el.hidden = !multi && !S.admin;
  if (el.hidden) return;
  let row = '<span class="pb-lab">보기</span>';
  if (multi) {
    const b = (v, label, dot) => '<button type="button" data-lens="' + v + '" aria-pressed="' + (S.lens === v) + '">' + (dot ? '<i class="pdot" style="background:' + dot + '"></i>' : '') + label + '</button>';
    row += '<div class="seg places" role="group" aria-label="어느 장소 기준으로 볼지">' + b(-1, '비교') + S.PLACES.map((pl, i) => b(i, esc(pl), placeVar(i))).join('') + '</div>';
    row += '<span class="pb-sum">' + (S.lens < 0
      ? '칸 색은 더 많이 올 수 있는 장소, 숫자는 ' + S.PLACES.map(esc).join('·') + ' 순서로 올 수 있는 사람 수예요'
      : esc(S.PLACES[S.lens]) + '에 올 수 있는 사람(초록)과 못 오는 사람(빨강)만 봐요') + '</span>';
  } else row += '<span>' + esc(S.PLACES[0]) + '</span>';
  if (S.admin && !S.plEdit) row += '<button type="button" class="link" data-act="pl-edit">장소 후보 고치기</button>';
  $('#pbRow').innerHTML = row;
  $('#plForm').hidden = !S.plEdit;
}

export function setLens(v) {
  const i = Math.round(Number(v));
  S.lens = i >= 0 && i < S.PLACES.length ? i : -1;
  store.set(K_LENS, S.lens < 0 ? '' : S.PLACES[S.lens]);
  renderAll();
}

/* ---------- editing places (admin) ----------
   One box per place, so renaming keeps a place's marks and clearing a box removes just that place.
   Marks store places by position, so a removal shifts everyone's marks to the new positions first. */
function note(msg) {
  const n = $('#plMsg');
  n.textContent = msg || '칸마다 장소 하나, 4곳까지. 이름을 바꿔도 칠한 기록은 그대로고, 칸을 비우면 그 장소와 그 장소 표시만 빠져요.';
  n.classList.toggle('err', !!msg);
}
export function editPlaces(on) {
  S.plEdit = on && S.admin;
  if (S.plEdit) { document.querySelectorAll('.plIn').forEach((inp, i) => { inp.value = S.PLACES[i] || ''; }); note(''); }
  renderPlaces();
  if (S.plEdit) $('.plIn').focus();
}
function remapStr(s, map) {
  let out = '';
  for (const c of s) {
    const mk = maskOf(c);
    if (!mk) { out += c; continue; }
    let nm = 0;
    map.forEach((j, i) => { if (j >= 0 && mk & (1 << i)) nm |= 1 << j; });
    out += maskChar(nm);
  }
  return out;
}
async function savePlaces() {
  const raw = [...document.querySelectorAll('.plIn')].map((inp) => inp.value.trim().replace(/\s+/g, ' '));
  const names = raw.filter(Boolean);
  if (!names.length) return note('장소를 하나 이상 적어 주세요.');
  if (names.some((s) => [...s].length > 12)) return note('장소 이름은 12자까지 쓸 수 있어요.');
  const places = cleanPlaces(names);
  if (places.length !== names.length) return note('같은 이름이 두 번 있어요.');
  /* map[i] = where old place i goes now, or -1 when its box was cleared */
  const old = S.PLACES, map = old.map((_, i) => (raw[i] ? raw.slice(0, i).filter(Boolean).length : -1));
  const moved = map.some((j, i) => j !== i);
  try {
    /* everyone's sheet is rewritten in the new order (old-style sheets are converted on the way) */
    await Promise.all(sortedPeople().filter((p) => moved || !p.slots).map((p) => {
      const src = storedSlots(p.id), slots = {};
      Object.keys(src).forEach((k) => { slots[k] = moved ? remapStr(src[k], map) : src[k]; });
      return S.DB.collection('projects/' + S.proj.id + '/people').doc(p.id).merge({ slots });
    }));
    /* meetings at a renamed place follow the new name */
    await Promise.all(S.meets.map((m) => {
      const i = old.indexOf(m.place), j = i >= 0 ? map[i] : -1;
      return j >= 0 && places[j] !== m.place ? S.DB.collection(MEETS).doc(m.id).merge({ place: places[j] }) : null;
    }));
    await S.DB.collection('projects').doc(S.proj.id).merge({ places });
  } catch (e) {
    return note(e && e.code === 'not_granted' ? '저장이 거부됐어요. 관리자 계정인지, 최신 firestore.rules를 게시했는지 확인하세요.' : '저장하지 못했어요. 잠시 후 다시 시도하세요.');
  }
  forgetDerived();
  S.plEdit = false;
  toast('장소 후보를 바꿨어요.');
  renderAll();
}
export function bindPlaces() {
  $('#plForm').addEventListener('submit', (e) => { e.preventDefault(); savePlaces(); });
}
