// Creating agents: look, colour, personality, specialty, voice and floor; an office is found or built for them.
import { $, el, emit } from './util.js';
import { S, byKey } from './state.js';
import { NEW_COLORS } from './data.js';
import { put } from './store.js';
import { AI, aiReady, noteFatal } from './ai.js';
import { makeAgent } from './agents.js';
import { floorById, mainFloor, objAt, findOfficeSpot, drawObj, saveFloor } from './floors.js';
import { footprint } from './layout.js';
import { rebuildNav } from './nav.js';
import { addEvent } from './log.js';
import { speakLines } from './voice.js';
import { canAddAgent, openPlans } from './plans.js';

export const PERSONALITIES = ['ودود ومتعاون', 'رسمي ومنظم', 'مرح وخفيف الظل', 'دقيق ويحب التفاصيل', 'مبدع ويقترح أفكاراً جريئة', 'هادئ ومختصر'];
export const VOICES = { buttery: 'ناعم', airy: 'خفيف', glassy: 'صافٍ', rounded: 'عميق' };
export const strList = (v, n, max) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, max)).slice(0, n) : [];
export const okColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const pickOf = (v, obj, d) => (Object.keys(obj).includes(v) ? v : d);

export const agentDoc = a => ({ key: a.key, name: a.name, role: a.role, desc: a.desc || '', intro: a.intro, color: a.color, gender: a.gender,
  voice: a.voice, personality: a.personality || '', shape: a.shape || {}, tasks: a.tasks, questions: Object.keys(a.chips),
  floorId: a.floorId, officeId: a.officeId, at: Date.now() });

/** Give agent `a` an office on `floor`: a vacant one, or a new one in free space. Returns false if the floor is full. */
export function assignOffice(a, floor, live = true) {
  let o = floor.objects.find(x => x.type === 'office' && !x.agentKey);
  if (!o) {
    const spot = findOfficeSpot(floor); if (!spot) return false;
    o = { id: 'o_' + a.key, type: 'office', x: spot.x, z: spot.z, rot: spot.rot || 0, door: spot.door, agentKey: null };
    floor.objects.push(o); drawObj(floor, o, live); rebuildNav(floor);
  }
  o.agentKey = a.key; a.officeId = o.id; a.floorId = floor.id;
  saveFloor(floor);
  return true;
}
export const hasRoom = floor => floor.objects.some(x => x.type === 'office' && !x.agentKey) || !!findOfficeSpot(floor);

let ui = {};
/** Put a new agent in the office: an office on the floor, the robot, saved, announced. */
export function installAgent(a, floor) {
  if (!assignOffice(a, floor)) return null;
  if (S.viewFloor !== floor.id) ui.viewFloor(floor.id);
  const ag = makeAgent(a, true);
  put('agents', a.key, agentDoc(a));
  addEvent(ag, `${a.name} ${a.gender === 'f' ? 'انضمت' : 'انضم'} إلى الفريق في «${floor.name}»`);
  emit('team-changed');
  return ag;
}
export function openNew() {
  if (S.meeting.running) return;
  if (!canAddAgent()) { openPlans('وصلت إلى حد الوكلاء في خطتك. اختر خطة أكبر لإضافة المزيد.'); return; }
  ui.select(null); ui.setTabState('office'); ui.showPanel('new');
  $('new-status').textContent = ''; $('new-submit').disabled = false;
  const used = new Set(S.agents.map(o => o.a.color));
  const c = NEW_COLORS.find(x => !used.has(x)) || NEW_COLORS[0];
  document.querySelector(`input[name="new-color"][value="${c}"]`).checked = true; $('new-ava').style.setProperty('--c', c);
  const fs = $('new-floor'); fs.replaceChildren();
  S.floors.forEach(f => fs.append(new Option(`${f.name}${hasRoom(f) ? '' : ' (ممتلئ)'}`, f.id)));
  fs.value = S.viewFloor;
  ui.focusLounge();
  setTimeout(() => $('new-name').focus(), 400);
}

function seg(name, options, def) {
  const box = el('div', 'seg');
  Object.entries(options).forEach(([v, label]) => {
    const l = el('label'); const i = el('input'); i.type = 'radio'; i.name = name; i.value = v; i.id = name + '-' + v; if (v === def) i.checked = true;
    l.append(i, el('span', '', label)); box.append(l);
  });
  return box;
}
const val = name => document.querySelector(`input[name="${name}"]:checked`)?.value;

export function initNewAgent(hooks) {
  ui = hooks;
  NEW_COLORS.forEach((c, k) => {
    const lab = el('label'); const inp = el('input'); inp.type = 'radio'; inp.name = 'new-color'; inp.value = c; inp.id = 'new-color-' + k;
    inp.setAttribute('aria-label', 'لون ' + (k + 1)); if (k === 0) inp.checked = true;
    const sw = el('span'); sw.style.setProperty('--c', c);
    inp.onchange = () => $('new-ava').style.setProperty('--c', c);
    lab.append(inp, sw); $('new-colors').append(lab);
  });
  $('new-head').append(seg('new-headshape', { box: 'مربع', round: 'دائري', tall: 'طويل' }, 'box'));
  $('new-ant').append(seg('new-antenna', { ball: 'هوائي', double: 'هوائيان', none: 'بدون' }, 'ball'));
  $('new-acc').append(seg('new-accessory', { none: 'بدون', headphones: 'سماعات', cap: 'قبعة' }, 'none'));
  const ps = $('new-personality'); PERSONALITIES.forEach(p => ps.append(new Option(p, p)));
  const vs = $('new-voice'); Object.entries(VOICES).forEach(([v, l]) => vs.append(new Option(l, v)));
  $('new-voice-try').onclick = () => speakLines([{ text: `مرحباً، أنا ${$('new-name').value.trim() || 'وكيلك الجديد'}. يسعدني العمل معك.`, voice: vs.value }]);
  $('new-close').onclick = () => hooks.showPanel(null);
  $('new-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('new-name').value.trim(), role = $('new-role').value.trim(), desc = $('new-desc').value.trim();
    if (!name || !role) return;
    const floor = floorById($('new-floor').value) || mainFloor();
    if (!hasRoom(floor)) { $('new-status').textContent = `لا توجد مساحة لمكتب جديد في «${floor.name}». اختر طابقاً آخر أو أضف طابقاً.`; return; }
    const gender = val('new-gender'), color = val('new-color'), personality = $('new-personality').value, voice = $('new-voice').value;
    const shape = { head: val('new-headshape'), antenna: val('new-antenna'), acc: val('new-accessory') };
    $('new-submit').disabled = true;
    let extra = null;
    if (aiReady()) {
      $('new-status').textContent = 'Claude يجهّز شخصية الوكيل…';
      try {
        extra = await AI.sample.json(`أنشئ ملفاً قصيراً لوكيل ذكاء اصطناعي جديد في مكتب افتراضي اسمه «خلية المكتب».
الاسم: ${name}
التخصص: ${role}
الوصف: ${desc || 'غير محدد'}
الشخصية: ${personality}
الجنس: ${gender === 'f' ? 'أنثى (استخدم صيغة المؤنث)' : 'ذكر (استخدم صيغة المذكر)'}
أعد JSON فقط: {"intro":"تعريف بصوت الوكيل نفسه في جملتين يبدأ باسمه ويعكس شخصيته","tasks":["3 مهام قصيرة جداً يعمل عليها الآن بصيغة المتكلم، 2-4 كلمات"],"questions":["سؤالان قصيران يمكن أن يطرحهما المستخدم على هذا الوكيل"]}`, { modelTier: 'quick' });
      } catch (err) { noteFatal(err); }
    }
    const intro = typeof extra?.intro === 'string' && extra.intro.trim() ? extra.intro.trim().slice(0, 300)
      : `${name} ${gender === 'f' ? 'جاهزة' : 'جاهز'} للعمل في ${role}.${desc ? ' ' + desc : ''}`;
    let tasks = strList(extra?.tasks, 3, 40); if (!tasks.length) tasks = [`أعمل على ${role}`, 'أرتّب أولويات اليوم', 'أراجع الملاحظات'];
    const questions = strList(extra?.questions, 2, 60);
    const a = { key: 'c' + Date.now().toString(36), name: name.slice(0, 16), role: role.slice(0, 30), desc: desc.slice(0, 240), intro, color, gender,
      voice, personality, shape, tasks, chips: Object.fromEntries(questions.map(q => [q, ''])), working: true, custom: true, history: [] };
    const ag = installAgent(a, floor);
    if (!ag) { $('new-status').textContent = 'تعذّر إيجاد مكان لمكتب جديد.'; $('new-submit').disabled = false; return; }
    $('new-form').reset(); $('new-status').textContent = '';
    setTimeout(() => hooks.select(ag), 1100);
  });
}

// desk positions used before offices could move; saved agents from that time get an office there if it is free
const OLD_SLOTS = { 6: [5.6, -5.6, -1], 7: [5.6, 2.4, -1] };
/** Rebuild saved custom agents after a reload. */
export function restoreAgents(docs) {
  for (const d of docs || []) {
    if (!d || typeof d.key !== 'string' || byKey(d.key) || typeof d.name !== 'string') continue;
    const a = { key: d.key, name: d.name.slice(0, 16), role: String(d.role || '').slice(0, 30), desc: String(d.desc || '').slice(0, 240),
      intro: String(d.intro || ''), color: okColor(d.color) ? d.color : NEW_COLORS[0], gender: d.gender === 'm' ? 'm' : 'f',
      voice: pickOf(d.voice, VOICES, 'buttery'), personality: typeof d.personality === 'string' ? d.personality.slice(0, 60) : '',
      shape: { head: pickOf(d.shape?.head, { box: 1, round: 1, tall: 1 }, 'box'), antenna: pickOf(d.shape?.antenna, { ball: 1, double: 1, none: 1 }, 'ball'), acc: pickOf(d.shape?.acc, { none: 1, headphones: 1, cap: 1 }, 'none') },
      tasks: strList(d.tasks, 3, 40), chips: Object.fromEntries(strList(d.questions, 3, 60).map(q => [q, ''])),
      working: true, custom: true, history: [] };
    if (!a.tasks.length) a.tasks = [`أعمل على ${a.role}`];
    const floor = floorById(d.floorId) || mainFloor();
    const own = d.officeId && objAt(floor.id, d.officeId);
    if (own && (!own.agentKey || own.agentKey === a.key)) { own.agentKey = a.key; a.officeId = own.id; a.floorId = floor.id; }
    else {
      const old = OLD_SLOTS[d.slot];
      if (old) {
        const o = { id: 'o_' + a.key, type: 'office', x: old[0], z: old[1], rot: 0, door: old[2], agentKey: null };
        const f = footprint(o);
        const clash = floor.objects.some(x => { const p = footprint(x); return p.x1 < f.x2 && p.x2 > f.x1 && p.z1 < f.z2 && p.z2 > f.z1; });
        if (!clash) { floor.objects.push(o); drawObj(floor, o); rebuildNav(floor); }
      }
      if (!assignOffice(a, floor, false)) continue;
    }
    makeAgent(a, true);
  }
}
