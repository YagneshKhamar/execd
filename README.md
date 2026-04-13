This is an Electron + React + Vite + Tailwind + SQLite app.

- Main process: src/main/
- Renderer: src/renderer/src/
- Preload bridge: src/preload/index.ts
- Shared types: src/shared/types/index.ts
- All IPC handlers must be registered in src/main/index.ts
- Any new IPC method needs to be added to BOTH preload/index.ts AND preload/index.d.ts
- We use React.JSX.Element not JSX.Element
- Tailwind v4 with @tailwindcss/vite plugin
- better-sqlite3 for database, all queries in src/main/db/queries/
- No localStorage, no sessionStorage
