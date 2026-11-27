// A simple dialog used for task forms and the file viewer.
import { $, el, button } from './util.js';

/** Opens a dialog; returns close(). content: Node; footer: Node[] */
export function openModal(title, content, footer = []) {
  const root = $('modal-root');
  const wrap = el('div', 'modal'); wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  const box = el('section', 'box glass');
  const head = el('header'); head.append(el('b', '', title));
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const x = button('iconbtn', '×', close); x.setAttribute('aria-label', 'إغلاق');
  head.append(x);
  const pane = el('div', 'pane'); pane.append(content);
  if (footer.length) { const row = el('div', 'row'); footer.forEach(f => row.append(f)); pane.append(row); }
  box.append(head, pane); wrap.append(box); root.append(wrap);
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); });
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  setTimeout(() => (pane.querySelector('input, textarea, select, button') || x).focus(), 50);
  return close;
}

let downloads = null;
if (window.claude?.use) window.claude.use('downloads').then(d => { downloads = d; }).catch(() => {});

/** Show a document an agent produced, with copy and download. */
export function openFile(file) {
  const doc = el('div', 'doc', file.content);
  const meta = el('p', 'lead', `${file.agentName || ''} · ${new Date(file.at).toLocaleString('ar')}`);
  const frag = document.createDocumentFragment(); frag.append(meta, doc);
  const copy = button('btn', 'نسخ النص', async () => {
    try { await navigator.clipboard.writeText(file.content); copy.textContent = 'نُسخ'; }
    catch { const r = document.createRange(); r.selectNodeContents(doc); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = 'النص محدد، انسخه'; }
  });
  const footer = [copy];
  if (downloads) {
    const dl = button('btn primary', 'تنزيل الملف', async () => {
      try { await downloads.save({ filename: (file.title || 'ملف').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.txt', data: file.content }); dl.textContent = 'تم التنزيل'; }
      catch { dl.textContent = 'لم يكتمل التنزيل'; }
    });
    footer.unshift(dl);
  }
  return openModal(file.title || 'ملف', frag, footer);
}
