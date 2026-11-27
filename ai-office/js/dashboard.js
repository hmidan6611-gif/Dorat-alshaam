// Dashboard: productivity per agent, finished tasks over the last 7 days, time spent, and recent activity.
// Charts are plain SVG: one series each, so one hue; identity comes from the agent's name and swatch.
import { $, el, button, fmtTime, clip, on, isPhone } from './util.js';
import { S, byKey } from './state.js';
import { moodOf } from './agents.js';
import { floorById } from './floors.js';

const HUE = '#7b96ff';          // validated against the dark panel surface
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const fmtDur = ms => { const m = Math.round(ms / 60000); if (m < 1) return `${Math.max(1, Math.round(ms / 1000))} ث`; if (m < 60) return `${m} د`; return `${Math.floor(m / 60)} س ${m % 60} د`; };
// on a phone the charts are drawn at the card's real width, so text stays its true size instead of shrinking
const chartW = () => (isPhone() ? Math.max(300, Math.min(420, innerWidth - 62)) : 520);
const nf = n => n.toLocaleString('ar');

/** Per-agent numbers from the tasks, files and chats. */
export function agentStats() {
  return S.agents.map(ag => {
    const k = ag.a.key;
    const steps = S.tasks.flatMap(t => (t.log || []).filter(e => e.key === k && e.end));
    const workMs = steps.reduce((s, e) => s + (e.end - e.start), 0);
    const done = S.tasks.filter(t => t.status === 'done' && t.chain[t.chain.length - 1] === k).length;
    const revisions = S.tasks.reduce((s, t) => s + (t.revBy?.[k] || 0), 0);
    return { ag, steps: steps.length, workMs, avgMs: steps.length ? workMs / steps.length : 0, done,
      files: S.files.filter(f => f.agentKey === k).length, words: steps.reduce((s, e) => s + (e.words || 0), 0),
      revisions, chats: Math.floor(ag.a.history.length / 2) };
  });
}

let tip;
function showTip(x, y, lines) {
  tip.replaceChildren(...lines.map((l, i) => el(i ? 'div' : 'b', '', l)));
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px';
  tip.style.top = Math.max(8, y - r.height - 12) + 'px';
}
const hideTip = () => { tip.hidden = true; };

/** Horizontal bars: finished work steps per agent. */
function barChart(stats) {
  const rows = [...stats].sort((a, b) => b.steps - a.steps);
  const max = Math.max(1, ...rows.map(r => r.steps));
  const W = chartW(), rowH = isPhone() ? 36 : 30, labelW = isPhone() ? 100 : 120, H = rows.length * rowH + 24;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'خطوات العمل المنجزة لكل وكيل' });
  const plotW = W - labelW - 50;
  const ticks = [...new Set([0, Math.ceil(max / 2), max])];
  ticks.forEach(v => {
    const x = W - labelW - (v / max) * plotW;
    s.append(svg('line', { x1: x, x2: x, y1: 4, y2: H - 20, class: 'grid' }));
    const t = svg('text', { x, y: H - 6, class: 'tick', 'text-anchor': 'middle' }); t.textContent = nf(v); s.append(t);
  });
  rows.forEach((r, i) => {
    const y = 6 + i * rowH, len = (r.steps / max) * plotW, x0 = W - labelW;
    const name = svg('text', { x: W - 4, y: y + 15, class: 'lbl', 'text-anchor': 'end' }); name.textContent = r.ag.a.name; s.append(name);
    s.append(svg('rect', { x: W - labelW + 8, y: y + 6, width: 10, height: 10, rx: 3, fill: r.ag.a.color }));
    if (len > 0) s.append(svg('path', { d: `M${x0} ${y + 3} h${-Math.max(0, len - 4)} a4 4 0 0 0 -4 4 v10 a4 4 0 0 0 4 4 h${Math.max(0, len - 4)} z`, fill: HUE }));
    const v = svg('text', { x: x0 - len - 6, y: y + 15, class: 'val', 'text-anchor': 'end' }); v.textContent = nf(r.steps); s.append(v);
    const hit = svg('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent' });
    ['pointermove', 'pointerdown'].forEach(ev => hit.addEventListener(ev, e => showTip(e.clientX, e.clientY, [r.ag.a.name, `خطوات منجزة: ${nf(r.steps)}`, `وقت العمل: ${fmtDur(r.workMs)}`, `ملفات: ${nf(r.files)}`])));
    hit.addEventListener('pointerleave', hideTip);
    s.append(hit);
  });
  return s;
}

/** Line: tasks finished per day, last 7 days. */
function lineChart() {
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const counts = days.map(d => S.tasks.filter(t => t.status === 'done' && t.doneAt >= +d && t.doneAt < +d + 864e5).length);
  const max = Math.max(2, ...counts);
  const W = chartW(), H = isPhone() ? 210 : 190, L = 30, R = 30, T = 14, B = 26, pw = W - L - R, ph = H - T - B;
  const X = i => W - R - (i / 6) * pw, Y = v => T + ph - (v / max) * ph; // RTL: today on the left
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'المهام المنجزة يومياً خلال 7 أيام' });
  [0, Math.round(max / 2), max].forEach(v => {
    s.append(svg('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid' }));
    const t = svg('text', { x: L - 6, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }); t.textContent = nf(v); s.append(t);
  });
  days.forEach((d, i) => { if (i % 2 && i !== 6) return; const t = svg('text', { x: X(i), y: H - 6, class: 'tick', 'text-anchor': 'middle' }); t.textContent = i === 6 ? 'اليوم' : d.toLocaleDateString('ar', { weekday: 'short' }); s.append(t); });
  const pts = counts.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  s.append(svg('polygon', { points: `${X(0)},${Y(0)} ${pts} ${X(6)},${Y(0)}`, fill: HUE, opacity: 0.1 }));
  s.append(svg('polyline', { points: pts, fill: 'none', stroke: HUE, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  s.append(svg('circle', { cx: X(6), cy: Y(counts[6]), r: 5, fill: HUE, stroke: 'var(--panel-solid)', 'stroke-width': 2 }));
  const endLbl = svg('text', { x: X(6) - 10, y: Y(counts[6]) - 8, class: 'val', 'text-anchor': 'end' }); endLbl.textContent = nf(counts[6]); s.append(endLbl);
  const cross = svg('line', { y1: T, y2: T + ph, class: 'cross', visibility: 'hidden' }); s.append(cross);
  const dot = svg('circle', { r: 5, fill: HUE, stroke: 'var(--panel-solid)', 'stroke-width': 2, visibility: 'hidden' }); s.append(dot);
  const hit = svg('rect', { x: L, y: T, width: pw, height: ph, fill: 'transparent' });
  const track = e => {
    const r = s.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(6, Math.round((W - R - x) / pw * 6)));
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(counts[i])); dot.setAttribute('visibility', 'visible');
    showTip(e.clientX, e.clientY, [days[i].toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' }), `مهام منجزة: ${nf(counts[i])}`]);
  };
  hit.addEventListener('pointermove', track); hit.addEventListener('pointerdown', track);
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); });
  s.append(hit);
  return s;
}

function tile(label, value, sub) { const d = el('div', 'tile'); d.append(el('span', '', label), el('b', '', value)); if (sub) d.append(el('small', '', sub)); return d; }
function card(title, sub, body) { const c = el('section', 'dcard'); c.append(el('h3', '', title)); if (sub) c.append(el('p', 'muted', sub)); c.append(body); return c; }

export function renderDashboard() {
  const box = $('dash-body'); if (!box || $('dash').hidden) return;
  const st = agentStats();
  const by = s => S.tasks.filter(t => t.status === s).length;
  const allSteps = st.reduce((a, r) => a + r.steps, 0), allMs = st.reduce((a, r) => a + r.workMs, 0);
  box.replaceChildren();

  const tiles = el('div', 'tiles');
  tiles.append(tile('مهام منجزة', nf(by('done')), `${nf(by('review'))} بانتظار موافقتك`), tile('قيد التنفيذ', nf(by('doing')), `${nf(by('todo'))} في القائمة`),
    tile('ملفات منتجة', nf(S.files.length)), tile('متوسط وقت الخطوة', allSteps ? fmtDur(allMs / allSteps) : '—', `${nf(allSteps)} خطوة عمل`));
  box.append(tiles);

  const grid = el('div', 'dgrid');
  grid.append(card('إنتاجية الوكلاء', 'خطوات العمل التي أنهاها كل وكيل في المهام', allSteps ? barChart(st) : el('p', 'empty', 'لم ينجز أحد مهمة بعد. أنشئ مهمة من لوحة المهام لتظهر الأرقام هنا.')));
  grid.append(card('المهام المنجزة يومياً', 'آخر 7 أيام', lineChart()));
  box.append(grid);

  // table view: every number, including the ones the charts don't show
  const wrap = el('div', 'tablewrap'); const tbl = el('table', 'dtable');
  const head = el('tr'); ['الوكيل', 'الطابق', 'خطوات', 'مهام أنهاها', 'ملفات', 'كلمات', 'وقت العمل', 'متوسط الخطوة', 'طلبات تعديل', 'محادثات', 'الطاقة', 'المزاج'].forEach(h => head.append(el('th', '', h)));
  const thead = el('thead'); thead.append(head); tbl.append(thead);
  const tb = el('tbody');
  st.forEach(r => {
    const tr = el('tr'); const name = el('td'); const sw = el('i', 'sw'); sw.style.background = r.ag.a.color; name.append(sw, document.createTextNode(r.ag.a.name));
    tr.append(name, el('td', '', floorById(r.ag.a.floorId)?.name || ''), el('td', 'num', nf(r.steps)), el('td', 'num', nf(r.done)), el('td', 'num', nf(r.files)), el('td', 'num', nf(r.words)),
      el('td', 'num', r.workMs ? fmtDur(r.workMs) : '—'), el('td', 'num', r.avgMs ? fmtDur(r.avgMs) : '—'), el('td', 'num', nf(r.revisions)), el('td', 'num', nf(r.chats)),
      el('td', 'num', Math.round(r.ag.energy) + '%'), el('td', '', moodOf(r.ag).label));
    tb.append(tr);
  });
  tbl.append(tb); wrap.append(tbl);
  box.append(card('كل الأرقام', 'جدول مفصل لكل وكيل', wrap));

  const feed = el('ul', 'timeline');
  S.events.slice(0, 25).forEach(e => { const li = el('li'); li.style.setProperty('--c', byKey(e.agentKey)?.a.color || '#94a3b8'); li.append(el('time', '', `${fmtTime(e.at)} · ${e.agentName}`), document.createTextNode(clip(e.text, 140))); feed.append(li); });
  box.append(card('آخر النشاط', null, S.events.length ? feed : el('p', 'empty', 'لا نشاط مسجل بعد.')));
}

export function openDashboard(open) { $('dash').hidden = !open; if (open) renderDashboard(); else hideTip(); }
export function initDashboard({ onClose }) {
  tip = $('dash-tip');
  $('dash-close').onclick = onClose;
  let lastW = innerWidth;
  addEventListener('resize', () => { if (!$('dash').hidden && Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; renderDashboard(); } });
  ['tasks-changed', 'files-changed', 'events-changed', 'stats'].forEach(n => on(n, () => { clearTimeout(initDashboard.t); initDashboard.t = setTimeout(renderDashboard, 300); }));
}
export { button };
