/* The project document (title, period, seats, places) and the list of projects this browser has opened */
import { store, isDayKey } from './util.js';

/* projects made before places existed get these, and everything already painted in them counts as the first one */
export const DEFAULT_PLACES = ['서울', '대전', '기타'];

/* "서울, 대전" → ['서울', '대전'] before any cleaning, so the form can say what is wrong */
export function splitPlaces(raw) {
  return String(raw || '').split(/[,，、\n]/).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}
export function placesError(parts) {
  if (!parts.length) return '장소를 하나 이상 적어 주세요.';
  if (parts.some((s) => [...s].length > 12)) return '장소 이름은 12자까지 쓸 수 있어요.';
  if (new Set(parts).size > 4) return '장소는 4곳까지 정할 수 있어요.';
  return '';
}
/* place names become keys in each person's document, so keep them short, unique and free of path characters */
export function cleanPlaces(arr) {
  const out = [];
  (Array.isArray(arr) ? arr : []).forEach((s) => {
    const t = [...String(s == null ? '' : s).replace(/[.\/`[\]*~]/g, '').trim().replace(/\s+/g, ' ')].slice(0, 12).join('');
    if (t && !out.includes(t) && out.length < 4) out.push(t);
  });
  return out;
}

export function readProject(id, v) {
  if (!v || typeof v.title !== 'string' || !isDayKey(v.start) || !isDayKey(v.end) || v.start > v.end) return null;
  const places = cleanPlaces(v.places);
  return {
    id, title: v.title.slice(0, 40), start: v.start, end: v.end,
    max: Math.min(12, Math.max(2, Math.round(Number(v.max)) || 6)),
    places: places.length ? places : DEFAULT_PLACES.slice(),
    createdAt: Number(v.createdAt) || 0
  };
}

/* projects this browser has opened, so people without the admin list can find their way back */
export function recents() {
  try { const a = JSON.parse(store.get('six.recent') || '[]'); return Array.isArray(a) ? a.filter((r) => r && typeof r.id === 'string' && typeof r.title === 'string') : []; } catch (e) { return []; }
}
export function remember(p) { store.set('six.recent', JSON.stringify([{ id: p.id, title: p.title, start: p.start, end: p.end, max: p.max }, ...recents().filter((r) => r.id !== p.id)].slice(0, 12))); }
export function forget(id) { store.set('six.recent', JSON.stringify(recents().filter((r) => r.id !== id))); }
