// Shared mutable state. Modules read and write these objects directly.
export const V = { storm: 0, focus: 0, shift: 0, shake: 0 }; // values tweened by gsap

export const S = {
  agents: [],        // agent groups (3D station + data), see agents.js
  hitMeshes: [],     // invisible boxes used for picking a station
  built: false,      // the opening build animation finished
  panel: null,       // 'chat' | 'board' | 'meet' | 'new' | null
  focused: null,     // agent whose panel is open
  speaker: null,     // agent talking in a meeting
  tasksDoneToday: 216,
  tasks: [],         // kanban tasks
  files: [],         // documents agents produced
  events: [],        // work log entries
  notes: [],         // notifications
  meetings: [],      // saved meetings
  goals: [],
  approvals: [],     // sensitive actions waiting for the user         // CEO goals: [{id, text, status, taskIds, reportId}]
  floors: [],        // [{id, name, dept, color, order, objects}]
  viewFloor: 'main', // floor shown on screen
  meeting: { running: false, ctl: null, skip: null, skipAll: false },
};

export const isFemale = a => a.gender === 'f';
export const byKey = key => S.agents.find(o => o.a.key === key);
