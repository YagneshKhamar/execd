# Work Planner

Desktop work-planning application built with Electron, React, TypeScript, Tailwind CSS v4, and SQLite.

This repository already contains a usable end-to-end daily workflow:

1. Configure AI provider and work schedule.
2. Define exactly 5 monthly goals.
3. Validate goals with AI and generate subgoals.
4. Generate today’s tasks from saved subgoals.
5. Lock the day plan.
6. Complete tasks with optional proof.
7. Review the Daily Report and download it as an image.

Status date: `2026-04-13`

## What Is Implemented

| Area                        | Status                | Notes                                                                              |
| --------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| Electron shell              | Implemented           | Main window, tray icon, overlay window, hourly notification loop                   |
| Local database              | Implemented           | SQLite via `better-sqlite3`, auto-migrated on app start                            |
| Setup flow                  | Implemented           | Saves AI provider, API key, working hours, break hours, working days               |
| Monthly goals               | Implemented           | Requires 5 goals, validates with AI, generates 5 AI subgoals per goal              |
| Subgoal review              | Implemented           | User can edit, remove, or add subgoals before saving                               |
| Today page                  | Implemented           | Generates daily tasks, locks plan, completes tasks, handles proof input            |
| Carry-over flow             | Implemented           | Detects yesterday’s pending tasks, allows carry forward or drop, max 2 carry-overs |
| Daily report page           | Implemented           | Shows score, today’s tasks, tomorrow’s tasks, back navigation to Today             |
| Daily report image download | Implemented           | Uses Electron `capturePage()` through preload IPC and downloads PNG                |
| Weekly report UI            | Partially implemented | Reads `day_logs`, but no UI currently triggers `tasks:end-of-day` to populate them |
| Monthly plan page           | Placeholder           | Route exists, page only renders static text                                        |
| Planning IPC                | Placeholder           | `src/main/ipc/planning.ipc.ts` is empty                                            |

## Daily Report Image Export

The current Daily Report export is implemented in the renderer and main process together:

1. [src/renderer/src/pages/DailyReport.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/pages/DailyReport.tsx) adds the `capture-mode` class to `document.body`.
2. [src/renderer/src/assets/main.css](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/assets/main.css) hides everything except the element marked with `data-report-capture="daily-report"`.
3. [src/preload/index.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/preload/index.ts) exposes `window.api.electronAPI.captureReport()`.
4. [src/main/index.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/main/index.ts) handles `capture-report` with `BrowserWindow.getFocusedWindow()?.webContents.capturePage(...)`.
5. The renderer converts the returned base64 PNG into a downloadable `daily-report-YYYY-MM-DD.png`.

Important implementation note:

- The isolation CSS is present, but the rule is written as `.capture-mode body` instead of `body.capture-mode`. The hide/show behavior still runs because `.capture-mode *` matches descendants of `body.capture-mode`, but the special body layout rule does not currently apply.

## User Flow In Code

| Route            | File                                                                                                                            | Current behavior                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/setup`         | [src/renderer/src/pages/Setup.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/pages/Setup.tsx)               | Saves provider, API key, work hours, break hours, and working days                    |
| `/goals`         | [src/renderer/src/pages/Goals.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/pages/Goals.tsx)               | Collects 5 goals, validates them, generates subgoals, saves everything                |
| `/today`         | [src/renderer/src/pages/Today.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/pages/Today.tsx)               | Loads today’s plan and tasks, generates tasks with AI, locks the day, completes tasks |
| `/report/daily`  | [src/renderer/src/pages/DailyReport.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/pages/DailyReport.tsx)   | Displays execution summary and downloads image                                        |
| `/report/weekly` | [src/renderer/src/pages/WeeklyReport.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/pages/WeeklyReport.tsx) | Displays 7-day summary from `day_logs` and recurring miss patterns                    |
| `/plan`          | [src/renderer/src/pages/MonthlyPlan.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/pages/MonthlyPlan.tsx)   | Placeholder only                                                                      |

## Architecture

### Main process

- [src/main/index.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/main/index.ts) creates the main window, tray, overlay window, IPC handlers, and hourly notifications.
- [src/main/db/database.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/main/db/database.ts) opens the SQLite database in Electron `userData`.
- [src/main/db/migrations/001_initial.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/main/db/migrations/001_initial.ts) defines the initial schema.
- IPC handlers live in `src/main/ipc/`.

### Preload bridge

- [src/preload/index.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/preload/index.ts) exposes `config`, `goals`, `subgoals`, `ai`, `tasks`, `reports`, `overlay`, and `electronAPI`.
- [src/preload/index.d.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/preload/index.d.ts) defines the renderer-facing types for `window.api`.

### Renderer

- [src/renderer/src/App.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/App.tsx) decides the start route and registers app routes.
- [src/renderer/src/main.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/main.tsx) bootstraps the main renderer with `HashRouter`.
- [src/renderer/src/assets/main.css](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/assets/main.css) contains base styling plus overlay drag-region helpers and report capture styles.

### Overlay

- Active overlay entry: [src/renderer/src/overlay-main.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/overlay-main.tsx)
- Active overlay component: [src/renderer/src/overlay/Overlay.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/overlay/Overlay.tsx)
- Additional duplicate overlay source also exists under [src/overlay](/d:/Project/AI%20Work%20Planner/work-planner/src/overlay), but it is not the path currently wired by `overlay-main.tsx`.

## Database Schema Already Present

The initial migration already creates these tables:

- `config`
- `holidays`
- `goals`
- `subgoals`
- `tasks`
- `day_plans`
- `day_logs`
- `task_logs`
- `behavior_flags`

This means the data model already supports:

- app configuration
- monthly goals and subgoals
- daily tasks and carry-over history
- day plan locking
- day-level logging
- task-level logging
- behavior flag detection

## AI Integration

AI calls currently run in the main process via `fetch()` inside [src/main/ipc/ai.ipc.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/main/ipc/ai.ipc.ts).

Supported providers:

- OpenAI via `https://api.openai.com/v1/chat/completions`
- Anthropic via `https://api.anthropic.com/v1/messages`

Current prompt-backed capabilities:

- goal validation
- goal rewrite suggestion
- subgoal generation
- daily task generation
- end-of-day feedback generation

## How To Run

```bash
npm install
npm run dev
```

Useful scripts:

```bash
npm run lint
npm run typecheck:node
npm run typecheck:web
npm run build
npm run build:win
```

## Current Technical Gaps And Accuracy Notes

These are not guesses. They are based on the current repository state.

1. `MonthlyPlan` is not built yet.
2. `planning.ipc.ts` exists but is empty.
3. `tasks:end-of-day` exists in [src/main/ipc/tasks.ipc.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/main/ipc/tasks.ipc.ts), but it is not exposed from preload and no renderer page calls it.
4. Because of that, `day_logs` and behavior-flag generation are not currently driven by the UI flow.
5. `WeeklyReport` depends on `day_logs`, so it is present in UI but not fully operational through normal user interaction yet.
6. `src/main/db/queries/` exists but is empty.
7. `src/renderer/src/hooks/` exists but is empty.
8. `src/renderer/src/components/Versions.tsx` is leftover scaffold code and is not part of the current product flow.
9. `src/overlay/` duplicates overlay code that is not the active renderer entry path.
10. The Setup page says the API key is stored encrypted, but [src/main/ipc/config.ipc.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/main/ipc/config.ipc.ts) currently writes the raw key into the `api_key_encrypted` column. Encryption is not implemented yet.

## Current Verification State

These command results were observed during this documentation pass:

- `npm run build` fails because [src/main/index.ts](/d:/Project/AI%20Work%20Planner/work-planner/src/main/index.ts) declares `overlayWindow` and never reads it.
- `npm run typecheck:web` fails because of:
  [src/renderer/src/App.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/App.tsx) unused `useNavigate`
  [src/renderer/src/components/Versions.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/components/Versions.tsx) references `window.electron`
  [src/renderer/src/pages/Setup.tsx](/d:/Project/AI%20Work%20Planner/work-planner/src/renderer/src/pages/Setup.tsx) uses `JSX.Element` instead of `React.JSX.Element`

## Project Structure Reference

See [PROJECT_STRUCTURE.md](/d:/Project/AI%20Work%20Planner/work-planner/PROJECT_STRUCTURE.md) for the repository tree and a file-by-file explanation of the current codebase.
