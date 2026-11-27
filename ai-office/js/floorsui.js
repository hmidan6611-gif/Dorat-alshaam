// Floor switcher (an elevator panel) and adding department floors.
import { $, el, button, uid } from './util.js';
import { S } from './state.js';
import { buildFloor, saveFloor, floorById } from './floors.js';
import { defaultDeptObjects } from './layout.js';
import { openModal } from './modal.js';

const PRESETS = [
  { name: 'التسويق', dept: 'تسويق', color: '#f472b6' },
  { name: 'المبيعات', dept: 'مبيعات', color: '#ffc53d' },
  { name: 'الدعم الفني', dept: 'دعم فني', color: '#2fe08a' },
];
let ui = {};

export function renderFloorsUI() {
  const nav = $('floors'); if (!nav) return;
  nav.replaceChildren();
  S.floors.forEach((f, i) => {
    const b = button('floorbtn', null, () => ui.viewFloor(f.id));
    b.style.setProperty('--c', f.color); b.setAttribute('aria-pressed', String(S.viewFloor === f.id));
    const n = S.agents.filter(o => o.a.floorId === f.id).length;
    b.append(el('b', '', String(i + 1)), el('span', '', f.name), el('small', '', String(n)));
    b.title = `${f.name} · ${n} وكلاء`;
    nav.append(b);
  });
  if (S.floors.length < 6) nav.append(button('floorbtn add', '+ طابق', openAddFloor));
}

function openAddFloor() {
  const frag = document.createDocumentFragment();
  const name = el('input'); name.id = 'floor-name'; name.maxLength = 24; name.placeholder = 'مثلاً: التسويق';
  let color = PRESETS[0].color;
  const chips = el('div', 'chips'); chips.style.padding = '0';
  const unused = PRESETS.filter(p => !S.floors.some(f => f.name === p.name));
  unused.forEach(p => chips.append(button('', p.name, () => { name.value = p.name; color = p.color; })));
  const field = el('label', 'field', 'اسم الطابق أو القسم'); field.append(name);
  frag.append(el('p', 'lead', 'كل طابق قسم مستقل فيه مكاتبه ومصعده واستراحته. الوكلاء يتنقلون بين الطوابق بالمصعد عند التسليم والاجتماعات.'), chips, field);
  let close;
  const go = button('btn primary', 'أضف الطابق', () => {
    const v = name.value.trim(); if (!v) return name.focus();
    const preset = PRESETS.find(p => p.name === v);
    const f = { id: uid('fl'), name: v.slice(0, 24), dept: preset?.dept || v, color: preset?.color || color, order: S.floors.length, objects: defaultDeptObjects(3) };
    S.floors.push(f); buildFloor(f, true); saveFloor(f);
    close(); renderFloorsUI(); ui.viewFloor(f.id);
  });
  close = openModal('طابق جديد', frag, [go]);
}

export function initFloorsUI(hooks) {
  ui = hooks;
  renderFloorsUI();
}
export { floorById };
