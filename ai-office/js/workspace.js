// Google Calendar and Slack through the viewer's Composio connector. Reading the calendar only happens when
// you click; booking an event and posting to Slack always wait in the approvals box first.
import { el, button, on, clip } from './util.js';
import { S } from './state.js';
import { callIntegration, mcpErrText } from './integrations.js';
import { requestApproval, registerExecutor, openApproval } from './approvals.js';
import { openModal, fileActions } from './modal.js';
import { AI, aiReady, identity, errText } from './ai.js';
import { checkBudget, recordUsage } from './usage.js';
import { addEvent } from './log.js';

const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
const pad = n => String(n).padStart(2, '0');
const lastChannel = () => { try { return localStorage.getItem('deskhive-slack') || ''; } catch { return ''; } };
const field = (label, node) => { const l = el('label', 'field', label); l.append(node); return l; };
const linkOf = o => { if (!o || typeof o !== 'object') return ''; for (const k of ['htmlLink', 'permalink', 'html_link']) if (typeof o[k] === 'string' && o[k].startsWith('https://')) return o[k];
  for (const v of Object.values(o)) { const d = typeof v === 'object' ? linkOf(v) : ''; if (d) return d; } return ''; };

/* ------------------------------------------------------------------ executors (run only after approval) */
registerExecutor('calendar', async a => {
  const p = a.payload;
  const r = await callIntegration('calendar', 'GOOGLECALENDAR_CREATE_EVENT', {
    summary: p.summary, description: p.description, start_datetime: p.start, timezone: TZ,
    event_duration_hour: Math.floor(p.minutes / 60), event_duration_minutes: p.minutes % 60,
    calendar_id: 'primary', send_updates: 'none', create_meeting_room: false,
  });
  const link = linkOf(r);
  return `حُجز الموعد في تقويمك${link ? ` · ${link}` : ''}`;
});
registerExecutor('slack', async a => {
  const r = await callIntegration('slack', 'SLACK_SEND_MESSAGE', { channel: a.payload.channel, markdown_text: a.payload.text });
  const ok = r?.ok !== false;
  if (!ok) throw { code: 'tool_error', message: `رفض Slack الرسالة: ${r?.error || ''}` };
  return `أُرسلت الرسالة إلى #${a.payload.channel} في Slack`;
});

/* ------------------------------------------------------------------ book a calendar event */
export function askBookEvent({ agentKey, summary = '', description = '', review = false } = {}) {
  const frag = document.createDocumentFragment();
  const title = el('input'); title.id = 'cal-title'; title.maxLength = 120; title.value = summary; title.placeholder = 'مثلاً: متابعة خطة الإطلاق';
  const d = new Date(Date.now() + 86400000); d.setHours(10, 0, 0, 0);
  const date = el('input'); date.type = 'date'; date.id = 'cal-date'; date.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = el('input'); time.type = 'time'; time.id = 'cal-time'; time.value = '10:00';
  const dur = el('select'); dur.id = 'cal-dur'; [[15, '15 دقيقة'], [30, '30 دقيقة'], [45, '45 دقيقة'], [60, 'ساعة'], [90, 'ساعة ونصف'], [120, 'ساعتان']].forEach(([v, l]) => dur.append(new Option(l, v))); dur.value = '30';
  const msg = el('p', 'lead', `لن يُحجز الآن: سيذهب الطلب إلى صندوق الموافقات، ويُحجز في تقويمك الأساسي بعد موافقتك (المنطقة الزمنية: ${TZ}). لا تُرسل دعوات لأحد.`);
  const when = el('div', 'row'); when.append(field('اليوم', date), field('الساعة', time), field('المدة', dur));
  frag.append(msg, field('عنوان الموعد', title), when);
  let close;
  const go = button('btn primary', 'اطلب الموافقة على الحجز', () => {
    const t = title.value.trim(); if (!t) return title.focus();
    if (!date.value || !time.value) { msg.textContent = 'اختر اليوم والساعة.'; return; }
    const start = `${date.value}T${time.value}:00`, minutes = +dur.value;
    const a = requestApproval({ kind: 'calendar', agentKey, title: `حجز «${clip(t, 50)}» يوم ${date.value} الساعة ${time.value}`,
      preview: `العنوان: ${t}\nالبداية: ${date.value} ${time.value} (${TZ})\nالمدة: ${dur.selectedOptions[0].text}\n\n${description}`,
      payload: { summary: t.slice(0, 200), description: clip(description, 4000), start, minutes } });
    close(); if (review) openApproval(a);
  });
  close = openModal('موعد في التقويم', frag, [go]);
}

/* ------------------------------------------------------------------ post to Slack */
export function askPostSlack({ agentKey, text, title = 'رسالة إلى Slack' }) {
  const frag = document.createDocumentFragment();
  const ch = el('input'); ch.id = 'slack-channel'; ch.dir = 'ltr'; ch.placeholder = 'general'; ch.value = lastChannel();
  const body = el('textarea'); body.id = 'slack-text'; body.rows = 7; body.value = clip(text, 3500);
  const msg = el('p', 'lead', 'لن تُرسل الآن: ستذهب إلى صندوق الموافقات، وتُرسل من حسابك في Slack بعد موافقتك.');
  frag.append(msg, field('اسم القناة (بدون #)', ch), field('نص الرسالة', body));
  let close;
  const go = button('btn primary', 'اطلب الموافقة على الإرسال', () => {
    const c = ch.value.trim().replace(/^#/, ''); if (!/^[\w.-]{1,80}$/.test(c)) { msg.textContent = 'اكتب اسم قناة صحيحاً، مثل general.'; return ch.focus(); }
    if (!body.value.trim()) return body.focus();
    try { localStorage.setItem('deskhive-slack', c); } catch { /* private window */ }
    requestApproval({ kind: 'slack', agentKey, title: `${clip(title, 50)} ← #${c}`, preview: `القناة: #${c}\n\n${body.value}`, payload: { channel: c, text: body.value.slice(0, 3500) } });
    close();
  });
  close = openModal('إرسال إلى Slack', frag, [go]);
}
fileActions.push(file => [button('btn', 'أرسل إلى Slack', () => askPostSlack({ agentKey: file.agentKey, text: `*${file.title}*\n\n${file.content}`, title: `«${file.title}»` }))]);
on('deliver', t => {
  const f = S.files.find(x => x.id === t.outputs[t.outputs.length - 1]); if (!f || t.after?.kind !== 'slack') return;
  const c = String(t.after.to || '').replace(/^#/, '');
  if (/^[\w.-]{1,80}$/.test(c)) requestApproval({ kind: 'slack', agentKey: f.agentKey, title: `«${clip(f.title, 40)}» ← #${c}`, preview: `القناة: #${c}\n\n${clip(f.content, 3000)}`, payload: { channel: c, text: `*${f.title}*\n\n${clip(f.content, 3400)}` } });
});

/* ------------------------------------------------------------------ read today's calendar (on click only) */
export async function summarizeCalendar(ag) {
  const frag = document.createDocumentFragment(); const out = el('div', 'doc', 'أقرأ تقويمك…'); frag.append(out);
  const book = button('btn', 'احجز موعداً', () => askBookEvent({ agentKey: ag.a.key }));
  openModal(`${ag.a.name} ${ag.a.gender === 'f' ? 'تراجع' : 'يراجع'} مواعيدك`, frag, [book]);
  const now = new Date(), end = new Date(now.getTime() + 2 * 86400000);
  let r;
  try { r = await callIntegration('calendar', 'GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS', { time_min: now.toISOString(), time_max: end.toISOString(), single_events: true, response_detail: 'minimal', max_results_per_calendar: 50 }); }
  catch (e) { out.textContent = mcpErrText(e); return; }
  const rows = r?.summary_view || r?.events || r?.items || [];
  const list = (Array.isArray(rows) ? rows : []).slice(0, 25).map(e => {
    const s = e.start?.dateTime || e.start?.date || e.start || e.start_time || '';
    return `- ${String(s).replace('T', ' ').slice(0, 16)} — ${clip(String(e.summary || e.title || 'بدون عنوان'), 80)}`;
  });
  if (!list.length) { out.textContent = 'لا توجد مواعيد في اليومين القادمين.'; return; }
  if (!aiReady()) { out.textContent = list.join('\n'); return; }
  try {
    checkBudget(ag);
    const prompt = `${identity(ag)}\n\nهذه مواعيد المستخدم في اليومين القادمين:\n${list.join('\n')}\n\nرتّبها له باختصار: ما الأهم، وأين التعارض أو الضغط، وما يحتاج تحضيراً من زاوية تخصصك. نص عادي، نقاط مرقمة، بالعربية.`;
    const res = await AI.sample(prompt, { modelTier: 'default', onText: ({ text }) => { out.textContent = text; } });
    out.textContent = res.text.trim(); recordUsage(ag, prompt.length, res.text.length);
    addEvent(ag, 'راجع مواعيدك في التقويم');
  } catch (e) { out.textContent = errText(e) + '\n\n' + list.join('\n'); }
}

/** Check the calendar connection: read the next two days (no changes), then optionally book a test event. */
export async function testCalendar() {
  const frag = document.createDocumentFragment(); const out = el('div', 'doc', 'أقرأ تقويمك…'); frag.append(out);
  const book = button('btn primary', 'احجز موعداً تجريبياً', () => askBookEvent({ agentKey: 'ceo', summary: 'موعد تجريبي من خلية المكتب', description: 'موعد تجريبي للتأكد أن الوكلاء يستطيعون الحجز في تقويمك. يمكنك حذفه.', review: true }));
  book.hidden = true;
  openModal('تجربة التقويم', frag, [book]);
  const now = new Date(), end = new Date(now.getTime() + 2 * 86400000);
  try {
    const r = await callIntegration('calendar', 'GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS', { time_min: now.toISOString(), time_max: end.toISOString(), single_events: true, response_detail: 'minimal', max_results_per_calendar: 50 });
    const rows = r?.summary_view || r?.events || r?.items || [];
    const list = (Array.isArray(rows) ? rows : []).slice(0, 10).map(e => `- ${String(e.start?.dateTime || e.start?.date || e.start || '').replace('T', ' ').slice(0, 16)} — ${clip(String(e.summary || e.title || 'بدون عنوان'), 80)}`);
    out.textContent = `القراءة تعمل ✓\n\n${list.length ? `مواعيدك في اليومين القادمين:\n${list.join('\n')}` : 'لا مواعيد في اليومين القادمين.'}\n\nلتجربة الحجز أيضاً اضغط «احجز موعداً تجريبياً»: يذهب الطلب لصندوق الموافقات، ولا يُحجز إلا بعد موافقتك.`;
    book.hidden = false;
  } catch (e) { out.textContent = mcpErrText(e); }
}
