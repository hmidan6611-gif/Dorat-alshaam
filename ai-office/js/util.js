// Small shared helpers used by every module.
export const gsap = window.gsap;
gsap.defaults({ overwrite: 'auto' });

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const D = s => (REDUCED ? 0.001 : s); // animation duration helper
export const $ = id => document.getElementById(id);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const now = () => performance.now() / 1000;
export const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const isPhone = () => innerWidth <= 760;
export const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Create an element; text is always set as text, never markup. */
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export function button(cls, text, onclick) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onclick) b.onclick = onclick;
  return b;
}
export const clock = () => new Date().toTimeString().slice(0, 5);
export function fmtTime(ts) {
  try { return new Date(ts).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; }
}
/** Resolve when cond() becomes true (checked every 150 ms), or after timeout. */
export async function until(cond, timeoutMs = 25000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < timeoutMs) await wait(150);
  return cond();
}
/** A tiny event bus so modules can react to each other without import cycles. */
const handlers = {};
export const on = (name, fn) => { (handlers[name] ||= []).push(fn); };
export const emit = (name, ...args) => { (handlers[name] || []).forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } }); };
