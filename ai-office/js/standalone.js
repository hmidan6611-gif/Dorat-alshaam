// Running outside claude.ai (GitHub Pages): this file provides the same `window.claude.use(...)` the office uses
// inside claude.ai, backed by Supabase: login, the database (with row-level security), live presence, and a
// server function that holds the Claude and Composio keys. Inside claude.ai it does nothing.
import { STANDALONE as C } from './config.js';

// only on the GitHub Pages site (or with ?standalone for local testing), never inside claude.ai
const onOwnSite = /\.github\.io$/i.test(location.hostname) || new URLSearchParams(location.search).has('standalone');
export const isStandalone = onOwnSite && !window.claude && !!C.supabaseUrl;

if (isStandalone) {
  window.DESKHIVE_STANDALONE = true;
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });
  const caps = {};
  window.claude = { use: async name => { await ready; return caps[name] ?? null; } };
  boot().then(c => { Object.assign(caps, c); resolveReady(); }).catch(err => { console.error(err); showFatal(); resolveReady(); });
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm');
  const sb = createClient(C.supabaseUrl, C.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') setTimeout(() => newPassword(sb), 300); });
  let { data: { session } } = await sb.auth.getSession();
  if (!session) session = await loginScreen(sb);
  const user = session.user;
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
  window.DESKHIVE_ACCOUNT = { email: user.email || '', signOut: () => sb.auth.signOut() };
  const fn = makeFn(sb);
  let status = {};
  try { const r = await fn('status'); status = r.ok ? await r.json() : {}; } catch { status = {}; }
  window.DESKHIVE_SERVER = status;
  return {
    db: makeDb(sb, user.id),
    user: makeUser(sb, user),
    room: makeRoom(sb, user.id),
    downloads: { save: async ({ filename, data }) => saveFile(filename, data) },
    sample: status.ai ? makeSample(fn) : null,
    mcp: status.composio ? makeMcp(fn) : null,
  };
}
function makeFn(sb) {
  return async (route, body = {}, signal) => {
    const { data: { session } } = await sb.auth.getSession();
    return fetch(C.fn, { method: 'POST', signal, headers: { 'content-type': 'application/json', apikey: C.publishableKey, authorization: 'Bearer ' + (session?.access_token || '') }, body: JSON.stringify({ route, ...body }) });
  };
}
const errOf = async (r, fallback = 'unavailable') => { let e = {}; try { e = await r.json(); } catch { /* not json */ } return { code: e.code || (r.status === 429 ? 'rate_limited' : fallback), message: e.message || `HTTP ${r.status}` }; };

/* ------------------------------------------------------------------ database: same calls as the artifact db */
function makeDb(sb, uid) {
  const split = path => { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };
  const fail = e => { throw { code: 'unavailable', message: e?.message || 'db error' }; };
  const docRef = path => {
    const [col, id] = split(path);
    return {
      id,
      async get() { const { data, error } = await sb.from('docs').select('data').eq('col', col).eq('id', id).maybeSingle(); if (error) fail(error); return { id, exists: !!data, data: () => data?.data }; },
      async set(data) { const { error } = await sb.from('docs').upsert({ col, id, owner: uid, data, updated_at: new Date().toISOString() }); if (error) fail(error); },
      async update(patch) { const cur = (await this.get()).data() || {}; return this.set({ ...cur, ...patch }); },
      async delete() { const { error } = await sb.from('docs').delete().eq('col', col).eq('id', id); if (error) fail(error); },
    };
  };
  const collection = col => ({
    path: col,
    doc: id => docRef(`${col}/${id}`),
    async get() {
      const { data, error } = await sb.from('docs').select('id,data').eq('col', col).order('updated_at', { ascending: false }).limit(1000);
      if (error) fail(error);
      return { docs: data.map(r => ({ id: r.id, exists: true, data: () => r.data })) };
    },
    onSnapshot(next, onErr) {
      let stop = false;
      const tick = async () => { if (stop) return; try { next(await this.get()); } catch (e) { onErr?.(e); } if (!stop) setTimeout(tick, 15000); };
      tick();
      return () => { stop = true; };
    },
  });
  return { doc: docRef, collection };
}

/* ------------------------------------------------------------------ user */
function makeUser(sb, user) {
  const cache = new Map();
  const nameOf = async () => { const { data } = await sb.from('profiles').select('name').eq('id', user.id).maybeSingle(); return data?.name || (user.email || '').split('@')[0]; };
  return {
    id: async () => user.id,
    me: async () => ({ id: user.id, name: await nameOf() }),
    isOwner: async () => true,
    canEdit: async () => true,
    can: async () => true,
    async profiles(ids) {
      const missing = ids.filter(i => !cache.has(i));
      if (missing.length) { const { data } = await sb.from('profiles').select('id,name').in('id', missing); (data || []).forEach(p => cache.set(p.id, { id: p.id, name: p.name || '' })); }
      return Object.fromEntries(ids.map(i => [i, cache.get(i) || { id: i, name: '' }]));
    },
  };
}

/* ------------------------------------------------------------------ presence: colleagues as avatars */
function makeRoom(sb, uid) {
  const key = uid + ':' + Math.random().toString(36).slice(2, 8);
  const ch = sb.channel('office-room', { config: { presence: { key } } });
  const cbs = new Set(); let state = {}, joined = false;
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState();
    const peers = Object.entries(st).map(([k, metas]) => { const m = metas[metas.length - 1] || {}; return { peer: k, by: m.by, isMe: k === key, kind: 'viewer', guest: false, presence: m.p || {} }; });
    cbs.forEach(f => f({ peers, joined: [], left: [], updated: [] }));
  });
  ch.subscribe(s => { if (s === 'SUBSCRIBED') { joined = true; ch.track({ by: uid, p: state }); } });
  return {
    async presence(patch) { state = { ...state, ...patch }; if (joined) await ch.track({ by: uid, p: state }); },
    onPeers(fn) { cbs.add(fn); return () => cbs.delete(fn); },
    emit: async () => {}, on: () => () => {},
  };
}

/* ------------------------------------------------------------------ Claude through the server function */
function makeSample(fn) {
  const dec = new TextDecoder();
  async function sample(input, opts = {}) {
    let messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input.map(m => ({ role: m.role, content: m.content }));
    const tools = Array.isArray(opts.tools) ? opts.tools : [];
    const defs = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }));
    let all = '';
    for (let round = 0; round < 10; round++) {
      let r;
      try { r = await fn('sample', { messages, tools: defs, tier: opts.modelTier || 'default' }, opts.signal); }
      catch (e) { if (e?.name === 'AbortError') throw { code: 'cancelled', message: 'cancelled', text: all || undefined }; throw { code: 'unavailable', message: String(e?.message || e), text: all || undefined }; }
      if (!r.ok) throw { ...(await errOf(r)), text: all || undefined };
      const prefix = all ? all + '\n\n' : '';
      let buf = '', roundText = '', final = null;
      const reader = r.body.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
            const o = JSON.parse(line);
            if (typeof o.t === 'string') { roundText += o.t; opts.onText?.({ text: prefix + roundText, delta: o.t }); }
            else if (o.final) final = o.final;
            else if (o.error) throw { ...o.error, text: (prefix + roundText) || undefined };
          }
        }
      } catch (e) { if (e?.name === 'AbortError') throw { code: 'cancelled', message: 'cancelled', text: (prefix + roundText) || undefined }; throw e; }
      if (!final) throw { code: 'unavailable', message: 'انقطع الرد.', text: (prefix + roundText) || undefined };
      if (roundText) all = prefix + roundText;
      if (final.stop_reason === 'refusal') throw { code: 'refused', message: 'refused' };
      if (final.stop_reason !== 'tool_use' || !tools.length) {
        if (!all.trim()) throw { code: 'empty_completion', message: 'empty' };
        return { text: all, truncated: final.stop_reason === 'max_tokens', modelTierApplied: opts.modelTier || 'default' };
      }
      // run the page's tools and continue the conversation (assistant content goes back unchanged)
      messages = [...messages, { role: 'assistant', content: final.content }];
      const uses = final.content.filter(b => b.type === 'tool_use');
      const results = await Promise.all(uses.map(async u => {
        const t = tools.find(x => x.name === u.name);
        try {
          if (!t) throw new Error('Unknown tool');
          const out = await t.execute(u.input || {}, { signal: opts.signal || new AbortController().signal });
          return { type: 'tool_result', tool_use_id: u.id, content: typeof out === 'string' ? out : JSON.stringify(out ?? null) };
        } catch (e) { return { type: 'tool_result', tool_use_id: u.id, content: 'Error: ' + (e?.message || String(e)), is_error: true }; }
      }));
      messages.push({ role: 'user', content: results });
    }
    throw { code: 'unavailable', message: 'too many tool rounds', text: all || undefined };
  }
  sample.json = async (prompt, opts = {}) => {
    const p = typeof prompt === 'string' ? prompt + '\n\nأعد JSON فقط بلا أي نص قبله أو بعده.' : prompt;
    const { text } = await sample(p, opts);
    const tryParse = s => { try { return JSON.parse(s); } catch { return undefined; } };
    let v = tryParse(text.trim());
    if (v === undefined) { const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) v = tryParse(m[1]); }
    if (v === undefined) { const a = text.search(/[[{]/), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']')); if (a >= 0 && b > a) v = tryParse(text.slice(a, b + 1)); }
    if (v === undefined) throw { code: 'invalid_json', message: 'invalid json', text };
    return v;
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 12 }, modelTiers: ['quick', 'default', 'complex'] });
  return sample;
}

/* ------------------------------------------------------------------ connectors through Composio on the server */
const TOOLKIT = { Gmail: 'gmail', 'Google Drive': 'googledrive' };
function makeMcp(fn) {
  const call = async body => { const r = await fn('composio', body); if (!r.ok) throw await errOf(r, 'tool_error'); return r.json(); };
  const exec = async (slug, args) => {
    const r = await call({ action: 'execute', slug, arguments: args });
    if (!r.successful) { const msg = String(r.error || 'failed'); throw /connect|auth|account|not found for user/i.test(msg) ? { code: 'server_not_connected', message: msg } : { code: 'tool_error', message: msg }; }
    return r.data || {};
  };
  const active = async tk => ((await call({ action: 'list', toolkit: tk })).accounts || []).some(a => /active/i.test(a.status || ''));
  const pick = (o, keys) => { for (const k of keys) { const v = k.split('.').reduce((x, p) => x?.[p], o); if (v) return v; } return ''; };
  return {
    async listTools(server) {
      if (server === 'Composio') return { tools: [{ name: 'COMPOSIO_MULTI_EXECUTE_TOOL' }, { name: 'COMPOSIO_MANAGE_CONNECTIONS' }] };
      if (TOOLKIT[server]) return { tools: (await active(TOOLKIT[server])) ? [{ name: 'ready' }] : [] };
      throw { code: 'server_not_connected', message: `${server} غير متاح في النسخة المستقلة.` };
    },
    async callTool(server, tool, input = {}) {
      if (server === 'Composio' && tool === 'COMPOSIO_MULTI_EXECUTE_TOOL') {
        const t = input.tools?.[0] || {};
        try { const data = await exec(t.tool_slug, t.arguments || {}); return { payload: { data: { results: [{ response: { successful: true, data } }] } } }; }
        catch (e) { if (e.code !== 'tool_error') throw e; return { payload: { data: { results: [{ response: { successful: false, error: e.message } }] } } }; }
      }
      if (server === 'Composio' && tool === 'COMPOSIO_MANAGE_CONNECTIONS') {
        const t = input.toolkits?.[0] || {};
        if (t.action === 'add') { const r = await call({ action: 'connect', toolkit: t.name }); return { payload: { data: { results: { [t.name]: { status: 'initiated', redirect_url: r.redirect_url } } } } }; }
        const r = await call({ action: 'list', toolkit: t.name }); return { payload: { data: { results: { [t.name]: { accounts: r.accounts || [] } } } } };
      }
      if (server === 'Gmail' && tool === 'send_message') {
        const to = Array.isArray(input.to) ? input.to : [input.to];
        const d = await exec('GMAIL_SEND_EMAIL', { recipient_email: to[0], extra_recipients: to.slice(1), subject: input.subject || '', body: input.body || '' });
        return { payload: { id: pick(d, ['id', 'response_data.id']) } };
      }
      if (server === 'Gmail' && tool === 'search_threads') {
        const d = await exec('GMAIL_FETCH_EMAILS', { query: input.query || 'in:inbox', max_results: input.pageSize || 15 });
        const msgs = d.messages || d.response_data?.messages || [];
        return { payload: { threads: msgs.map(m => ({ messages: [{ sender: pick(m, ['sender', 'from']), subject: pick(m, ['subject']), snippet: pick(m, ['preview.body', 'snippet', 'messageText']) }] })) } };
      }
      if (server === 'Google Drive' && tool === 'create_file') {
        const d = await exec('GOOGLEDRIVE_CREATE_FILE_FROM_TEXT', { file_name: input.title || 'ملف', text_content: input.textContent || '', mime_type: 'text/plain' });
        return { payload: { webViewLink: pick(d, ['webViewLink', 'response_data.webViewLink', 'file.webViewLink']) } };
      }
      throw { code: 'server_not_connected', message: `${server} غير متاح في النسخة المستقلة.` };
    },
  };
}

/* ------------------------------------------------------------------ files and screens */
function saveFile(filename, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function showFatal() {
  const d = document.createElement('div'); d.className = 'auth'; d.setAttribute('role', 'alert');
  d.innerHTML = '<section class="authbox glass"><h1>خلية المكتب</h1><p class="lead">تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم حدّث الصفحة.</p></section>';
  document.body.append(d);
}

/** Sign in or create an account; resolves with the session. */
function loginScreen(sb) {
  return new Promise(resolve => {
    const wrap = document.createElement('div'); wrap.className = 'auth';
    wrap.innerHTML = `<section class="authbox glass" aria-labelledby="auth-title">
      <div class="authlogo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg></div>
      <h1 id="auth-title">خلية المكتب</h1>
      <p class="lead" id="auth-lead">سجّل الدخول لمكتبك. بياناتك محفوظة في حسابك ولا يراها غيرك.</p>
      <div class="seg authtabs" role="tablist"><button type="button" data-mode="in" aria-pressed="true">دخول</button><button type="button" data-mode="up" aria-pressed="false">حساب جديد</button></div>
      <form id="auth-form" novalidate>
        <label class="field" id="auth-name-f" hidden>اسمك<input id="auth-name" autocomplete="name" maxlength="60"></label>
        <label class="field">البريد الإلكتروني<input id="auth-email" type="email" dir="ltr" autocomplete="email" required></label>
        <label class="field">كلمة المرور<input id="auth-pass" type="password" dir="ltr" autocomplete="current-password" minlength="8" required></label>
        <button class="btn primary" id="auth-go" type="submit">دخول</button>
        <button class="linkish" id="auth-forgot" type="button">نسيت كلمة المرور؟</button>
        <p class="lead" id="auth-msg" role="status"></p>
      </form>
    </section>`;
    document.body.append(wrap);
    const $ = id => wrap.querySelector('#' + id);
    let mode = 'in';
    const setMode = m => { mode = m; wrap.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); $('auth-name-f').hidden = m !== 'up'; $('auth-go').textContent = m === 'up' ? 'أنشئ الحساب' : 'دخول'; $('auth-pass').autocomplete = m === 'up' ? 'new-password' : 'current-password'; $('auth-msg').textContent = ''; };
    wrap.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
    const msg = t => { $('auth-msg').textContent = t; };
    const AR = { 'Invalid login credentials': 'البريد أو كلمة المرور غير صحيحة.', 'Email not confirmed': 'فعّل حسابك من الرابط الذي وصلك على بريدك أولاً.', 'User already registered': 'هذا البريد مسجّل. سجّل الدخول بدلاً من ذلك.' };
    $('auth-form').onsubmit = async e => {
      e.preventDefault();
      const email = $('auth-email').value.trim(), password = $('auth-pass').value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('اكتب بريداً صحيحاً.');
      if (password.length < 8) return msg('كلمة المرور 8 أحرف على الأقل.');
      $('auth-go').disabled = true; msg('لحظة…');
      try {
        if (mode === 'up') {
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name: $('auth-name').value.trim().slice(0, 60) }, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!data.session) { msg('أرسلنا رابط تفعيل إلى بريدك. افتحه ثم ارجع وسجّل الدخول.'); setMode('in'); return; }
          wrap.remove(); resolve(data.session);
        } else {
          const { data, error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          wrap.remove(); resolve(data.session);
        }
      } catch (err) { msg(AR[err?.message] || 'تعذّر الدخول: ' + (err?.message || '')); }
      finally { $('auth-go').disabled = false; }
    };
    $('auth-forgot').onclick = async () => {
      const email = $('auth-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('اكتب بريدك أولاً ثم اضغط «نسيت كلمة المرور».');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      msg(error ? 'تعذّر الإرسال: ' + error.message : 'أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك.');
    };
    setTimeout(() => $('auth-email').focus(), 50);
  });
}

/** After a password-reset link: choose a new password. */
function newPassword(sb) {
  const wrap = document.createElement('div'); wrap.className = 'auth';
  wrap.innerHTML = `<section class="authbox glass"><h1>كلمة مرور جديدة</h1>
    <form id="np-form"><label class="field">كلمة المرور الجديدة<input id="np-pass" type="password" dir="ltr" autocomplete="new-password" minlength="8" required></label>
    <button class="btn primary" type="submit">احفظ</button><p class="lead" id="np-msg" role="status"></p></form></section>`;
  document.body.append(wrap);
  wrap.querySelector('#np-form').onsubmit = async e => {
    e.preventDefault();
    const p = wrap.querySelector('#np-pass').value; const m = wrap.querySelector('#np-msg');
    if (p.length < 8) { m.textContent = 'كلمة المرور 8 أحرف على الأقل.'; return; }
    const { error } = await sb.auth.updateUser({ password: p });
    if (error) m.textContent = 'تعذّر الحفظ: ' + error.message; else wrap.remove();
  };
}
