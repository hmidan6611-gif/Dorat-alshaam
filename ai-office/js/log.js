// Work log: real events are saved and shown in the agent panel; ambient chatter only appears in the Output tab.
import { $, el, clock, uid, clip, emit } from './util.js';
import { S } from './state.js';
import { put } from './store.js';

function logLine(color, head, text, strong) {
  const li = el('li'); li.style.setProperty('--c', color);
  li.append(el('time', '', head), strong ? el('b', '', text) : document.createTextNode(text));
  const ul = $('log'); ul.prepend(li);
  while (ul.children.length > 60) ul.lastChild.remove();
}
/** Ambient activity line in the Output tab (not saved). */
export function addLog(ag, text) { logLine(ag.a.color, `${clock()} · ${ag.a.name}`, clip(text, 90)); }

/** A real work event: saved, shown in the agent's log and highlighted in Output. */
export function addEvent(ag, text, taskId = '') {
  const e = { id: uid('e'), agentKey: ag.a.key, agentName: ag.a.name, text, taskId, at: Date.now() };
  S.events.unshift(e); S.events.length = Math.min(S.events.length, 300);
  put('events', e.id, e);
  logLine(ag.a.color, `${clock()} · ${ag.a.name}`, clip(text, 90), true);
  emit('events-changed', ag);
  return e;
}
export function restoreLog() {
  [...S.events].reverse().slice(-40).forEach(e => {
    const ag = S.agents.find(o => o.a.key === e.agentKey);
    logLine(ag?.a.color || '#94a3b8', `${new Date(e.at).toTimeString().slice(0, 5)} · ${e.agentName}`, clip(e.text, 90), true);
  });
}
