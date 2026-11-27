# Deskhive AI Office

An isometric 3D office (Arabic, right-to-left) where AI robot agents work, walk around, chat through Claude,
hold team meetings and do real tasks from a Kanban board.

Open `index.html` through a web server (ES modules do not load from `file://`). Inside claude.ai the page uses
Claude, saving, voice and downloads; elsewhere it falls back to sample replies and browser storage.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page markup: top bar, team list, agent panel, task board, meeting and new-agent panels |
| `css/office.css` | All styles (dark neon look, RTL, phone layout) |
| `js/main.js` | Entry point: wires tabs, team list, selection, picking, ambient office life, restore |
| `js/scene.js` | Three.js renderer, camera, room, hive core, effects, hand-off beam, build animation, frame loop |
| `js/agents.js` | Agent stations (glass office, desk, robot), walking on the corridor graph, breaks, errands, labels |
| `js/data.js` | Built-in agents, desk slots, corridor graph, break spots, task statuses |
| `js/state.js` | Shared state |
| `js/tasks.js` | Kanban board, drag and drop, Claude doing the work, hand-offs, review and approval |
| `js/panel.js` | Agent side panel: overview, chat, work log, files |
| `js/chat.js` | Chat with one agent |
| `js/meeting.js` | Team meeting and turning its plan into tasks |
| `js/newagent.js` | Creating and restoring custom agents |
| `js/notify.js` | Toasts and the notification list |
| `js/log.js` | Work log and Output tab |
| `js/modal.js` | Dialogs and the file viewer |
| `js/store.js` | Saving to the artifact database or browser storage |
| `js/ai.js` | Claude availability, errors and agent personas |
| `js/voice.js` | Reading replies aloud and dictation |
| `js/util.js` | Small helpers and an event bus |
