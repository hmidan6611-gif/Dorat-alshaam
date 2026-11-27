// Quality: you rate finished work (stars and a note the agent remembers), and the CEO can review a task's
// result before it reaches you, sending it back once with notes when it falls short.
import { el, button, emit, clip } from './util.js';
import { S, byKey, isFemale } from './state.js';
import { put } from './store.js';
import { AI, aiReady, identity } from './ai.js';
import { remember, giveXp } from './growth.js';
import { nudgeMood, showBubble } from './agents.js';
import { handoffBeam } from './scene.js';
import { addEvent } from './log.js';
import { openModal } from './modal.js';
import { checkBudget, recordUsage } from './usage.js';

const saveTask = t => { t.updatedAt = Date.now(); put('tasks', t.id, t); emit('tasks-changed', t); };

/** A row of 5 stars; `onPick(n)` when one is chosen. */
export function stars(current = 0, onPick = null) {
  const box = el('div', 'stars'); box.setAttribute('role', onPick ? 'radiogroup' : 'img'); box.setAttribute('aria-label', `التقييم ${current} من 5`);
  for (let i = 1; i <= 5; i++) {
    const s = onPick ? button('star', '★', () => onPick(i)) : el('span', 'star', '★');
    s.classList.toggle('on', i <= current);
    if (onPick) { s.setAttribute('aria-label', `${i} من 5`); s.setAttribute('aria-pressed', String(i === current)); }
    box.append(s);
  }
  return box;
}

/** Save a rating; the agent who delivered remembers what you said and grows from good work. */
export function rateTask(t, n, note = '') {
  const ag = byKey(t.chain[t.chain.length - 1]); if (!ag) return;
  const first = !t.rating;
  t.rating = { stars: n, note: clip(note.trim(), 300), at: Date.now() }; saveTask(t);
  if (note.trim() || n <= 2 || n === 5) remember(ag, `تقييم المستخدم لعملك «${clip(t.title, 50)}»: ${n} من 5${note.trim() ? `. ملاحظته: ${note.trim()}` : ''}`, 'rating');
  if (first) { if (n >= 4) giveXp(ag, n === 5 ? 40 : 15, 'تقييم عالٍ'); nudgeMood(ag, (n - 3) * 6); }
  showBubble(ag, n >= 4 ? 'شكراً على التقييم!' : 'سأتحسن، شكراً للملاحظة', 2400);
  addEvent(ag, `قيّمت «${clip(t.title, 50)}»: ${n} من 5`, t.id);
}
export function askRating(t) {
  const ag = byKey(t.chain[t.chain.length - 1]); if (!ag) return;
  const frag = document.createDocumentFragment();
  let n = t.rating?.stars || 0;
  const row = el('div'); const draw = () => row.replaceChildren(stars(n, v => { n = v; draw(); }));
  draw();
  const note = el('textarea'); note.id = 'rate-note'; note.rows = 3; note.maxLength = 300; note.value = t.rating?.note || '';
  note.placeholder = 'اختياري: ما الذي أعجبك أو ما الذي يجب أن يتحسن؟ يتذكره الوكيل في أعماله القادمة.';
  frag.append(el('p', 'lead', `كيف كان عمل ${ag.a.name} في «${t.title}»؟`), row, note);
  let close;
  const save = button('btn primary', 'احفظ التقييم', () => { if (!n) return; rateTask(t, n, note.value); close(); });
  close = openModal('قيّم العمل', frag, [save]);
}
/** Average stars an agent received (null when never rated). */
export function ratingOf(key) {
  const rs = S.tasks.filter(t => t.rating && t.chain[t.chain.length - 1] === key).map(t => t.rating.stars);
  return rs.length ? { avg: rs.reduce((a, b) => a + b, 0) / rs.length, count: rs.length } : null;
}

/* ------------------------------------------------------------------ CEO quality review */
/** The CEO reads the result against the task; returns {score, ok, notes}. Never throws (a failed review lets the work through). */
export async function qaReview(t, ag, file) {
  const boss = byKey('ceo');
  if (!boss || boss === ag || !aiReady()) return null;
  showBubble(boss, isFemale(boss.a) ? 'أراجع الجودة…' : 'أراجع الجودة…', 3000); handoffBeam(ag, boss, 2.2);
  addEvent(boss, `يراجع جودة «${clip(t.title, 50)}» قبل التسليم`, t.id);
  try {
    checkBudget(boss);
    const prompt = `${identity(boss, `${t.title} ${t.desc || ''}`)}

راجع جودة هذا العمل قبل أن يصل إلى المستخدم، كمدير صارم وعادل.
المهمة: ${t.title}
${t.desc ? `المطلوب: ${t.desc}\n` : ''}ما سلّمه ${ag.a.name} (${ag.a.role}):
«${clip(file.content, 9000)}»

قيّم من 10: هل يلبي المطلوب بالضبط، هل هو دقيق ومتسق مع معلومات الشركة، هل هو عملي وواضح ومكتمل.
أعد JSON فقط: {"score": 8, "notes": "ملاحظات محددة وقابلة للتنفيذ في 1 إلى 4 نقاط، أو فارغ إذا كان ممتازاً"}`;
    const r = await AI.sample.json(prompt, { modelTier: 'default' });
    recordUsage(boss, prompt.length, 300);
    const score = Math.max(1, Math.min(10, Math.round(Number(r?.score) || 7)));
    const notes = typeof r?.notes === 'string' ? clip(r.notes.trim(), 900) : '';
    return { score, ok: score >= 7, notes };
  } catch { return null; }
}
