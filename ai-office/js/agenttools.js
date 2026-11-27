// Tools an agent can use by itself while it works on a task: search the company files, read a colleague's
// output, ask a colleague a quick question, and open a follow-up task for a colleague. Each use shows in the
// office (bubbles, beams, the activity log) so you can see the team coordinating.
import { clip } from './util.js';
import { S, isFemale } from './state.js';
import { AI, identity } from './ai.js';
import { searchKnowledge } from './knowledge.js';
import { showBubble } from './agents.js';
import { handoffBeam } from './scene.js';
import { addEvent } from './log.js';
import { setLive } from './holo.js';
import { checkBudget, recordUsage } from './usage.js';

let canUse = null;
/** Whether this view can run page tools inside Claude calls (asked once). */
export async function toolsAvailable() {
  if (canUse !== null) return canUse;
  try { canUse = !!(await AI.sample?.limits?.())?.tools; } catch { canUse = false; }
  return canUse;
}

const norm = s => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
const findAgent = name => S.agents.find(o => norm(o.a.name) === norm(name)) || S.agents.find(o => norm(name).includes(norm(o.a.name)) || norm(o.a.role).includes(norm(name)));

/** The tools for one work step. `createTask` comes from tasks.js (passed in to avoid a circular import). */
export function taskTools(t, ag, { createTask }) {
  const used = { ask: 0, sub: 0 };
  const status = text => { showBubble(ag, text, 2600); setLive(ag, { title: t.title, text: `${text}…`, kind: 'مهمة' }); };
  const others = S.agents.filter(o => o !== ag);
  const tools = [
    {
      name: 'search_company_knowledge',
      description: 'Searches the user\'s company profile files (prices, policies, FAQs, examples). Returns up to 4 matching passages with the file title. Use it before stating any company-specific fact.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What to look for, in Arabic or English' } }, required: ['query'] },
      execute: ({ query }) => {
        status('أبحث في ملفات الشركة');
        const hits = searchKnowledge(String(query || ''), 4);
        addEvent(ag, `بحث في ملفات الشركة عن «${clip(String(query || ''), 40)}»`, t.id);
        return hits.length ? hits.map(h => ({ file: h.doc.title, text: h.text })) : 'لا توجد نتائج في ملفات الشركة.';
      },
    },
    {
      name: 'list_team_files',
      description: 'Lists the 15 most recent files written by colleagues in this office (id, title, author, date). Use read_team_file to read one.',
      execute: () => S.files.filter(f => f.agentKey !== ag.a.key).slice(0, 15).map(f => ({ id: f.id, title: f.title, author: f.agentName, date: new Date(f.at).toISOString().slice(0, 10) })),
    },
    {
      name: 'read_team_file',
      description: 'Reads one colleague file by id (from list_team_files). Returns its title, author and text (up to 6000 characters).',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: ({ id }) => {
        const f = S.files.find(x => x.id === String(id)); if (!f) throw new Error('No file with that id. Call list_team_files first.');
        status(`أقرأ ملف ${f.agentName}`);
        addEvent(ag, `قرأ${isFemale(ag.a) ? 'ت' : ''} ملف «${clip(f.title, 40)}» من ${f.agentName}`, t.id);
        return { title: f.title, author: f.agentName, text: clip(f.content, 6000) };
      },
    },
    {
      name: 'ask_colleague',
      description: `Asks one colleague a short question and returns their answer (a few sentences). Colleagues: ${others.map(o => `${o.a.name} (${o.a.role})`).join(', ')}. At most 2 questions per task.`,
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Colleague name exactly as listed' }, question: { type: 'string' } }, required: ['name', 'question'] },
      execute: async ({ name, question }, ctx) => {
        if (used.ask >= 2) throw new Error('Question limit reached for this task. Continue with what you have.');
        const peer = findAgent(name); if (!peer || peer === ag) throw new Error(`Unknown colleague. Choose one of: ${others.map(o => o.a.name).join(', ')}`);
        used.ask++;
        const q = clip(String(question || ''), 600);
        status(`أسأل ${peer.a.name}`); handoffBeam(ag, peer, 2.4);
        showBubble(peer, isFemale(peer.a) ? 'تفكّر في السؤال…' : 'يفكّر في السؤال…', 3000);
        addEvent(ag, `سأل${isFemale(ag.a) ? 'ت' : ''} ${peer.a.name}: ${clip(q, 70)}`, t.id);
        checkBudget(peer);
        const prompt = `${identity(peer, q)}\n\nزميلك ${ag.a.name} (${ag.a.role}) يعمل على مهمة «${t.title}» ويسألك:\n«${q}»\n\nأجبه من تخصصك بإجابة مركّزة ومفيدة في 2 إلى 5 جمل، نص عادي بالعربية.`;
        const r = await AI.sample(prompt, { modelTier: 'default', signal: ctx?.signal });
        const answer = r.text.trim(); recordUsage(peer, prompt.length, answer.length);
        showBubble(peer, clip(answer, 60), 3200);
        addEvent(peer, `أجاب${isFemale(peer.a) ? 'ت' : ''} ${ag.a.name}: ${clip(answer, 80)}`, t.id);
        return { from: peer.a.name, answer: clip(answer, 1500) };
      },
    },
  ];
  // only top-level tasks may open follow-ups, so agents cannot spawn chains of tasks
  if (!t.parentId) tools.push({
    name: 'create_followup_task',
    description: `Opens a follow-up task on the board for one colleague, for work outside your own specialty that this task needs next. It waits for the user to review like any task. At most 1 per task; only when clearly needed. Colleagues: ${others.map(o => `${o.a.name} (${o.a.role})`).join(', ')}.`,
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, title: { type: 'string', description: 'Short task title' }, details: { type: 'string', description: 'What exactly to deliver' } }, required: ['name', 'title', 'details'] },
    execute: ({ name, title, details }) => {
      if (used.sub >= 1) throw new Error('Follow-up limit reached for this task.');
      const peer = findAgent(name); if (!peer || peer === ag) throw new Error(`Unknown colleague. Choose one of: ${others.map(o => o.a.name).join(', ')}`);
      used.sub++;
      const nt = createTask({ title: clip(String(title || ''), 110), desc: `${clip(String(details || ''), 1200)}\n\nفتحها ${ag.a.name} أثناء العمل على «${t.title}».`, chain: [peer.a.key], approval: true, parentId: t.id });
      status(`فتحت مهمة لـ${peer.a.name}`); handoffBeam(ag, peer, 2.4);
      addEvent(ag, `فتح${isFemale(ag.a) ? 'ت' : ''} مهمة متابعة لـ${peer.a.name}: «${clip(nt.title, 50)}»`, t.id);
      return `Task opened for ${peer.a.name}: «${nt.title}».`;
    },
  });
  return tools;
}

/** With tools, the answer holds every round; the file is what follows the last marker line. */
export const FILE_MARK = '=== الملف ===';
export function finalText(text) {
  const i = text.lastIndexOf(FILE_MARK);
  return (i >= 0 ? text.slice(i + FILE_MARK.length) : text).trim();
}
export const toolsHint = () => `\n\nأدوات متاحة لك أثناء العمل: ابحث في ملفات الشركة قبل ذكر أي معلومة خاصة بها، واقرأ ملفات زملائك إذا كانت تفيدك، واسأل زميلاً سؤالاً قصيراً عند الحاجة لخبرته، وافتح مهمة متابعة لزميل فقط إذا كانت ضرورية. لا تستخدم الأدوات بلا حاجة.\nعندما تجهز، اكتب سطراً فيه ${FILE_MARK} وحده، ثم الملف النهائي بعده مباشرة.`;
