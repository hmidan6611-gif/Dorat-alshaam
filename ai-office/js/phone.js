// Phone calls through Bland (claude.ai connector). The agent prepares a call script; the call is placed
// only after you approve it in the approvals box.
import { el, button, clip } from './util.js';
import { isFemale } from './state.js';
import { AI, aiReady, identity, errText } from './ai.js';
import { callIntegration, integrationStatus, checkConnections, mcpErrText } from './integrations.js';
import { requestApproval, registerExecutor } from './approvals.js';
import { openModal } from './modal.js';
import { addEvent } from './log.js';
import { byKey } from './state.js';
import { showBubble } from './agents.js';

const E164 = /^\+[1-9]\d{7,14}$/;

export function openCallSetup(ag) {
  const frag = document.createDocumentFragment();
  const num = el('input'); num.id = 'call-number'; num.type = 'tel'; num.dir = 'ltr'; num.placeholder = '+9665XXXXXXXX'; num.autocomplete = 'off';
  const goal = el('textarea'); goal.id = 'call-goal'; goal.rows = 3; goal.placeholder = 'مثلاً: متابعة عرض السعر الذي أرسلناه أمس وحجز موعد عرض تجريبي';
  const script = el('textarea'); script.id = 'call-script'; script.rows = 7; script.placeholder = 'سيكتب الوكيل نص المكالمة هنا، ويمكنك تعديله قبل طلب الموافقة.';
  const status = el('p', 'lead');
  const f = (label, node) => { const l = el('label', 'field', label); l.append(node); return l; };
  frag.append(el('p', 'lead', `يجهّز ${ag.a.name} المكالمة، وتراجعها أنت. لا تُجرى أي مكالمة إلا بعد موافقتك من صندوق الموافقات. المكالمات تمر عبر موصل Bland في حسابك.`),
    f('رقم الهاتف بالصيغة الدولية', num), f('هدف المكالمة', goal), f('نص المكالمة', script), status);
  const conn = integrationStatus('phone');
  if (conn !== 'ready') status.textContent = 'تأكد أن موصل Bland متصل في حسابك على claude.ai. سنتحقق عند الطلب.';
  let close;
  const draft = button('btn', 'اكتب نص المكالمة', async () => {
    if (!goal.value.trim()) return goal.focus();
    if (!aiReady()) { status.textContent = 'كتابة النص تحتاج Claude. يمكنك كتابته بنفسك.'; return; }
    draft.disabled = true; status.textContent = `${ag.a.name} ${isFemale(ag.a) ? 'تكتب' : 'يكتب'} نص المكالمة…`;
    try {
      const r = await AI.sample(`${identity(ag)}

جهّز تعليمات لوكيل صوتي سيجري مكالمة هاتفية نيابة عنك.
هدف المكالمة: ${goal.value.trim()}
اكتب التعليمات بصيغة مباشرة للوكيل الصوتي: من هو ومن يمثل، وهدف المكالمة، والنقاط التي يجب تغطيتها، وكيف يرد على الاعتراضات الشائعة، ومتى ينهي المكالمة بلطف.
- يتكلم بالعربية بلهجة مهذبة وواضحة، ولا يدّعي أنه إنسان إذا سُئل.
- لا يطلب أي بيانات دفع أو كلمات مرور.
- نص عادي بلا Markdown، 120 إلى 250 كلمة.`, { modelTier: 'default' });
      script.value = r.text.trim(); status.textContent = 'راجع النص وعدّله إن أردت، ثم اطلب الموافقة.';
    } catch (e) { status.textContent = errText(e); }
    draft.disabled = false;
  });
  const ask = button('btn primary', 'اطلب الموافقة على المكالمة', () => {
    const n = num.value.replace(/[\s()-]/g, '');
    if (!E164.test(n)) { status.textContent = 'اكتب الرقم بالصيغة الدولية، مثل ‎+9665XXXXXXXX'; return num.focus(); }
    if (!script.value.trim()) { status.textContent = 'اكتب نص المكالمة أو اطلب من الوكيل كتابته.'; return script.focus(); }
    requestApproval({ kind: 'call', agentKey: ag.a.key, title: `مكالمة إلى \u2066${n}\u2069: ${clip(goal.value.trim() || 'بدون عنوان', 50)}`,
      preview: `الرقم: \u2066${n}\u2069\nالهدف: ${goal.value.trim()}\n\nنص المكالمة:\n${script.value.trim()}`,
      payload: { phone_number: n, task: script.value.trim(), record: true, max_duration: 8, metadata: { from: 'deskhive', agent: ag.a.key } } });
    showBubble(ag, 'جهّزت المكالمة، بانتظار موافقتك', 2600);
    close();
  });
  close = openModal(`مكالمة من ${ag.a.name}`, frag, [ask, draft]);
  if (conn === 'unknown') checkConnections();
}

registerExecutor('call', async a => {
  const res = await callIntegration('phone', 'send_call', a.payload);
  const id = res?.call_id || res?.id || '';
  a.payload.callId = id;
  const ag = byKey(a.agentKey); if (ag) { addEvent(ag, `بدأت المكالمة${id ? ' (' + id + ')' : ''}`); showBubble(ag, 'المكالمة جارية…', 3000); }
  return id ? `بدأت المكالمة. رقمها في Bland: ${id}` : 'أُرسل طلب المكالمة إلى Bland.';
});
/** Fetch the transcript and summary of a placed call. */
export async function callLog(a) {
  if (!a.payload?.callId) return 'لا يوجد رقم مكالمة بعد.';
  try {
    const r = await callIntegration('phone', 'get_call_log', { id: a.payload.callId });
    return [r?.summary && `الملخص: ${r.summary}`, r?.concatenated_transcript || r?.transcript].filter(Boolean).join('\n\n') || JSON.stringify(r).slice(0, 2000);
  } catch (e) { return mcpErrText(e); }
}
