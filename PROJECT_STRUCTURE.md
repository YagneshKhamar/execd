# Project Structure

This document reflects the repository structure as it exists right now.

## 1. Top-Level Layout

```text
execd/
├── .github/
├── .vscode/
├── build/
├── resources/
├── screenshots/
├── src/
├── .editorconfig
├── .gitignore
├── .prettierignore
├── .prettierrc.yaml
├── CONTRIBUTING.md
├── dev-app-update.yml
├── electron-builder.yml
├── electron.vite.config.ts
├── eslint.config.mjs
├── package-lock.json
├── package.json
├── PROJECT_STRUCTURE.md
├── README.md
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json
```

## 2. Source Tree

```text
src/
├── main/
│   ├── index.ts
│   ├── db/
│   │   ├── database.ts
│   │   ├── migrations/
│   │   │   └── 001_initial.ts
│   │   └── queries/                    (empty)
│   └── ipc/
│       ├── ai.ipc.ts
│       ├── config.ipc.ts
│       ├── goals.ipc.ts
│       ├── planning.ipc.ts
│       ├── reports.ipc.ts
│       ├── tasks.ipc.ts
│       └── team.ipc.ts
├── overlay/
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       └── Overlay.tsx
├── preload/
│   ├── index.d.ts
│   └── index.ts
├── renderer/
│   ├── index.html
│   ├── overlay.html
│   └── src/
│       ├── App.tsx
│       ├── env.d.ts
│       ├── main.tsx
│       ├── overlay-main.tsx
│       ├── assets/
│       │   ├── base.css
│       │   └── main.css
│       ├── components/
│       │   ├── Sidebar.tsx
│       │   ├── Toast.tsx
│       │   └── Versions.tsx
│       ├── hooks/                      (empty)
│       ├── overlay/
│       │   └── Overlay.tsx
│       └── pages/
│           ├── Analytics.tsx
│           ├── DailyReport.tsx
│           ├── Goals.tsx
│           ├── MonthlyPlan.tsx
│           ├── Setup.tsx
│           ├── Team.tsx
│           ├── Today.tsx
│           ├── WeeklyReport.tsx
│           └── YearlyReport.tsx
└── shared/
    ├── constants.ts
    └── types/
        └── index.ts
```

## 3. File Responsibilities

| Path | Responsibility | Status |
|---|---|---|
| `src/main/index.ts` | Electron bootstrap, window/tray lifecycle, IPC registration, overlay wiring | Active |
| `src/main/db/database.ts` | SQLite initialization, migrations execution, DB lifecycle management | Active |
| `src/main/db/migrations/001_initial.ts` | Creates initial schema/tables/indexes | Active |
| `src/main/ipc/ai.ipc.ts` | AI-provider orchestration and AI-related IPC handlers | Active |
| `src/main/ipc/config.ipc.ts` | App config get/save IPC handlers | Active |
| `src/main/ipc/goals.ipc.ts` | Goals and subgoals IPC CRUD/validation operations | Active |
| `src/main/ipc/planning.ipc.ts` | Reserved planning IPC module (no implementation) | Empty |
| `src/main/ipc/reports.ipc.ts` | Daily/weekly/yearly/analytics reporting queries + behavior patterns | Active |
| `src/main/ipc/tasks.ipc.ts` | Day plan + task lifecycle IPC (generate, lock, complete, carry, drop, EOD) | Active |
| `src/main/ipc/team.ipc.ts` | Team members/tasks/followups IPC handlers | Active |
| `src/overlay/index.html` | Secondary overlay HTML shell (older path) | Legacy |
| `src/overlay/src/main.tsx` | Secondary overlay React entrypoint | Legacy |
| `src/overlay/src/Overlay.tsx` | Secondary overlay UI component | Legacy |
| `src/preload/index.d.ts` | Type declarations for exposed `window.api` preload contract | Active |
| `src/preload/index.ts` | `contextBridge` API surface exposed to renderer and overlay | Active |
| `src/renderer/index.html` | Main renderer HTML entry document | Active |
| `src/renderer/overlay.html` | Active overlay HTML entry document | Active |
| `src/renderer/src/App.tsx` | Main route map and startup redirects | Active |
| `src/renderer/src/env.d.ts` | Vite/Electron ambient renderer typings | Active |
| `src/renderer/src/main.tsx` | Main renderer React bootstrap (`HashRouter`, providers) | Active |
| `src/renderer/src/overlay-main.tsx` | Active overlay React bootstrap | Active |
| `src/renderer/src/assets/base.css` | Base tokens/reset/foundation styles | Active |
| `src/renderer/src/assets/main.css` | Global app styles and mode-specific overrides | Active |
| `src/renderer/src/components/Sidebar.tsx` | App left navigation/sidebar UI | Active |
| `src/renderer/src/components/Toast.tsx` | Toast context/provider + notification rendering | Active |
| `src/renderer/src/components/Versions.tsx` | Version display widget (not wired into current app UI) | Placeholder |
| `src/renderer/src/overlay/Overlay.tsx` | Active overlay task/status widget UI | Active |
| `src/renderer/src/pages/Analytics.tsx` | Analytics and trend page | Active |
| `src/renderer/src/pages/DailyReport.tsx` | Daily report page with image export | Active |
| `src/renderer/src/pages/Goals.tsx` | Monthly goal setup and subgoal workflows | Active |
| `src/renderer/src/pages/MonthlyPlan.tsx` | Monthly plan page | Active |
| `src/renderer/src/pages/Setup.tsx` | First-run setup page (provider/API configuration) | Active |
| `src/renderer/src/pages/Team.tsx` | Team assignment and follow-up management page | Active |
| `src/renderer/src/pages/Today.tsx` | Core daily execution flow page | Active |
| `src/renderer/src/pages/WeeklyReport.tsx` | Weekly report page | Active |
| `src/renderer/src/pages/YearlyReport.tsx` | Yearly report page | Active |
| `src/shared/constants.ts` | Cross-process constants | Active |
| `src/shared/types/index.ts` | Cross-process domain/type definitions | Active |

## 4. Route Map

| Route | Page File | Status |
|---|---|---|
| `/` | `src/renderer/src/App.tsx` (runtime redirect to start path) | Active |
| `/setup` | `src/renderer/src/pages/Setup.tsx` | Active |
| `/goals` | `src/renderer/src/pages/Goals.tsx` | Active |
| `/plan` | `src/renderer/src/pages/MonthlyPlan.tsx` | Active |
| `/today` | `src/renderer/src/pages/Today.tsx` | Active |
| `/report/daily` | `src/renderer/src/pages/DailyReport.tsx` | Active |
| `/report/weekly` | `src/renderer/src/pages/WeeklyReport.tsx` | Active |
| `/report/yearly` | `src/renderer/src/pages/YearlyReport.tsx` | Active |
| `/analytics` | `src/renderer/src/pages/Analytics.tsx` | Active |
| `/team` | `src/renderer/src/pages/Team.tsx` | Active |

## 5. IPC Surface

| Namespace | Handlers |
|---|---|
| `config` | `save`, `get` |
| `goals` | `save`, `get`, `updateValidation` |
| `subgoals` | `save`, `getByGoal`, `delete`, `update` |
| `ai` | `validateGoal`, `generateSubgoals`, `generateDailyTasks`, `endOfDayFeedback`, `suggestGoalFix`, `generateAnalyticsInsight` |
| `tasks` | `getByDate`, `getDayPlan`, `saveDayPlan`, `saveTasks`, `lockDayPlan`, `completeTask`, `uncompleteTask`, `getMissed`, `markMissed`, `carryOver`, `drop`, `getCarryOverCount`, `endOfDay` |
| `reports` | `week`, `dayLog`, `year`, `analytics` |
| `team` | `getMembers`, `addMember`, `removeMember`, `getTasks`, `getAllTasks`, `addTask`, `updateTaskStatus`, `addNote`, `getFollowups`, `addFollowup`, `completeFollowup`, `getOverdue` |
| `overlay` | `openMain`, `hide` |
| `electronAPI` | `captureReport` |

## 6. Known Structural Debt

- `src/main/ipc/planning.ipc.ts` exists but is empty.
- `src/main/db/queries/` exists but is empty.
- `src/renderer/src/hooks/` exists but is empty.
- Duplicate overlay implementations exist:
  - Active path: `src/renderer/overlay.html` + `src/renderer/src/overlay-main.tsx` + `src/renderer/src/overlay/Overlay.tsx`
  - Legacy path: `src/overlay/index.html` + `src/overlay/src/main.tsx` + `src/overlay/src/Overlay.tsx`
  - Action: delete the entire `src/overlay/` directory — it is not loaded by any active code path
- `src/renderer/src/components/Versions.tsx` appears to be a placeholder/unused component.
