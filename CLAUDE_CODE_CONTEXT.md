# Work Planner — Claude Code Context

## What This Is

Local-first desktop execution enforcement app. Electron + React + TypeScript + Tailwind v4 + SQLite.
Not a task manager. An execution enforcement system — forces daily planning, proof of completion, and honest AI feedback.

## Stack

- Electron v39 + electron-vite
- React + TypeScript (use `React.JSX.Element` not `JSX.Element`)
- Tailwind CSS v4 via `@tailwindcss/vite` plugin
- SQLite via `better-sqlite3`
- React Router v6 with HashRouter
- AI: OpenAI (`gpt-4o-mini`) or Anthropic (`claude-haiku-4-5-20251001`) — user provides key

## Project Structure

```
src/
├── main/
│   ├── index.ts              — app entry, windows, tray, IPC registration, hourly notifications
│   ├── db/
│   │   ├── database.ts       — SQLite connection, WAL mode, FK enabled
│   │   └── migrations/001_initial.ts — all table definitions
│   └── ipc/
│       ├── config.ipc.ts     — config:save, config:get
│       ├── goals.ipc.ts      — goals:save, goals:get, goals:update-validation, subgoals:*
│       ├── tasks.ipc.ts      — tasks:get-by-date, tasks:get-day-plan, tasks:save-day-plan,
│       │                       tasks:save-tasks, tasks:lock-day-plan, tasks:complete,
│       │                       tasks:get-missed, tasks:mark-missed, tasks:carry-over,
│       │                       tasks:drop, tasks:get-carryover-count, tasks:end-of-day
│       ├── ai.ipc.ts         — ai:validate-goal, ai:generate-subgoals, ai:generate-daily-tasks,
│       │                       ai:end-of-day-feedback, ai:suggest-goal-fix
│       ├── reports.ipc.ts    — detectBehaviorPatterns()
│       └── planning.ipc.ts   — EMPTY, not implemented
├── preload/
│   ├── index.ts              — contextBridge exposeInMainWorld('api', {...})
│   └── index.d.ts            — Window.api type definitions
├── renderer/
│   ├── index.html
│   ├── overlay.html          — overlay window entry
│   └── src/
│       ├── App.tsx           — routing + startup redirect logic
│       ├── main.tsx          — HashRouter entry
│       ├── overlay-main.tsx  — overlay renderer entry
│       ├── assets/
│       │   ├── main.css      — Tailwind import + .drag-region + .no-drag + capture-mode CSS
│       │   └── base.css      — CSS variables
│       ├── overlay/
│       │   └── Overlay.tsx   — always-on-top overlay UI
│       └── pages/
│           ├── Setup.tsx         — DONE
│           ├── Goals.tsx         — DONE
│           ├── Today.tsx         — DONE
│           ├── DailyReport.tsx   — DONE
│           ├── WeeklyReport.tsx  — PARTIAL (UI exists, needs day_logs data)
│           └── MonthlyPlan.tsx   — PLACEHOLDER only
└── shared/
    ├── types/index.ts        — all shared TypeScript types
    └── constants.ts          — EFFORT_WEIGHTS, MAX_TASKS_PER_DAY, etc.
```

## Routes

| Route            | Status      |
| ---------------- | ----------- |
| `/setup`         | Done        |
| `/goals`         | Done        |
| `/today`         | Done        |
| `/report/daily`  | Done        |
| `/report/weekly` | Partial     |
| `/plan`          | Placeholder |

## Startup Redirect Logic (App.tsx)

1. No config → `/setup`
2. Config exists, no goals for current month → `/goals`
3. Config + goals exist → `/today`

## IPC Surface (window.api)

```typescript
window.api.config.save(data)
window.api.config.get()

window.api.goals.save(goals)
window.api.goals.get(month)
window.api.goals.updateValidation(id, note, valid)

window.api.subgoals.save(subgoals)
window.api.subgoals.getByGoal(goalId)
window.api.subgoals.delete(id)
window.api.subgoals.update(id, title, priority)

window.api.tasks.getByDate(date)
window.api.tasks.getDayPlan(date)
window.api.tasks.saveDayPlan(data)
window.api.tasks.saveTasks(tasks)
window.api.tasks.lockDayPlan(date)
window.api.tasks.completeTask(id, proof)
window.api.tasks.getMissed(date)
window.api.tasks.markMissed(date)
window.api.tasks.carryOver(taskId, toDate)
window.api.tasks.drop(taskId, date)
window.api.tasks.getCarryOverCount(date)
window.api.tasks.endOfDay(date)  — may not be in preload yet, check index.d.ts

window.api.ai.validateGoal(title)
window.api.ai.generateSubgoals(title, type)
window.api.ai.generateDailyTasks(context)
window.api.ai.endOfDayFeedback(context)
window.api.ai.suggestGoalFix(title, note)

window.api.overlay.openMain()
window.api.electronAPI.captureReport()
```

## Database Schema

```sql
config          — id, ai_provider, api_key_encrypted, working_start, working_end,
                  working_days (JSON), break_start, break_end
holidays        — id, date, is_working, note
goals           — id, month (YYYY-MM), title, type, ai_validated, ai_validation_note
subgoals        — id, goal_id (FK), title, priority
tasks           — id, subgoal_id (FK), title, effort, proof_type, scheduled_date,
                  scheduled_time_slot, status, proof_value, carried_over_from, carry_count
day_plans       — id, date (unique), available_minutes, locked, locked_at, replan_used
day_logs        — id, date (unique), total_weight, completed_weight, execution_score,
                  ai_feedback, tasks_completed, tasks_missed, tasks_carried, tasks_dropped
task_logs       — id, task_id (FK), date, action, proof_type, proof_value, carry_count_at_time
behavior_flags  — id, flag_type, description, task_id, subgoal_id, detected_on,
                  resolved, resolved_on
```

## Key Business Rules

- Max 5 tasks per day
- Max 2 carry-over tasks
- Goals: exactly 5 per month (3 business, 1 personal, 1 family)
- Goals locked once set — cannot be recreated mid-month
- Tasks cannot be completed without required proof (comment or link)
- Lock plan before tasks can be checked off
- End of day: pending tasks → missed, score computed, AI feedback generated
- Effort weights: light=1, medium=2, heavy=3
- execution_score = completed_weight / total_weight

## Enforcement Rules for AI Prompts

- Never use motivational language
- Never say "great job", "keep it up", "you're doing well"
- Reference specific task names, not generic categories
- Max 3 sentences for end-of-day feedback
- Tone: direct, honest, neutral

## Known Issues / Gaps To Fix

1. `tasks:end-of-day` handler exists in tasks.ipc.ts but may not be exposed in preload — verify
2. `WeeklyReport` UI exists but day_logs may be empty if end-of-day was never triggered
3. `src/main/db/queries/` is empty — all queries are inline in IPC handlers
4. `src/renderer/src/hooks/` is empty
5. `src/overlay/` directory contains duplicate overlay code — not the active path, can be deleted
6. `src/renderer/src/components/Versions.tsx` is leftover scaffold — unused, can be deleted
7. API key stored as plaintext in `api_key_encrypted` column — encryption not implemented
8. `npm run build` may fail due to unused `overlayWindow` variable — add `void overlayWindow` or use it
9. Goals page: if goals exist for month, shows warning and blocks re-saving (correct behavior)
10. Carry-over modal appears on Today page load if yesterday had pending tasks

## What Needs To Be Built Next

### High priority

- Wire `tasks:end-of-day` to Today page "End Day" button properly
- Fix WeeklyReport to work once day_logs has data
- Fix `npm run build` TypeScript errors before shipping

### Medium priority

- Replan Today button (regenerates tasks once per day, keeps carry-overs)
- Overlay drag fix (WebkitAppRegion via CSS classes .drag-region / .no-drag in main.css)
- Monthly Plan page (shows all subgoals mapped to calendar weeks)

### Low priority (Phase 3)

- API key encryption via Electron safeStorage
- Delete duplicate src/overlay/ directory
- Delete unused Versions.tsx component
- Add src/main/db/queries/ layer instead of inline SQL

## Rules For This Codebase

1. Always use `React.JSX.Element` return type, never `JSX.Element`
2. Any new IPC handler must be: added to ipc file + registered in main/index.ts + added to preload/index.ts + typed in preload/index.d.ts
3. Main process changes require app restart — renderer changes hot reload
4. Foreign key order for deletes: always delete subgoals before goals
5. All dates as strings in format `YYYY-MM-DD`
6. Month strings in format `YYYY-MM`
7. SQLite booleans stored as INTEGER (0/1)
8. No localStorage or sessionStorage — all state via SQLite + IPC
9. Tailwind v4 — no tailwind.config.ts needed, configured via CSS
10. CSS drag region: use `.drag-region` and `.no-drag` classes defined in main.css
