// Real work: the Kanban board, assigning tasks (drag onto a robot), Claude doing the work,
// hand-offs between agents, review and approval.
import { $, el, button, uid, wait, clip, emit, on, gsap, D } from './util.js';
import { S, byKey, isFemale } from './state.js';
import { STATUS } from './data.js';
import { put, del } from './store.js';
import { AI, aiReady, identity, errText, noteFatal } from './ai.js';
import { goWork, goVisit, goHome, showBubble } from './agents.js';
import { THREE, camera, renderer, handoffBeam, sendPulse, stormEvent } from './scene.js';
import { addEvent } from './log.js';
import { notify, registerActions } from './notify.js';
import { openModal, openFile } from './modal.js';

const runs = new Map(); // taskId -> AbortController of the running step
export const taskById = id => S.tasks.find(t => t.id === id);
export const currentKey = t => t.chain[t.step] || '';
const nameOf = key => byKey(key)?.a.name || 'وكيل محذوف';
const save = t => { t.updatedAt = Date.now(); put('tasks', t.id, t); emit('tasks-changed', t); };

/* ------------------------------------------------------------------ model */
export function createTask({ title, desc = '', chain = [], approval = true }) {
  const t = { id: uid('t'), title, desc, status: 'todo', chain: chain.filter(Boolean), step: 0, progress: 0, approval,
    outputs: [], feedback: '', error: '', paused: false, createdAt: Date.now(), updatedAt: Date.now() };
  S.tasks.unshift(t); save(t);
  schedule();
  return t;
}
function assign(t, key) {
  if (t.status === 'done') return;
  stop(t);
  if (!t.chain.length) t.chain = [key];
  else t.chain[t.step] = key;
  t.paused = false; t.error = ''; t.status = 'todo';
  save(t); schedule();
}
function stop(t) {
  runs.get(t.id)?.abort(); runs.delete(t.id);
  S.agents.forEach(o => { if (o.task === t.id) { o.task = null; o.progress = -1; } });
}
function removeTask(t) {
  stop(t);
  S.tasks.splice(S.tasks.indexOf(t), 1);
  del('tasks', t.id); emit('tasks-changed', t);
}
function moveTo(t, status) {
  if (status === t.status) return;
  if (status === 'doing') { if (!t.chain.length) return flashHint('أسند المهمة لوكيل أولاً'); t.paused = false; t.error = ''; t.status = 'todo'; save(t); return schedule(); }
  if (status === 'review' && !t.outputs.length) return flashHint('لا يوجد ناتج لمراجعته بعد');
  stop(t);
  t.status = status; t.paused = status === 'todo' && t.chain.length > 0;
  if (status === 'done') finishDone(t, true); else save(t);
}

/** Start any waiting task whose agent is free. */
export function schedule() {
  if (S.meeting.running) return;
  for (const t of [...S.tasks].reverse()) {
    if (t.status !== 'todo' || t.paused || !t.chain.length) continue;
    const ag = byKey(currentKey(t));
    if (ag && !ag.task) runStep(t, ag);
  }
}

/* ------------------------------------------------------------------ doing the work */
function stepPrompt(t, ag) {
  const prev = t.outputs.length ? S.files.find(f => f.id === t.outputs[t.outputs.length - 1]) : null;
  const next = byKey(t.chain[t.step + 1]);
  const prevAgent = prev ? byKey(prev.agentKey) : null;
  const redo = t.feedback && prev && prev.agentKey === ag.a.key;
  return `${identity(ag)}

لديك مهمة عمل حقيقية من المستخدم. نفّذها الآن بنفسك وسلّم الناتج كاملاً.
عنوان المهمة: ${t.title}
${t.desc ? `التفاصيل: ${t.desc}\n` : ''}${prev && !redo ? `\nهذا ما سلّمه لك ${prev.agentName}${prevAgent ? ` (${prevAgent.a.role})` : ''}، ابنِ عليه:\n«${clip(prev.content, 12000)}»\n` : ''}${redo ? `\nهذه نسختك السابقة:\n«${clip(prev.content, 12000)}»\nوملاحظات المستخدم عليها: ${t.feedback}\nأعد كتابة الناتج كاملاً مع تطبيق الملاحظات.\n` : ''}${next ? `\nبعد أن تنتهي سيستلم عملك ${next.a.name} (${next.a.role})، فاجعل الناتج واضحاً ومفيداً له.\n` : ''}
اكتب الناتج النهائي نفسه، وليس وصفاً لما ستفعله.
- ابدأ بسطر واحد هو عنوان الملف، ثم سطر فارغ، ثم المحتوى.
- نظّم المحتوى بفقرات قصيرة وقوائم مرقمة عند الحاجة، بنص عادي بلا Markdown (لا # ولا **).
- الطول المناسب من 150 إلى 700 كلمة حسب حجم المهمة.
- اكتب بالعربية إلا إذا طلبت المهمة لغة أخرى.`;
}

async function runStep(t, ag) {
  t.status = 'doing'; t.progress = 0; t.error = ''; ag.task = t.id; ag.progress = 0; save(t);
  emit('agents-changed');
  const f = isFemale(ag.a);
  addEvent(ag, `${f ? 'بدأت' : 'بدأ'} العمل على «${t.title}»`, t.id);
  await goWork(ag);
  if (taskById(t.id) !== t || ag.task !== t.id || t.status !== 'doing') { if (ag.task === t.id) { ag.task = null; ag.progress = -1; } return; }
  ag.kick = 1; showBubble(ag, 'بدأت العمل', 2200);
  const ctl = new AbortController(); runs.set(t.id, ctl);
  const t0 = Date.now(); let streamed = 0;
  const tick = setInterval(() => {
    const p = Math.min(0.92, Math.max((Date.now() - t0) / 70000, 0.12 + 0.8 * Math.min(1, streamed / 2600)));
    ag.progress = t.progress = p; emit('progress', t);
  }, 400);
  let text;
  try {
    if (aiReady()) {
      const res = await AI.sample(stepPrompt(t, ag), { modelTier: 'complex', cache: false, signal: ctl.signal,
        onText: ({ text }) => { streamed = text.length; } });
      text = res.text.trim();
    } else {
      // no Claude here: simulate the work so the flow can still be seen, and say so in the file
      for (let k = 0; k < 20 && !ctl.signal.aborted; k++) { await wait(400); streamed += 130; }
      if (ctl.signal.aborted) throw { code: 'cancelled' };
      text = `${t.title}\n\nنسخة تجريبية: Claude غير متاح في هذه الصفحة الآن، لذلك لم يكتب ${ag.a.name} محتوى حقيقياً.\nافتح الصفحة من claude.ai واسمح لها باستخدام Claude، ثم أعد تشغيل المهمة.`;
    }
  } catch (e) {
    clearInterval(tick); runs.delete(t.id);
    if (ag.task === t.id) { ag.task = null; ag.progress = -1; }
    emit('agents-changed');
    if (e?.code === 'cancelled' || !taskById(t.id)) { schedule(); return; }
    noteFatal(e);
    t.status = 'todo'; t.paused = true; t.error = errText(e); save(t);
    addEvent(ag, `تعذّر إكمال «${t.title}»: ${t.error}`, t.id);
    notify({ text: `${ag.a.name}: تعذّر إكمال «${t.title}». ${t.error}`, kind: 'error', taskId: t.id, agentKey: ag.a.key });
    schedule(); return;
  }
  clearInterval(tick); runs.delete(t.id);
  if (!taskById(t.id)) { ag.task = null; ag.progress = -1; schedule(); return; }

  // the result becomes a file
  const lines = text.split('\n');
  const title = clip((lines[0] || t.title).replace(/^[#*\s]+|[*\s]+$/g, '') || t.title, 80);
  const file = { id: uid('f'), taskId: t.id, agentKey: ag.a.key, agentName: ag.a.name, title, content: text, at: Date.now() };
  S.files.unshift(file); put('files', file.id, file); emit('files-changed', ag);
  t.outputs.push(file.id); t.feedback = ''; ag.progress = t.progress = 1; emit('progress', t);
  addEvent(ag, `${f ? 'أنهت' : 'أنهى'} «${t.title}» وكتب${f ? 'ت' : ''} ملف «${title}»`, t.id);
  sendPulse(ag);
  await wait(700);
  ag.task = null; ag.progress = -1;

  const next = byKey(t.chain[t.step + 1]);
  if (next) return handoff(t, ag, next);
  if (t.approval) {
    t.status = 'review'; save(t);
    notify({ text: `${ag.a.name} ${f ? 'أنهت' : 'أنهى'} «${t.title}» وينتظر موافقتك.`, kind: 'approve', taskId: t.id, agentKey: ag.a.key });
  } else finishDone(t);
  emit('agents-changed');
  schedule();
}

async function handoff(t, from, to) {
  const f = isFemale(from.a);
  t.step++; t.status = 'doing'; save(t);
  addEvent(from, `${f ? 'سلّمت' : 'سلّم'} «${t.title}» إلى ${to.a.name}`, t.id);
  await goVisit(from, to, `أسلّم ${to.a.name}`);
  handoffBeam(from, to, 3.2);
  showBubble(from, `تفضّل${isFemale(to.a) ? 'ي' : ''} يا ${to.a.name}`, 2600);
  await wait(1400);
  showBubble(to, 'استلمت، شكراً!', 2600); to.kick = 1;
  await wait(1800);
  goHome(from);
  if (!taskById(t.id)) return;
  t.status = 'todo'; save(t);
  emit('agents-changed');
  schedule();
}

function finishDone(t, manual = false) {
  t.status = 'done'; t.paused = false; t.error = ''; save(t);
  S.tasksDoneToday++; emit('stats');
  const ag = byKey(t.chain[t.chain.length - 1]);
  if (ag && !manual) {
    stormEvent(ag, ag.a.color, 0.5);
    notify({ text: `«${t.title}» منجزة.`, kind: 'done', taskId: t.id, agentKey: ag.a.key });
  }
}
export function approve(t) {
  if (!t || t.status !== 'review') return;
  const ag = byKey(t.chain[t.chain.length - 1]);
  if (ag) addEvent(ag, `وافقت على «${t.title}»`, t.id);
  finishDone(t);
}
export function revise(t) {
  if (!t) return;
  const ta = el('textarea'); ta.rows = 4; ta.id = 'revise-text'; ta.placeholder = 'مثلاً: اختصره إلى نصف الطول وأضف أرقاماً تقديرية';
  const frag = document.createDocumentFragment(); frag.append(el('p', 'lead', `ما الذي تريد تعديله في «${t.title}»؟`), ta);
  let close;
  const send = button('btn primary', 'أرسل الملاحظات', () => {
    const v = ta.value.trim(); if (!v) return ta.focus();
    t.feedback = v; t.status = 'todo'; t.paused = false; t.error = ''; save(t);
    const ag = byKey(currentKey(t)); if (ag) addEvent(ag, `طلبت تعديلات على «${t.title}»`, t.id);
    close(); schedule();
  });
  close = openModal('طلب تعديل', frag, [send]);
}

registerActions('approve', n => {
  const t = taskById(n.taskId); if (!t || t.status !== 'review') return [];
  const file = S.files.find(f => f.id === t.outputs[t.outputs.length - 1]);
  return [
    { label: 'موافقة', cls: 'primary', run: () => approve(t) },
    { label: 'طلب تعديل', run: () => revise(t) },
    ...(file ? [{ label: 'عرض الملف', run: () => openFile(file) }] : []),
  ];
});
registerActions('done', n => {
  const t = taskById(n.taskId); const file = t && S.files.find(f => f.id === t.outputs[t.outputs.length - 1]);
  return file ? [{ label: 'عرض الملف', run: () => openFile(file) }] : [];
});

/* ------------------------------------------------------------------ new task form */
const EXAMPLES = [
  { title: 'تحليل منافسينا وخطة عمل للربع القادم', desc: 'ابحث عن 3 منافسين مباشرين ونقاط قوتهم وضعفهم، ثم حوّل النتائج إلى خطة عمل من خطوات واضحة.', chain: ['mira', 'juno'] },
  { title: 'رد على شكوى عميل خُصم منه مرتين', desc: 'اكتب رداً لطيفاً واضحاً للعميل، ثم راجع أثر الاسترداد على حسابات الشهر.', chain: ['sage', 'pip'] },
  { title: 'تصميم شاشة ترحيب للتطبيق', desc: 'اقترح محتوى وترتيب شاشة الترحيب، ثم راجعها تقنياً وحدد ما يلزم لتنفيذها.', chain: ['nova', 'otto'] },
];
export function openNewTask(presetKey = '') {
  const frag = document.createDocumentFragment();
  const title = el('input'); title.id = 'task-title'; title.maxLength = 120; title.required = true; title.placeholder = 'مثلاً: تقرير عن منافسينا';
  const desc = el('textarea'); desc.id = 'task-desc'; desc.rows = 3; desc.maxLength = 1500; desc.placeholder = 'ماذا تريد أن يسلّمك الوكيل بالضبط؟';
  const sel = (id, first) => { const s = el('select'); s.id = id; s.append(new Option(first, '')); S.agents.forEach(o => s.append(new Option(`${o.a.name} — ${o.a.role}`, o.a.key))); return s; };
  const who = sel('task-who', 'بدون (تبقى في القائمة)'); who.value = presetKey;
  const h1 = sel('task-h1', 'لا أحد'), h2 = sel('task-h2', 'لا أحد');
  const appr = el('input'); appr.type = 'checkbox'; appr.id = 'task-approval'; appr.checked = true;
  const field = (label, node) => { const l = el('label', 'field', label); l.append(node); return l; };
  const ex = el('div', 'chips'); ex.style.padding = '0';
  EXAMPLES.forEach(x => ex.append(button('', x.title, () => {
    title.value = x.title; desc.value = x.desc;
    const keys = x.chain.filter(byKey); who.value = keys[0] || ''; h1.value = keys[1] || ''; h2.value = keys[2] || '';
  })));
  const chk = el('label', 'check'); chk.append(appr, document.createTextNode('تحتاج موافقتي قبل أن تُعتبر منجزة'));
  frag.append(el('h3', '', 'أمثلة'), ex, field('عنوان المهمة', title), field('التفاصيل', desc), field('المسؤول', who),
    field('ثم يسلّمها إلى (اختياري)', h1), field('ثم إلى (اختياري)', h2), chk);
  let close;
  const go = button('btn primary', 'أنشئ المهمة', () => {
    const v = title.value.trim(); if (!v) return title.focus();
    const chain = [who.value, h1.value, h2.value].filter(Boolean);
    createTask({ title: v, desc: desc.value.trim(), chain, approval: appr.checked });
    close();
  });
  close = openModal('مهمة جديدة', frag, [go]);
}
function openTask(t) {
  const frag = document.createDocumentFragment();
  if (t.desc) frag.append(el('p', 'lead', t.desc));
  frag.append(el('div', 'muted', 'المسار: ' + (t.chain.map(nameOf).join(' ← ') || 'غير مسندة')));
  const files = t.outputs.map(id => S.files.find(f => f.id === id)).filter(Boolean);
  if (files.length) {
    frag.append(el('h3', '', 'الملفات'));
    const ul = el('ul', 'tlist');
    files.forEach(f => { const li = el('li'); li.append(button('linkish', f.title, () => openFile(f)), el('small', '', f.agentName)); ul.append(li); });
    frag.append(ul);
  }
  let close;
  const delBtn = button('btn danger', 'حذف المهمة', () => {
    if (delBtn.dataset.sure) { removeTask(t); close(); } else { delBtn.dataset.sure = '1'; delBtn.textContent = 'اضغط مرة أخرى للتأكيد'; }
  });
  close = openModal(t.title, frag, [delBtn]);
}

/* ------------------------------------------------------------------ board */
const STATUS_TEXT = t => t.error ? t.error : t.paused ? 'متوقفة' : t.status === 'todo' && t.chain.length ? `بانتظار ${nameOf(currentKey(t))}` : '';
export function renderBoard() {
  const cols = $('cols'); if (!cols) return;
  const scroll = [...cols.children].map(c => c.scrollTop);
  cols.replaceChildren();
  STATUS.forEach((s, i) => {
    const list = S.tasks.filter(t => t.status === s.id);
    const col = el('div', 'col'); col.dataset.status = s.id;
    const h = el('h3'); h.append(el('span', '', s.label), el('span', '', String(list.length)));
    col.append(h);
    if (!list.length && s.id === 'todo') col.append(el('p', 'empty', 'لا مهام بعد. اضغط «+ مهمة جديدة» أو جرّب أحد الأمثلة.'));
    list.forEach(t => col.append(card(t)));
    cols.append(col); col.scrollTop = scroll[i] || 0;
  });
}
function card(t) {
  const ag = byKey(currentKey(t));
  const c = el('div', 'card'); c.dataset.task = t.id; if (ag) c.style.setProperty('--c', ag.a.color);
  const top = el('div', 'top');
  const grip = button('grip', '⠿'); grip.setAttribute('aria-label', 'اسحب المهمة'); grip.title = 'اسحب المهمة إلى وكيل أو عمود';
  grip.addEventListener('pointerdown', e => startDrag(e, t, c));
  const ttl = button('linkish', t.title, () => openTask(t)); ttl.style.color = 'var(--fg)'; ttl.style.fontWeight = '600';
  top.append(grip, ttl); c.append(top);
  if (t.chain.length) {
    const who = el('div', 'who');
    t.chain.forEach((k, i) => {
      const o = byKey(k); const s = el('span'); const dot = el('i'); dot.style.setProperty('--c', o?.a.color || '#94a3b8');
      s.append(dot, document.createTextNode(nameOf(k))); if (i === t.step && t.status !== 'done') s.style.color = 'var(--fg)';
      who.append(s); if (i < t.chain.length - 1) who.append(document.createTextNode('←'));
    });
    c.append(who);
  }
  if (t.status === 'doing') { const b = el('div', 'bar'); b.dataset.prog = t.id; b.append(el('i')); b.firstChild.style.width = Math.round((t.progress || 0) * 100) + '%'; c.append(b); }
  const st = STATUS_TEXT(t); if (st) c.append(el('div', t.error ? 'err' : 'muted', st));
  const acts = el('div', 'acts');
  if (t.status === 'todo' && !t.chain.length) {
    const s = el('select'); s.setAttribute('aria-label', 'أسند إلى'); s.append(new Option('أسند إلى…', ''));
    S.agents.forEach(o => s.append(new Option(o.a.name, o.a.key)));
    s.onchange = () => s.value && assign(t, s.value); acts.append(s);
  }
  if (t.status === 'todo' && t.paused) acts.append(button('btn primary', t.error ? 'أعد المحاولة' : 'استئناف', () => { t.paused = false; t.error = ''; save(t); schedule(); }));
  if (t.status === 'doing') acts.append(button('btn', 'إيقاف', () => moveTo(t, 'todo')));
  if (t.status === 'review') { acts.append(button('btn primary', 'موافقة', () => approve(t)), button('btn', 'طلب تعديل', () => revise(t))); }
  const last = S.files.find(f => f.id === t.outputs[t.outputs.length - 1]);
  if (last) acts.append(button('btn', 'عرض الملف', () => openFile(last)));
  if (acts.children.length) c.append(acts);
  return c;
}
on('tasks-changed', () => renderBoard());
on('progress', t => {
  document.querySelectorAll(`[data-prog="${t.id}"] i`).forEach(i => { i.style.width = Math.round((t.progress || 0) * 100) + '%'; });
});
function flashHint(text) { const h = $('board-hint'); h.textContent = text; h.style.color = '#ffb4b6'; clearTimeout(flashHint.t); flashHint.t = setTimeout(() => { h.textContent = 'اسحب المهمة من ⠿ وأفلتها على روبوت أو على اسم وكيل'; h.style.color = ''; }, 2500); }

/* ------------------------------------------------------------------ drag a card onto an agent or a column */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function agentAt(x, y) {
  const elAt = document.elementFromPoint(x, y);
  const m = elAt?.closest?.('[data-key]'); if (m) return byKey(m.dataset.key);
  if (elAt === renderer.domElement) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(S.hitMeshes)[0]?.object.userData.ag || null;
  }
  return null;
}
function startDrag(e, t, cardEl) {
  e.preventDefault();
  const ghost = cardEl.cloneNode(true); ghost.classList.add('ghost'); document.body.append(ghost);
  const move = ev => { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; highlight(ev.clientX, ev.clientY); };
  let lastTarget = null;
  const highlight = (x, y) => {
    lastTarget?.classList?.remove('droptarget', 'over'); S.agents.forEach(o => { o.dropHover = false; });
    const elAt = document.elementFromPoint(x, y);
    const colEl = elAt?.closest?.('.col'); const ag = agentAt(x, y);
    if (colEl) { colEl.classList.add('over'); lastTarget = colEl; }
    else if (ag) { ag.dropHover = true; lastTarget = ag.memberBtn || null; lastTarget?.classList.add('droptarget'); gsap.to(ag, { selA: 1, duration: D(0.2) }); }
    S.agents.forEach(o => { if (!o.dropHover && o !== S.focused) gsap.to(o, { selA: 0, duration: D(0.2) }); });
  };
  move(e);
  const up = ev => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    ghost.remove(); lastTarget?.classList?.remove('droptarget', 'over');
    S.agents.forEach(o => { o.dropHover = false; if (o !== S.focused) gsap.to(o, { selA: 0, duration: D(0.2) }); });
    if (ev.type === 'pointercancel') return;
    const colEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.col');
    if (colEl) return moveTo(t, colEl.dataset.status);
    const ag = agentAt(ev.clientX, ev.clientY);
    if (ag) { assign(t, ag.a.key); showBubble(ag, 'حاضر، سأبدأ', 2200); ag.kick = 1; }
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

/* ------------------------------------------------------------------ after a reload */
export function restoreTasks() {
  S.tasks.forEach(t => {
    if (t.status === 'doing') { t.status = 'todo'; t.paused = true; t.error = ''; }
    if (!Array.isArray(t.chain)) t.chain = [];
    if (!Array.isArray(t.outputs)) t.outputs = [];
  });
  renderBoard();
}
export function initBoard() {
  $('task-new').onclick = () => openNewTask();
  renderBoard();
}
