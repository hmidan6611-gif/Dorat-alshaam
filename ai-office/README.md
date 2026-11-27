# Deskhive AI Office

An isometric 3D office (Arabic, right-to-left) where AI robot agents work, walk around, chat through Claude,
hold team meetings and do real tasks from a Kanban board.

Open `index.html` through a web server (ES modules do not load from `file://`). Inside claude.ai the page uses
Claude, saving, voice and downloads; elsewhere it falls back to sample replies and browser storage.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page markup: top bar, team list, panels, board, dashboard, editor bar, settings |
| `css/office.css` | All styles (dark neon look, RTL, phone layout) |
| `js/main.js` | Entry point: builds floors and agents, tabs, team list and search, selection, picking, ambient life, restore |
| `js/scene.js` | Three.js renderer, camera, hive core, effects, hand-off beam, build animation, frame loop |
| `js/layout.js` | Offices and furniture as data: drawing, obstacles, interaction spots, default floors |
| `js/floors.js` | Floor groups and room shells, drawing objects, which floor is visible, office placement |
| `js/floorsui.js` | Floor switcher and adding department floors |
| `js/nav.js` | Walking grid per floor and A* pathfinding |
| `js/agents.js` | Robots (shapes), walking, elevator rides, breaks, energy and mood, greetings, labels |
| `js/daycycle.js` | Morning, noon, sunset and night lighting |
| `js/tasks.js` | Kanban board, drag and drop, Claude doing the work, kickoff meetings, hand-offs, approvals |
| `js/goals.js` | The CEO: plans a goal into tasks with Claude, hands them out door to door, follows progress, writes the final report |
| `js/holo.js` | Live holographic screens above desks that show the work as it is written |
| `js/integrations.js` | Outside services through the viewer's claude.ai connectors (Gmail, Drive, Bland); no keys in the page |
| `js/approvals.js` | Approvals box: sensitive actions run only after the user approves |
| `js/phone.js` | Phone calls through Bland: the agent writes the call script, the call waits for approval |
| `js/replay.js` | Records poses, speech and events; timeline playback at 1x/2x/4x |
| `js/growth.js` | Agent memory, XP and levels that unlock skills, employee of the month board, confetti and applause |
| `js/panel.js` | Agent side panel: overview, chat, work log, files |
| `js/chat.js` | Chat with one agent |
| `js/meeting.js` | Team meeting at the table and turning its plan into tasks |
| `js/newagent.js` | Creating agents (look, personality, voice, floor) and restoring them |
| `js/editor.js` | Office editor: add, drag, rotate, delete; refuses changes that trap an agent |
| `js/dashboard.js` | Statistics: totals, per-agent productivity, tasks per day, table, activity |
| `js/manager.js` | Manager mode: free camera, follow an agent, keyboard movement |
| `js/audio.js` | Synthesized keyboard, footsteps, pouring, chime and calm music |
| `js/quality.js` | Quality levels and automatic adjustment from the frame rate |
| `js/reflect.js` | Floor reflections for the orthographic camera |
| `js/settings.js` | Settings menu: sound, music, volume, quality |
| `js/notify.js` | Toasts and the notification list |
| `js/log.js` | Work log |
| `js/modal.js` | Dialogs and the file viewer |
| `js/store.js` | Saving to the artifact database or browser storage |
| `js/ai.js` | Claude availability, errors and agent personas |
| `js/voice.js` | Reading replies aloud and dictation |
| `js/state.js`, `js/data.js`, `js/util.js` | Shared state, static data, helpers and an event bus |

Add `?hour=22` to the address to start the fast day clock at a given hour, and `?debug` to expose state for automated checks.
