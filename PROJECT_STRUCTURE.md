# Project Structure

This file maps the repository as it exists today.

## Top-Level Layout

```text
work-planner/
├── build/
├── resources/
├── src/
├── .claude/
├── .code-review-graph/
├── .vscode/
├── electron-builder.yml
├── electron.vite.config.ts
├── eslint.config.mjs
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json
```

## Source Tree

```text
src/
├── main/
│   ├── db/
│   │   ├── database.ts
│   │   ├── migrations/
│   │   │   └── 001_initial.ts
│   │   └── queries/
│   ├── ipc/
│   │   ├── ai.ipc.ts
│   │   ├── config.ipc.ts
│   │   ├── goals.ipc.ts
│   │   ├── planning.ipc.ts
│   │   ├── reports.ipc.ts
│   │   └── tasks.ipc.ts
│   └── index.ts
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
│   └── src/
│       ├── App.tsx
│       ├── assets/
│       │   ├── base.css
│       │   ├── electron.svg
│       │   ├── main.css
│       │   └── wavy-lines.svg
│       ├── components/
│       │   └── Versions.tsx
│       ├── hooks/
│       ├── overlay/
│       │   └── Overlay.tsx
│       ├── pages/
│       │   ├── DailyReport.tsx
│       │   ├── Goals.tsx
│       │   ├── MonthlyPlan.tsx
│       │   ├── Setup.tsx
│       │   ├── Today.tsx
│       │   └── WeeklyReport.tsx
│       ├── env.d.ts
│       ├── main.tsx
│       └── overlay-main.tsx
└── shared/
    ├── constants.ts
    └── types/
        └── index.ts
```

## File Responsibilities

| Path                                       | Responsibility                                                                                      | Current status                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `src/main/index.ts`                        | Electron app bootstrap, main window, tray, overlay window, report capture IPC, hourly notifications | Active                              |
| `src/main/db/database.ts`                  | Opens SQLite DB and runs initial migration                                                          | Active                              |
| `src/main/db/migrations/001_initial.ts`    | Creates all core tables                                                                             | Active                              |
| `src/main/db/queries/`                     | Intended query layer                                                                                | Empty                               |
| `src/main/ipc/config.ipc.ts`               | Save/load configuration                                                                             | Active                              |
| `src/main/ipc/ai.ipc.ts`                   | AI provider requests and AI-backed business logic                                                   | Active                              |
| `src/main/ipc/goals.ipc.ts`                | Goal and subgoal persistence                                                                        | Active                              |
| `src/main/ipc/tasks.ipc.ts`                | Task CRUD-like flows, locking, carry-over, end-of-day logging                                       | Active                              |
| `src/main/ipc/reports.ipc.ts`              | Weekly report query and behavior-flag detection                                                     | Active                              |
| `src/main/ipc/planning.ipc.ts`             | Future monthly planning IPC                                                                         | Empty                               |
| `src/preload/index.ts`                     | Secure renderer bridge via `window.api`                                                             | Active                              |
| `src/preload/index.d.ts`                   | Type definitions for `window.api`                                                                   | Active                              |
| `src/renderer/index.html`                  | Main renderer shell HTML                                                                            | Active                              |
| `src/renderer/src/main.tsx`                | Main renderer entry                                                                                 | Active                              |
| `src/renderer/src/App.tsx`                 | Route registration and startup redirect logic                                                       | Active                              |
| `src/renderer/src/pages/Setup.tsx`         | First-run configuration UI                                                                          | Active                              |
| `src/renderer/src/pages/Goals.tsx`         | Monthly goals and subgoal review flow                                                               | Active                              |
| `src/renderer/src/pages/Today.tsx`         | Daily execution workflow                                                                            | Active                              |
| `src/renderer/src/pages/DailyReport.tsx`   | Daily summary view and image export                                                                 | Active                              |
| `src/renderer/src/pages/WeeklyReport.tsx`  | Weekly summary UI from `day_logs`                                                                   | Partially active                    |
| `src/renderer/src/pages/MonthlyPlan.tsx`   | Monthly planning page                                                                               | Placeholder                         |
| `src/renderer/src/assets/base.css`         | Base variables and resets                                                                           | Active                              |
| `src/renderer/src/assets/main.css`         | Tailwind import, shared styling, overlay drag rules, capture-mode CSS                               | Active                              |
| `src/renderer/src/components/Versions.tsx` | Electron starter scaffold component                                                                 | Legacy / unused                     |
| `src/renderer/src/hooks/`                  | Intended renderer hooks folder                                                                      | Empty                               |
| `src/renderer/src/overlay-main.tsx`        | Active overlay renderer entry                                                                       | Active                              |
| `src/renderer/src/overlay/Overlay.tsx`     | Active overlay UI                                                                                   | Active                              |
| `src/overlay/index.html`                   | Secondary overlay HTML shell                                                                        | Present but not primary active path |
| `src/overlay/src/main.tsx`                 | Secondary overlay entry                                                                             | Present but not primary active path |
| `src/overlay/src/Overlay.tsx`              | Secondary overlay component copy                                                                    | Present but not primary active path |
| `src/shared/constants.ts`                  | Shared execution constants                                                                          | Present                             |
| `src/shared/types/index.ts`                | Shared domain types                                                                                 | Active                              |

## Functional Grouping

### App shell and platform

- `src/main/index.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `electron.vite.config.ts`
- `electron-builder.yml`

### Persistence

- `src/main/db/database.ts`
- `src/main/db/migrations/001_initial.ts`
- `src/shared/types/index.ts`

### AI and planning logic

- `src/main/ipc/ai.ipc.ts`
- `src/main/ipc/goals.ipc.ts`
- `src/main/ipc/tasks.ipc.ts`
- `src/main/ipc/reports.ipc.ts`
- `src/shared/constants.ts`

### Main product UI

- `src/renderer/src/pages/Setup.tsx`
- `src/renderer/src/pages/Goals.tsx`
- `src/renderer/src/pages/Today.tsx`
- `src/renderer/src/pages/DailyReport.tsx`
- `src/renderer/src/pages/WeeklyReport.tsx`

### Overlay UI

- `src/renderer/src/overlay-main.tsx`
- `src/renderer/src/overlay/Overlay.tsx`

## Route Map

| Route            | Source file                               | Status      |
| ---------------- | ----------------------------------------- | ----------- |
| `/`              | `src/renderer/src/App.tsx` redirect logic | Active      |
| `/setup`         | `src/renderer/src/pages/Setup.tsx`        | Active      |
| `/goals`         | `src/renderer/src/pages/Goals.tsx`        | Active      |
| `/today`         | `src/renderer/src/pages/Today.tsx`        | Active      |
| `/report/daily`  | `src/renderer/src/pages/DailyReport.tsx`  | Active      |
| `/report/weekly` | `src/renderer/src/pages/WeeklyReport.tsx` | Partial     |
| `/plan`          | `src/renderer/src/pages/MonthlyPlan.tsx`  | Placeholder |

## IPC Surface Exposed To Renderer

Renderer-accessible namespaces from `window.api`:

- `config`
- `goals`
- `subgoals`
- `ai`
- `tasks`
- `reports`
- `overlay`
- `electronAPI`

Notable mismatch:

- `tasks:end-of-day` exists in the main process but is not exposed in preload, so renderer code cannot currently trigger the end-of-day pipeline.

## Daily Report Export Files

The image export feature currently spans these files:

- `src/renderer/src/pages/DailyReport.tsx`
- `src/renderer/src/assets/main.css`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/main/index.ts`

Current flow:

1. Mark body with `capture-mode`.
2. Keep only `[data-report-capture='daily-report']` visible.
3. Call Electron IPC `capture-report`.
4. Capture the focused window into PNG.
5. Download the base64 PNG in the renderer.

## Known Structural Debt

1. Duplicate overlay source exists in both `src/overlay/` and `src/renderer/src/overlay/`.
2. `src/main/db/queries/` is empty although the README rules mention it.
3. `src/renderer/src/hooks/` is empty.
4. `src/main/ipc/planning.ipc.ts` is empty.
5. `src/renderer/src/components/Versions.tsx` remains from the starter template.
