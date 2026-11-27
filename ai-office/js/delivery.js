// Real work with connected services: send a file by Gmail, save it to Google Drive, summarise your inbox.
// Sending and saving always go through the approvals box first; reading the inbox only happens when you click.
import { el, button, on, clip } from './util.js';
import { S, byKey } from './state.js';
import { INTEGRATIONS, integrationStatus, checkConnections, callIntegration, mcpErrText } from './integrations.js';
import { requestApproval, registerExecutor } from './approvals.js';
import { openModal, fileActions } from './modal.js';
import { AI, aiReady, identity, errText } from './ai.js';
import { checkBudget, recordUsage } from './usage.js';
import { addEvent } from './log.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

registerExecutor('email', async a => {
  const r = await callIntegration('gmail', 'send_message', { to: [a.payload.to], subject: a.payload.subject, body: a.payload.body });
  return `أُرسلت الرسالة إلى ${a.payload.to}${r?.viewUrl ? ` · ${r.viewUrl}` : ''}`;
});
registerExecutor('drive', async a => {
  const r = await callIntegration('drive', 'create_file', { title: a.payload.title, textContent: a.payload.text, contentMimeType: 'text/plain' });
  return `حُفظ الملف في Google Drive${r?.webViewLink || r?.url ? ` · ${r.webViewLink || r.url}` : ''}`;
});

export function askSendFile(file, to = '') {
  const frag = document.createDocumentFragment();
  const addr = el('input'); addr.type = 'email'; addr.dir = 'ltr'; addr.id = 'mail-to'; addr.value = to; addr.placeholder = 'name@example.com';
  const subj = el('input'); subj.id = 'mail-subject'; subj.value = file.title;
  const f = (l, n) => { const x = el('label', 'field', l); x.append(n); return x; };
  const msg = el('p', 'lead', 'لن تُرسل الرسالة الآن: ستذهب إلى صندوق الموافقات، وتُرسل من بريدك في Gmail بعد موافقتك.');
  frag.append(msg, f('إلى', addr), f('الموضوع', subj));
  let close;
  const go = button('btn primary', 'اطلب الموافقة على الإرسال', () => {
    const t = addr.value.trim(); if (!EMAIL.test(t)) { msg.textContent = 'اكتب بريداً إلكترونياً صحيحاً.'; return addr.focus(); }
    requestApproval({ kind: 'email', agentKey: file.agentKey, title: `إرسال «${clip(file.title, 40)}» إلى ${t}`,
      preview: `إلى: ${t}\nالموضوع: ${subj.value}\n\n${file.content}`, payload: { to: t, subject: subj.value.slice(0, 200), body: file.content } });
    close();
  });
  close = openModal('إرسال بالبريد', frag, [go]);
}
export function askSaveDrive(file) {
  requestApproval({ kind: 'drive', agentKey: file.agentKey, title: `حفظ «${clip(file.title, 50)}» في Google Drive`,
    preview: `اسم الملف: ${file.title}\n\n${clip(file.content, 3000)}`, payload: { title: file.title, text: file.content } });
}
fileActions.push(file => [button('btn', 'أرسل بالبريد', () => askSendFile(file)), button('btn', 'احفظ في Drive', () => askSaveDrive(file))]);

// a task can be delivered automatically once it is done (still through the approvals box)
on('deliver', t => {
  const f = S.files.find(x => x.id === t.outputs[t.outputs.length - 1]); if (!f || !t.after) return;
  if (t.after.kind === 'email' && EMAIL.test(t.after.to || '')) requestApproval({ kind: 'email', agentKey: f.agentKey, title: `إرسال «${clip(f.title, 40)}» إلى ${t.after.to}`,
    preview: `إلى: ${t.after.to}\nالموضوع: ${f.title}\n\n${f.content}`, payload: { to: t.after.to, subject: f.title, body: f.content } });
  if (t.after.kind === 'drive') askSaveDrive(f);
});

/** Read today's inbox and have the agent summarise it (reading needs no approval, but only runs when you click). */
export async function summarizeInbox(ag) {
  const frag = document.createDocumentFragment(); const out = el('div', 'doc', 'أقرأ بريدك…'); frag.append(out);
  openModal(`${ag.a.name} يلخّص بريدك`, frag);
  let threads;
  try { threads = await callIntegration('gmail', 'search_threads', { query: 'in:inbox newer_than:2d', pageSize: 15, view: 'THREAD_VIEW_SUMMARY' }); }
  catch (e) { out.textContent = mcpErrText(e); return; }
  const list = (threads?.threads || []).map(th => { const m = th.messages?.[0] || {}; return `- من ${m.sender || ''}: ${m.subject || ''} — ${clip(m.snippet || '', 200)}`; });
  if (!list.length) { out.textContent = 'لا توجد رسائل جديدة في آخر يومين.'; return; }
  if (!aiReady()) { out.textContent = list.join('\n'); return; }
  try {
    checkBudget(ag);
    const prompt = `${identity(ag)}\n\nهذه رسائل بريد المستخدم في آخر يومين (عناوين ومقتطفات فقط):\n${list.join('\n')}\n\nلخّصها له من زاوية تخصصك: ما العاجل، وما يحتاج رداً، وما يمكن تجاهله. نص عادي، نقاط مرقمة، بالعربية.`;
    const r = await AI.sample(prompt, { modelTier: 'default', onText: ({ text }) => { out.textContent = text; } });
    out.textContent = r.text.trim(); recordUsage(ag, prompt.length, r.text.length);
    addEvent(ag, 'لخّص بريدك الوارد');
  } catch (e) { out.textContent = errText(e); }
}

/* ------------------------------------------------------------------ services screen */
const LABEL = { ready: 'متصل', off: 'غير متصل', unknown: 'لم يُفحص', none: 'غير متوفر بعد' };
export function openServices() {
  const frag = document.createDocumentFragment();
  frag.append(el('p', 'lead', 'الوكلاء يستخدمون الخدمات عبر موصلات حسابك في claude.ai، فلا توجد أي مفاتيح داخل هذه الصفحة. كل إرسال أو حفظ أو مكالمة ينتظر موافقتك في صندوق الموافقات.'));
  const ul = el('ul', 'tlist');
  const draw = () => {
    ul.replaceChildren();
    Object.entries(INTEGRATIONS).forEach(([k, i]) => {
      const li = el('li'), st = integrationStatus(k);
      const chip = el('span', 'badge' + (st === 'ready' ? '' : ' idle'), LABEL[st] || st); chip.style.alignSelf = 'flex-start';
      li.append(el('b', '', i.label), el('small', '', i.about), chip); ul.append(li);
    });
  };
  draw(); frag.append(ul);
  const check = button('btn primary', 'افحص الاتصال', async () => { check.disabled = true; await checkConnections(); draw(); check.disabled = false; });
  openModal('الخدمات المربوطة', frag, [check]);
}
export { byKey };
