// Company profile and knowledge base: what every agent knows about your business. The profile goes into every
// prompt; documents are split into passages and only the few passages that match the work at hand are added.
// Everything stays in your private storage.
import { el, button, uid, emit, clip, fmtTime } from './util.js';
import { S } from './state.js';
import { put, del } from './store.js';
import { openModal } from './modal.js';
import { notify, registerActions } from './notify.js';

export const PROFILE_FIELDS = [
  ['name', 'اسم الشركة أو المشروع', 'مثلاً: متجر ورد الربيع', 60],
  ['activity', 'وش تسوي الشركة', 'نبيع ورد وتنسيقات للمناسبات أونلاين مع توصيل خلال ساعتين', 400],
  ['customers', 'العملاء', 'أفراد ٢٥–٤٥ سنة، وشركات للمناسبات والهدايا', 300],
  ['offer', 'المنتجات والأسعار', 'باقة صغيرة ١٥ د.ك، متوسطة ٢٥، تنسيق مناسبات من ٨٠', 600],
  ['tone', 'أسلوب الكتابة', 'ودود وراقٍ، بلهجة خليجية خفيفة، بدون مبالغة', 200],
  ['notes', 'ملاحظات مهمة', 'لا نعد بالتوصيل يوم الجمعة قبل الظهر. المنافس الأقرب: ...', 1500],
];
const MAX_DOCS = 30, MAX_DOC = 20000;
S.kb = { profile: {}, docs: [] };

export const hasProfile = () => PROFILE_FIELDS.some(([k]) => (S.kb.profile[k] || '').trim());

/* ------------------------------------------------------------------ search */
const norm = s => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْـ]/g, '').toLowerCase();
const STOP = new Set(['على', 'الى', 'الي', 'من', 'في', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'كان', 'لكن', 'and', 'the', 'for', 'with']);
const words = s => norm(s).split(/[^\p{L}\p{N}]+/u).map(w => w.replace(/^(وال|بال|كال|فال|لل|ال)/, '')).filter(w => w.length > 2 && !STOP.has(w));
function passages(doc) {
  const out = []; let cur = '';
  for (const para of doc.text.split(/\n\s*\n|\n(?=\S)/)) {
    if ((cur + '\n' + para).length > 1100 && cur) { out.push(cur); cur = ''; }
    cur = cur ? cur + '\n' + para : para;
  }
  if (cur.trim()) out.push(cur);
  return out.map(p => ({ doc, text: clip(p.trim(), 1400) }));
}
/** The passages most related to `query` (by shared words; the title counts double). */
export function searchKnowledge(query, n = 3) {
  const q = new Set(words(query)); if (!q.size || !S.kb.docs.length) return [];
  return S.kb.docs.flatMap(passages).map(p => {
    const w = words(p.text), t = words(p.doc.title);
    const score = w.filter(x => q.has(x)).length + 2 * t.filter(x => q.has(x)).length;
    return { ...p, score: score / Math.sqrt(8 + w.length) };
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
}

/** What an agent is told about the company; with a query it also gets the matching passages. */
export function kbPrompt(query = '') {
  const p = S.kb.profile, lines = PROFILE_FIELDS.filter(([k]) => (p[k] || '').trim()).map(([k, label]) => `- ${label}: ${p[k].trim()}`);
  let out = lines.length ? `\n\nمعلومات عن شركة المستخدم التي تعمل لها (التزم بها ولا تخترع ما يخالفها):\n${lines.join('\n')}` : '';
  const hits = query ? searchKnowledge(query) : [];
  if (hits.length) out += `\n\nمن ملفات الشركة، مقتطفات قد تفيدك في هذا العمل (استخدمها كمصدر وأشر إلى اسم الملف عند الاقتباس):\n${hits.map(h => `[${h.doc.title}]\n${h.text}`).join('\n\n')}`;
  if (S.kb.docs.length && !hits.length && query) out += `\n\nفي قاعدة معرفة الشركة ${S.kb.docs.length} ملفات: ${S.kb.docs.map(d => d.title).slice(0, 12).join('، ')}.`;
  return out;
}

/* ------------------------------------------------------------------ saving */
export const saveProfile = () => put('kb', 'profile', { kind: 'profile', ...S.kb.profile, at: Date.now() });
export function addDoc(title, text) {
  if (S.kb.docs.length >= MAX_DOCS) return null;
  const d = { id: uid('kb'), kind: 'doc', title: clip(title.trim() || 'ملف', 80), text: text.slice(0, MAX_DOC), at: Date.now() };
  S.kb.docs.unshift(d); put('kb', d.id, d); emit('kb-changed');
  return d;
}
export function removeDoc(id) { S.kb.docs = S.kb.docs.filter(d => d.id !== id); del('kb', id); emit('kb-changed'); }
export function restoreKnowledge(docs) {
  for (const d of docs || []) {
    if (d.id === 'profile') PROFILE_FIELDS.forEach(([k, , , max]) => { if (typeof d[k] === 'string') S.kb.profile[k] = d[k].slice(0, max); });
    else if (d.kind === 'doc' && typeof d.text === 'string' && typeof d.title === 'string') S.kb.docs.push({ id: d.id, kind: 'doc', title: d.title.slice(0, 80), text: d.text.slice(0, MAX_DOC), at: d.at || 0 });
  }
  S.kb.docs.sort((a, b) => b.at - a.at);
  emit('kb-changed');
}

/* ------------------------------------------------------------------ the screen */
export function openKnowledge(tab = 'profile') {
  const frag = document.createDocumentFragment();
  const tabs = el('div', 'seg kbtabs'); const body = el('div', 'kbbody');
  const mk = (id, label) => { const b = button('', label, () => show(id)); b.dataset.id = id; tabs.append(b); };
  mk('profile', 'ملف الشركة'); mk('docs', 'ملفات المعرفة');
  frag.append(tabs, body);
  function show(id) {
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    body.replaceChildren(id === 'profile' ? profileForm() : docsView());
  }
  openModal('ملف الشركة والمعرفة', frag);
  show(tab);
}
function profileForm() {
  const box = el('div');
  box.append(el('p', 'lead', 'كل الوكلاء يقرؤون هذا قبل أي رد أو مهمة، فيكتبون عن شركتك أنت بدل كلام عام. يُحفظ في حسابك فقط.'));
  const status = el('small', 'muted');
  PROFILE_FIELDS.forEach(([k, label, ph, max]) => {
    const long = max > 300;
    const inp = el(long ? 'textarea' : 'input'); inp.id = 'kb-' + k; inp.maxLength = max; inp.placeholder = ph; if (long) inp.rows = 3;
    inp.value = S.kb.profile[k] || '';
    inp.addEventListener('input', () => { S.kb.profile[k] = inp.value; clearTimeout(profileForm.t); profileForm.t = setTimeout(() => { saveProfile(); status.textContent = 'حُفظ ✓'; emit('kb-changed'); }, 600); });
    const f = el('label', 'field', label); f.append(inp); box.append(f);
  });
  box.append(status);
  return box;
}
function docsView() {
  const box = el('div');
  box.append(el('p', 'lead', 'أضف ما يحتاجه الفريق: عروض أسعار، سياسات، أسئلة العملاء المتكررة، أمثلة من شغلك. عند كل مهمة يأخذ الوكيل المقاطع المتعلقة بها فقط.'));
  const list = el('ul', 'tlist kbdocs');
  const draw = () => {
    list.replaceChildren();
    if (!S.kb.docs.length) list.append(el('li', 'empty', 'لا ملفات بعد.'));
    S.kb.docs.forEach(d => {
      const li = el('li');
      li.append(el('b', '', d.title), el('small', 'muted', `${Math.round(d.text.length / 5)} كلمة تقريباً · ${fmtTime(d.at)}`), el('small', '', clip(d.text.replace(/\s+/g, ' '), 140)));
      li.append(button('btn', 'حذف', () => { removeDoc(d.id); draw(); }));
      list.append(li);
    });
  };
  draw();
  const title = el('input'); title.id = 'kb-doc-title'; title.maxLength = 80; title.placeholder = 'عنوان الملف، مثلاً: سياسة الاسترجاع';
  const text = el('textarea'); text.id = 'kb-doc-text'; text.rows = 6; text.placeholder = 'الصق النص هنا…';
  const file = el('input'); file.type = 'file'; file.accept = '.txt,.md,.csv,.json,.html,text/*'; file.id = 'kb-file'; file.hidden = true;
  const msg = el('small', 'muted');
  file.onchange = async () => {
    const f = file.files?.[0]; if (!f) return;
    if (f.size > 400000) { msg.textContent = 'الملف كبير جداً. الحد ٤٠٠ كيلوبايت من النص.'; return; }
    let t = await f.text(); if (/\.html?$/i.test(f.name)) t = new DOMParser().parseFromString(t, 'text/html').body.textContent || '';
    title.value = title.value || f.name.replace(/\.[^.]+$/, ''); text.value = t.slice(0, MAX_DOC);
    msg.textContent = t.length > MAX_DOC ? `أُخذ أول ${MAX_DOC} حرف فقط.` : '';
  };
  const add = button('btn primary', 'أضف إلى المعرفة', () => {
    if (!text.value.trim()) return text.focus();
    if (!addDoc(title.value || 'ملف', text.value)) { msg.textContent = `الحد ${MAX_DOCS} ملفاً. احذف ملفاً قديماً أولاً.`; return; }
    title.value = ''; text.value = ''; msg.textContent = 'أُضيف ✓'; draw();
  });
  const pick = button('btn', 'اختر ملفاً نصياً', () => file.click());
  const ft = el('label', 'field', 'العنوان'); ft.append(title);
  const fx = el('label', 'field', 'المحتوى'); fx.append(text);
  const row = el('div', 'row'); row.append(add, pick);
  box.append(list, el('h4', '', 'ملف جديد'), ft, fx, file, row, msg, el('small', 'muted', 'ملفات PDF وWord: انسخ نصها والصقه هنا.'));
  return box;
}

/** Once a day, while the profile is empty, the CEO suggests filling it in. */
registerActions('kb', () => [{ label: 'افتح ملف الشركة', cls: 'primary', run: () => openKnowledge('profile') }]);
export function nudgeProfile() {
  if (hasProfile()) return;
  const day = new Date().toDateString();
  try { if (localStorage.getItem('deskhive:kb-nudge') === day) return; localStorage.setItem('deskhive:kb-nudge', day); } catch { /* private window */ }
  notify({ text: 'نادر: عرّفنا على شركتك (النشاط، العملاء، الأسعار، الأسلوب) ليكتب الفريق عنها أنت بدل كلام عام.', kind: 'kb', agentKey: 'ceo' });
}
