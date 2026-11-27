// Claude through the page's "sample" capability: availability, errors and agent personas.
import { $, emit } from './util.js';
import { S, isFemale } from './state.js';
import { memoryPrompt } from './growth.js';

export const AI = { sample: null, off: false };
export const aiReady = () => !!AI.sample && !AI.off;

export function initAI() {
  if (!window.claude?.use) return;
  window.claude.use('sample').then(fn => { AI.sample = fn; updateMode(); emit('ai-changed'); }).catch(() => {});
}
export function updateMode() {
  const m = $('ai-mode'); if (!m) return;
  m.textContent = aiReady() ? 'Claude' : 'ردود تجريبية';
  m.classList.toggle('off', !aiReady());
  m.title = aiReady() ? 'الردود يكتبها Claude الآن' : 'الذكاء الاصطناعي غير متاح هنا، والردود مكتوبة مسبقاً';
}

export const ERR = {
  not_granted: 'لم يُسمح للصفحة باستخدام Claude، فسأرد بردود تجريبية.',
  sampling_disabled: 'استخدام Claude معطّل في هذا الحساب، فسأرد بردود تجريبية.',
  capability_disabled: 'استخدام Claude غير متاح هنا، فسأرد بردود تجريبية.',
  capability_removed: 'استخدام Claude غير متاح هنا، فسأرد بردود تجريبية.',
  not_declared: 'استخدام Claude غير متاح هنا، فسأرد بردود تجريبية.',
  rate_limited: 'وصلنا إلى حد الطلبات مؤقتاً. انتظر قليلاً ثم أعد المحاولة.',
  session_expired: 'انتهت الجلسة. حدّث الصفحة ثم أعد المحاولة.',
  refused: 'لا أستطيع المساعدة في هذا الطلب.',
  prompt_too_large: 'النص طويل جداً. اختصره وأعد المحاولة.',
  invalid_json: 'جاء الرد بشكل غير مفهوم. أعد المحاولة.',
};
const FATAL = new Set(['not_granted', 'sampling_disabled', 'capability_disabled', 'capability_removed', 'not_declared']);
export const errText = e => ERR[e?.code] || 'تعذّر الحصول على رد الآن. أعد المحاولة بعد قليل.';
export function noteFatal(e) { if (FATAL.has(e?.code)) { AI.off = true; updateMode(); emit('ai-changed'); } }

const teamLine = () => S.agents.map(o => `${o.a.name} (${o.a.role})`).join('، ');

/** Who the agent is: shared by chat and real work. */
export function identity(ag) {
  const a = ag.a;
  return `أنت ${a.name}، ${a.role} في «خلية المكتب»، وهو مكتب افتراضي يعمل فيه فريق من وكلاء الذكاء الاصطناعي: ${teamLine()}.
تعريفك بنفسك: ${a.intro}${a.personality ? `\nشخصيتك: ${a.personality}. دع أسلوبك يعكسها.` : ''}${a.desc ? `\nوصف عملك كما كتبه المستخدم: ${a.desc}` : ''}
${isFemale(a) ? 'تحدّثي بصيغة المؤنث.' : 'تحدّث بصيغة المذكر.'}
لا تدّعِ أنك نفّذت شيئاً حقيقياً خارج هذا المكتب، مثل إرسال بريد أو الدخول إلى نظام أو قراءة ملف لم يُعطَ لك.${memoryPrompt(ag)}`;
}
/** Chat persona: short, deep replies. */
export function persona(ag) {
  return `${identity(ag)}
مهامك هذه الأيام: ${ag.a.tasks.join('، ')}.
قواعد الرد:
- اكتب بالعربية البسيطة، وإذا كتب المستخدم بلغة أخرى فرُدّ بلغته.
- فكّر في الطلب بعمق قبل أن تجيب: حلّل السبب، واذكر الافتراضات والمخاطر، وقدّم توصية واضحة وخطوات عملية مع أمثلة أو أرقام تقديرية عند الحاجة.
- اجعل الرد مركّزاً، في حدود فقرتين إلى أربع فقرات قصيرة. اكتب نصاً عادياً بلا Markdown ولا عناوين ولا رموز تنسيق، ويمكنك ترقيم الخطوات بأسطر تبدأ بـ 1. و2. و3.
- ابقَ في شخصيتك وتخصصك. إذا كان الطلب خارج تخصصك فساعد باختصار واقترح الزميل المناسب باسمه.`;
}
