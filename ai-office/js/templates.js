// Agent store: ready-made agents (writer, marketer, accountant, designer, support...) installed with one click.
import { el, button } from './util.js';
import { S } from './state.js';
import { openModal } from './modal.js';
import { installAgent, hasRoom } from './newagent.js';
import { floorById } from './floors.js';
import { addFloor } from './floorsui.js';
import { canAddAgent, openPlans } from './plans.js';

export const TEMPLATES = [
  { id: 'writer', name: 'لين', role: 'كاتبة محتوى', gender: 'f', color: '#f472b6', voice: 'glassy', personality: 'مبدع ويقترح أفكاراً جريئة', shape: { head: 'round', antenna: 'ball', acc: 'headphones' },
    desc: 'تكتب المقالات والمنشورات ونصوص الإعلانات بأسلوب جذاب وواضح.', tasks: ['أكتب مقالاً', 'أصيغ منشورات الأسبوع', 'أراجع النبرة'], questions: ['اكتبي منشوراً لإنستغرام', 'اقترحي 5 عناوين لمقال'] },
  { id: 'marketer', name: 'ماجد', role: 'مسوّق رقمي', gender: 'm', color: '#fb923c', voice: 'buttery', personality: 'ودود ومتعاون', shape: { head: 'box', antenna: 'double', acc: 'cap' },
    desc: 'يخطط للحملات ويختار القنوات والميزانيات ويقيس النتائج.', tasks: ['أخطط حملة', 'أحلل الإعلانات', 'أوزّع الميزانية'], questions: ['خطة حملة بـ3000 ريال', 'أي قناة أفضل لمنتجنا؟'] },
  { id: 'accountant', name: 'سالم', role: 'محاسب', gender: 'm', color: '#a3e635', voice: 'rounded', personality: 'دقيق ويحب التفاصيل', shape: { head: 'tall', antenna: 'none', acc: 'none' },
    desc: 'يعد الميزانيات والتقارير المالية ويحسب الربحية والتدفق النقدي.', tasks: ['أراجع القيود', 'أعد الميزانية', 'أحسب الربحية'], questions: ['ميزانية تقديرية لربع سنة', 'كيف نخفض المصاريف؟'] },
  { id: 'designer', name: 'ريم', role: 'مصممة واجهات', gender: 'f', color: '#c084fc', voice: 'airy', personality: 'مبدع ويقترح أفكاراً جريئة', shape: { head: 'round', antenna: 'double', acc: 'none' },
    desc: 'تصمم الشاشات وتجربة المستخدم وتكتب مواصفات التصميم للمطورين.', tasks: ['أرسم الشاشات', 'أختبر التجربة', 'أكتب المواصفات'], questions: ['صممي صفحة هبوط', 'راجعي تجربة التسجيل'] },
  { id: 'support', name: 'هادي', role: 'دعم فني', gender: 'm', color: '#22d3ee', voice: 'buttery', personality: 'هادئ ومختصر', shape: { head: 'box', antenna: 'ball', acc: 'headphones' },
    desc: 'يرد على العملاء ويحل المشكلات التقنية ويكتب مقالات المساعدة.', tasks: ['أرد على التذاكر', 'أكتب حلاً', 'أحدّث الأسئلة الشائعة'], questions: ['رد على عميل غاضب', 'اكتب مقال مساعدة'] },
  { id: 'sales', name: 'نور', role: 'مندوبة مبيعات', gender: 'f', color: '#facc15', voice: 'airy', personality: 'ودود ومتعاون', shape: { head: 'box', antenna: 'ball', acc: 'headphones' },
    desc: 'تتابع العملاء المحتملين وتكتب العروض وتجهز المكالمات.', tasks: ['أتابع العملاء', 'أكتب عرض سعر', 'أجهز مكالمة'], questions: ['اكتبي عرض سعر', 'رسالة متابعة لعميل'] },
  { id: 'developer', name: 'زياد', role: 'مطوّر برمجيات', gender: 'm', color: '#60a5fa', voice: 'rounded', personality: 'دقيق ويحب التفاصيل', shape: { head: 'tall', antenna: 'double', acc: 'headphones' },
    desc: 'يكتب الكود ويقترح الحلول التقنية ويشرحها بوضوح.', tasks: ['أكتب الكود', 'أصلح خطأ', 'أراجع الأداء'], questions: ['اكتب دالة تحقق', 'اشرح هذا الخطأ'] },
  { id: 'pm', name: 'دانة', role: 'مديرة مشاريع', gender: 'f', color: '#94a3b8', voice: 'glassy', personality: 'رسمي ومنظم', shape: { head: 'tall', antenna: 'ball', acc: 'none' },
    desc: 'تخطط المشاريع وتحدد المراحل والمخاطر وتتابع المواعيد.', tasks: ['أخطط المراحل', 'أتابع المواعيد', 'أكتب تقرير الحالة'], questions: ['خطة مشروع لشهرين', 'ما أكبر المخاطر؟'] },
];

export function openStore() {
  const frag = document.createDocumentFragment();
  frag.append(el('p', 'lead', 'وكلاء جاهزون بشخصياتهم وأصواتهم وأشكالهم. اضغط «ركّب» فينضم الوكيل فوراً إلى الطابق الحالي بمكتب جديد.'));
  const grid = el('div', 'store');
  TEMPLATES.forEach(tp => {
    const c = el('div', 'tpl'); c.style.setProperty('--c', tp.color);
    const ava = el('span', 'ava'); ava.append(el('i'));
    const head = el('div', 'row'); head.style.alignItems = 'center'; head.append(ava, el('b', '', `${tp.name} · ${tp.role}`));
    c.append(head, el('p', '', tp.desc), el('small', 'muted', tp.personality));
    const b = button('btn primary', 'ركّب', () => {
      if (!canAddAgent()) { close(); openPlans('وصلت إلى حد الوكلاء في خطتك. اختر خطة أكبر لإضافة المزيد.'); return; }
      // the floor you are looking at first, then any other floor with space
      let floor = [floorById(S.viewFloor), ...S.floors].find(f => f && hasRoom(f));
      if (!floor) {
        if (!b.dataset.grow) { b.dataset.grow = '1'; b.textContent = 'كل الطوابق ممتلئة: اضغط لإضافة طابق وتركيبه'; return; }
        floor = addFloor({ name: `فريق ${S.floors.length + 1}`, color: tp.color });
      }
      const a = { key: 'c' + Date.now().toString(36), name: tp.name, role: tp.role, desc: tp.desc, gender: tp.gender, color: tp.color, voice: tp.voice,
        personality: tp.personality, shape: tp.shape, tasks: tp.tasks, chips: Object.fromEntries(tp.questions.map(q => [q, ''])),
        intro: `${tp.name}، ${tp.role}. ${tp.desc}`, working: true, custom: true, history: [], template: tp.id };
      installAgent(a, floor);
      b.disabled = true; b.textContent = 'انضم إلى الفريق';
    });
    c.append(b); grid.append(c);
  });
  frag.append(grid);
  const close = openModal('متجر الوكلاء', frag);
}
