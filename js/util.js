/* Small helpers shared by the project list and the board: dates as 'YYYY-MM-DD' keys, html escaping, storage, toast */

/* ?p=<id> opens that project's board; without it the page is the project list */
export const PID = (new URLSearchParams(location.search).get('p') || '').trim();
export const BASE = location.href.split(/[?#]/)[0];

export const WD = ['일', '월', '화', '수', '목', '금', '토'];
/* a day is 24 characters, one per hour: p = preferred, n = unavailable, . = nothing */
export const EMPTY = '.'.repeat(24);
/* "종일 불가" is simply all 24 hours unavailable, so counts and suggestions need no special case */
export const FULLN = 'n'.repeat(24);

export const $ = (s) => document.querySelector(s);
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const isDayKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const TODAY_K = ymd(new Date());
export const dot = (k) => String(k).replace(/-/g, '.');
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const valid = (s) => typeof s === 'string' && s.length === 24;
export const initial = (name) => ([...String(name || '').trim()][0] || '?').toUpperCase();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
export const narrow = () => { try { return matchMedia('(max-width: 900px)').matches; } catch (e) { return false; } };
export const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
};

export function monthsBetween(a, b) {
  const s = fromKey(a), e = fromKey(b), out = [];
  let y = s.getFullYear(), m = s.getMonth();
  while (y * 12 + m <= e.getFullYear() * 12 + e.getMonth()) { out.push([y, m]); if (++m > 11) { m = 0; y++; } }
  return out;
}
/* word + the particle that fits its last syllable: withJ('서울', '과', '와') → '서울과', withJ('기타', '은', '는') → '기타는' */
export function withJ(w, a, b) {
  const s = String(w), c = s.charCodeAt(s.length - 1);
  return s + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b);
}
export function newId() {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => a[x & 31]).join('');
}

export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4500);
}
export async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch (e) { window.prompt('아래 내용을 복사하세요.', text); }
}
