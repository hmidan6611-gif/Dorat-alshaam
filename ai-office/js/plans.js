// Subscription plans by number of agents (no real payment yet). The chosen plan limits how many agents you can add.
import { el, button, emit } from './util.js';
import { S } from './state.js';
import { put } from './store.js';
import { openModal } from './modal.js';

export const PLANS = [
  { id: 'free', name: 'مجاني', price: '0', agents: 3, perks: ['حتى 3 وكلاء', 'لوحة المهام والمحادثة', 'طابق واحد'] },
  { id: 'pro', name: 'احترافي', price: '99', agents: 10, perks: ['حتى 10 وكلاء', 'وكيل المدير والأهداف', 'طوابق وأقسام', 'الربط بالخدمات وصندوق الموافقات'] },
  { id: 'business', name: 'شركات', price: '349', agents: Infinity, perks: ['وكلاء بلا حد', 'تعدد المستخدمين', 'إعادة اليوم والإحصائيات الكاملة', 'دعم أولوية'] },
];
export const currentPlan = () => PLANS.find(p => p.id === S.plan) || PLANS[1];
/** Can one more agent be added under the current plan? Agents above the limit from before stay. */
export const canAddAgent = () => S.agents.length < currentPlan().agents;
export function restorePlan(prefs) { const p = (prefs || []).find(d => d.id === 'plan'); if (p && PLANS.some(x => x.id === p.plan)) S.plan = p.plan; }

export function openPlans(reason = '') {
  const frag = document.createDocumentFragment();
  if (reason) frag.append(el('p', 'lead', reason));
  frag.append(el('p', 'muted', `لديك الآن ${S.agents.length} وكلاء. الأسعار تجريبية بالريال شهرياً، والدفع غير مفعّل بعد: اختيار خطة يغيّر الحد فوراً بدون أي دفع.`));
  const grid = el('div', 'plans');
  PLANS.forEach(p => {
    const c = el('div', 'plan-card' + (p.id === currentPlan().id ? ' on' : ''));
    c.append(el('b', '', p.name), el('div', 'price', p.price === '0' ? 'مجاناً' : `${p.price} ر.س / شهر`));
    const ul = el('ul'); p.perks.forEach(x => ul.append(el('li', '', x))); c.append(ul);
    const fits = S.agents.length <= p.agents;
    const b = button('btn ' + (p.id === currentPlan().id ? '' : 'primary'), p.id === currentPlan().id ? 'خطتك الحالية' : 'اختر هذه الخطة', () => {
      S.plan = p.id; put('prefs', 'plan', { plan: p.id, at: Date.now() }); emit('plan-changed'); close(); openPlans();
    });
    b.disabled = p.id === currentPlan().id;
    c.append(b);
    if (!fits) c.append(el('small', 'muted', 'وكلاؤك الحاليون يبقون، لكن لا يمكنك إضافة المزيد'));
    grid.append(c);
  });
  frag.append(grid);
  const close = openModal('الاشتراكات', frag);
}
