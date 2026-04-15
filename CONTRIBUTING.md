# Contributing to Execd

Thanks for your interest. Execd is an open source project and
contributions are welcome.

## Setup

1. Fork the repo
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/execd.git`
3. Install dependencies: `npm install`
4. Start development: `npm run dev`

## How the Project Works

See `CLAUDE_CODE_CONTEXT.md` in the repo root for the full architecture,
IPC surface, database schema, and coding rules.

Key things to know:
- `src/main/` — Electron main process. Requires app restart after changes.
- `src/renderer/` — React UI. Hot reloads automatically.
- `src/preload/` — Secure bridge between main and renderer.
- Any new IPC handler must be added to 4 places: the ipc file,
  `main/index.ts`, `preload/index.ts`, and `preload/index.d.ts`.
- All dates as `YYYY-MM-DD` strings. No localStorage — all state via SQLite + IPC.
- Return type `React.JSX.Element` everywhere, never `JSX.Element`.

## Making a Change

1. Create a branch: `git checkout -b fix/your-fix-name`
2. Make your change
3. Run typecheck: `npm run typecheck`
4. Test on your platform
5. Open a pull request with a clear description

## Pull Request Guidelines

- One fix or feature per PR — keep it focused
- Update README.md if your change affects user-facing behavior
- Do not break existing IPC contracts or database schema without migration

## Reporting Bugs

Open an issue with:
- Your OS and version
- App version (shown in title bar)
- Steps to reproduce
- What you expected vs what happened
- Screenshot if relevant

## Feature Requests

Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you considered
