// Creating a new agent: a short form, Claude writes its profile, a new office and robot appear.
import { $, el, emit } from './util.js';
import { S, byKey } from './state.js';
import { NEW_COLORS } from './data.js';
import { put } from './store.js';
import { AI, aiReady, noteFatal } from './ai.js';
import { makeStation } from './agents.js';
import { addEvent } from './log.js';

export const freeSlot = slotsLen => { for (let s = 0; s < slotsLen; s++) if (!S.agents.some(o => o.a.slot === s)) return s; return -1; };
export const strList = (v, n, max) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, max)).slice(0, n) : [];
export const okColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

export const agentDoc = a => ({ key: a.key, name: a.name, role: a.role, desc: a.desc || '', intro: a.intro, color: a.color, gender: a.gender,
  voice: a.voice, tasks: a.tasks, questions: Object.keys(a.chips), slot: a.slot, at: Date.now() });

let ui = {};
export function openNew() {
  if (ui.freeSlot() < 0 || S.meeting.running) return;
  ui.select(null); ui.setTabState('office'); ui.showPanel('new');
  $('new-status').textContent = ''; $('new-submit').disabled = false;
  const used = new Set(S.agents.map(o => o.a.color));
  const c = NEW_COLORS.find(x => !used.has(x)) || NEW_COLORS[0];
  document.querySelector(`input[name="new-color"][value="${c}"]`).checked = true; $('new-ava').style.setProperty('--c', c);
  ui.focusLounge();
  setTimeout(() => $('new-name').focus(), 400);
}

export function initNewAgent(hooks) {
  ui = hooks;
  NEW_COLORS.forEach((c, k) => {
    const lab = el('label'); const inp = el('input'); inp.type = 'radio'; inp.name = 'new-color'; inp.value = c; inp.id = 'new-color-' + k;
    inp.setAttribute('aria-label', 'لون ' + (k + 1)); if (k === 0) inp.checked = true;
    const sw = el('span'); sw.style.setProperty('--c', c);
    inp.onchange = () => $('new-ava').style.setProperty('--c', c);
    lab.append(inp, sw); $('new-colors').append(lab);
  });
  $('new-close').onclick = () => hooks.showPanel(null);
  $('new-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('new-name').value.trim(), role = $('new-role').value.trim(), desc = $('new-desc').value.trim();
    if (!name || !role) return;
    const slot = hooks.freeSlot(); if (slot < 0) { $('new-status').textContent = 'المكتب ممتلئ. احذف وكيلاً أضفته لتفريغ مكتب.'; return; }
    const gender = document.querySelector('input[name="new-gender"]:checked').value;
    const color = document.querySelector('input[name="new-color"]:checked').value;
    $('new-submit').disabled = true;
    let extra = null;
    if (aiReady()) {
      $('new-status').textContent = 'Claude يجهّز شخصية الوكيل…';
      try {
        extra = await AI.sample.json(`أنشئ ملفاً قصيراً لوكيل ذكاء اصطناعي جديد في مكتب افتراضي اسمه «خلية المكتب».
الاسم: ${name}
التخصص: ${role}
الوصف: ${desc || 'غير محدد'}
الجنس: ${gender === 'f' ? 'أنثى (استخدم صيغة المؤنث)' : 'ذكر (استخدم صيغة المذكر)'}
أعد JSON فقط: {"intro":"تعريف بصوت الوكيل نفسه في جملتين يبدأ باسمه","tasks":["3 مهام قصيرة جداً يعمل عليها الآن بصيغة المتكلم، 2-4 كلمات"],"questions":["سؤالان قصيران يمكن أن يطرحهما المستخدم على هذا الوكيل"]}`, { modelTier: 'quick' });
      } catch (err) { noteFatal(err); }
    }
    const intro = typeof extra?.intro === 'string' && extra.intro.trim() ? extra.intro.trim().slice(0, 300)
      : `${name} ${gender === 'f' ? 'جاهزة' : 'جاهز'} للعمل في ${role}.${desc ? ' ' + desc : ''}`;
    let tasks = strList(extra?.tasks, 3, 40); if (!tasks.length) tasks = [`أعمل على ${role}`, 'أرتّب أولويات اليوم', 'أراجع الملاحظات'];
    const questions = strList(extra?.questions, 2, 60);
    const a = { key: 'c' + Date.now().toString(36), name: name.slice(0, 16), role: role.slice(0, 30), desc: desc.slice(0, 240), intro, color, gender,
      voice: gender === 'f' ? 'glassy' : 'rounded', tasks, chips: Object.fromEntries(questions.map(q => [q, ''])),
      working: true, custom: true, history: [], slot };
    const ag = makeStation(a, true);
    put('agents', a.key, agentDoc(a));
    $('new-form').reset(); $('new-status').textContent = '';
    addEvent(ag, `${a.name} ${gender === 'f' ? 'انضمت' : 'انضم'} إلى الفريق`);
    emit('team-changed');
    setTimeout(() => hooks.select(ag), 1100);
  });
}

/** Rebuild saved custom agents after a reload. */
export function restoreAgents(docs, slotsLen) {
  for (const d of docs || []) {
    if (!d || typeof d.key !== 'string' || byKey(d.key) || typeof d.name !== 'string') continue;
    const taken = s => S.agents.some(o => o.a.slot === s);
    const slot = Number.isInteger(d.slot) && d.slot >= 6 && d.slot < slotsLen && !taken(d.slot) ? d.slot : freeSlot(slotsLen);
    if (slot < 0) break;
    const a = { key: d.key, name: d.name.slice(0, 16), role: String(d.role || '').slice(0, 30), desc: String(d.desc || '').slice(0, 240),
      intro: String(d.intro || ''), color: okColor(d.color) ? d.color : NEW_COLORS[0], gender: d.gender === 'm' ? 'm' : 'f',
      voice: ['buttery', 'airy', 'glassy', 'rounded'].includes(d.voice) ? d.voice : 'buttery',
      tasks: strList(d.tasks, 3, 40), chips: Object.fromEntries(strList(d.questions, 3, 60).map(q => [q, ''])),
      working: true, custom: true, history: [], slot };
    if (!a.tasks.length) a.tasks = [`أعمل على ${a.role}`];
    makeStation(a, true);
  }
}
