# Intro tour plan (Driver.js)

Goal: teach the app in short, contextual parts instead of one giant tour. Each
part belongs to one page and starts the first time the user opens it.

## Parts

| # | id | Page | Steps | Next |
|---|----|------|-------|------|
| 1 | `welcome` | app shell (starts on whatever page the user lands on after onboarding, normally Home/Launch) | brand, sidebar nav, hardware+engine badges, downloads/bench chips, `?` help button | hardware |
| 2 | `hardware` | `/hardware` | header + Re-detect, recommended binary, compute backends, GPU/system memory | binaries |
| 3 | `binaries` | `/binaries` | engines list, health + Verify, Set default/Update/Import, Get a new build | registry |
| 4 | `registry` | `/registry` | Featured vs Search, picking a model, variants table (only when a model is open), downloads drawer, where models land (Library) | launch |
| 5 | `launch` | `/launch` | profiles, tabs, Configure flags (+VRAM estimate), Start, CLI preview, server output | bench |
| 6 | `bench` | `/bench` | what bench is + New bench, leaderboard (engine x device), filters / rank-by, run from Library | - |

Each part has 3-6 steps. Every step has `selector` (a `[data-tour="..."]`), `title`, `description`
(what it is for + what to do next). Steps whose element is missing are skipped;
progress shows the number of steps actually shown ("2 of 5").

## Architecture (`src/renderer/lib/tour/`)

- `parts.ts` - pure data: `TOUR_PARTS`, types. No DOM, no `@/` imports (unit-testable).
- `logic.ts` - pure functions: `partForPath`, `resolveSteps(part, exists)`, `decideAutoStart(ctx)`,
  `progressLabel`, selector helper. Fully unit-tested.
- `state.ts` - pure reducers for persisted tour state (`markPartDone`, `resetTourState`, ...).
- `manager.ts` - the only module touching Driver.js and the DOM: `startTourPart(id)`, `stopTour()`,
  `scheduleAutoStart(id)`, waits for elements (poll with timeout), custom popover buttons
  (Skip tour, next-part CTA), `prefers-reduced-motion` -> `animate:false`, overlay/drawer detection.
- `useTourPart.ts` - hook used by each page: auto-starts the part once when it is allowed.
- `TourController.tsx` - mounted in `Layout`: registers the router `navigate`, interrupts a running
  tour when the user leaves the part's page or a drawer opens.
- `tour.css` - popover/overlay styling with the app tokens (`--popover`, `--border`, `--accent-brand`...).
  Works for light/dark because it only uses CSS variables.
- UI: `components/TourHelpMenu.tsx` (the `?` button in the sidebar header: "Tour this page", "All tours")
  and `components/TourSettings.tsx` (Settings > Product tour).

## Persistence

`ui-prefs` zustand store (already persisted in `localStorage` as `llama-studio-ui-prefs`) gets:
`tourCompleted: string[]`, `toursDisabled: boolean` + actions `completeTourPart`, `setToursDisabled`,
`resetTours`. Renderer storage only; nothing in `~/.llama-studio` is touched.

- Finishing a part OR closing it (X / Esc) marks it seen: it never auto-starts again.
- "Skip tour" in a popover sets `toursDisabled` (no more automatic tours).
- Replays (menu / Settings / "Next: ..." button) ignore both flags.
- "Reset all" clears `tourCompleted` and re-enables automatic tours.

## Auto-start rules (`decideAutoStart`)

Never when: tours disabled, part already seen, on the onboarding route, part's page not active,
prerequisite (`welcome`) not yet seen. Wait (poll up to 20 s) when: another tour is running,
a dialog/menu/drawer is open, the ready element is not mounted yet. Then wait for the page to
settle, resolve steps, start.

## Driver.js usage

`driver({ steps, showProgress, progressText: '{{current}} of {{total}}', allowClose, animate,
disableActiveInteraction, overlayClickBehavior: noop, popoverClass: 'llama-tour', onPopoverRender,
onDestroyStarted, onDestroyed })`. Navigation (Prev/Next/arrow keys) goes through our own
`go(i)` so a step can `clickFirst` (e.g. switch the Launch tab) and wait for its element.
