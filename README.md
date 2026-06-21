# aurora-ui

React web channel for `aurora-k8s-agent`: switch between bound manifests and
roam the execution graph (threads, runs, revisions, call graphs) with live chat
and a debug drawer.

Start the agent (exposes its HTTP + SSE API on `:8081`):

```sh
cd ../aurora-k8s-agent
AURORA_API_ADDR=:8081 go run ./cmd/aurora-k8s-agent
```

Develop the UI (Vite dev server, hot reload, proxies `/api` → the agent):

```sh
cd ../aurora-ui
npm install
npm run dev        # http://127.0.0.1:5173
```

Point the dev proxy at a non-local agent with `AURORA_API_TARGET`
(default `http://localhost:8081`).

Production build + serve (no nginx needed — the bundled Node server serves the
built assets and proxies `/api`):

```sh
npm run build      # tsc + vite build → dist/
npm start          # node server.mjs → http://127.0.0.1:5173
```

## Authentication

The agent gates its `/api` routes behind a web-channel bearer token:

- The UI shows a **Sign in** screen. Enter a username/password from the
  `WebChannel` user list; it exchanges them at `POST /api/login` for the channel
  token and stores it in `localStorage` (`aurora_token`).
- Every request then carries `Authorization: Bearer <token>`, and the SSE event
  stream carries it as `?token=` (browser `EventSource` cannot set headers).
- A `401` from any call returns you to the sign-in screen.

## What's here

- **Sidebar** — manifest switcher, thread list with live status dots and
  relative times, polled every 10s so threads created elsewhere (e.g. Telegram)
  appear. Collapsible.
- **Thread view** — chat transcript built from the thread graph, live
  `aurora.log` progress lines while a run works, per-run status badges, revision
  tags, links into the debug drawer, and **inline Approve / Deny** cards next to a
  message whose run (or a delegated child) is waiting for human approval.
- **Debug drawer** — slide-in run inspector:
  - revision history slider (`[` / `]`) across retries
  - journal table with expandable args/results
  - **subruns** — the delegation tree (`/api/runs/{id}/graph`), each child with
    its own journal
  - pending-approval cards (approve / deny), including child-run tasks
  - Stop / Resume / Restart controls
- **Keyboard shortcuts** — press `?` for the full list (`n`, `J`/`K`, `` ` ``,
  `d`, `/`, `j`/`k`, `[`/`]`, `r`/`R`/`s`, `y`/`x`, `Esc`).

## Configuration

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `AURORA_API_TARGET` | `npm run dev` (Vite) | `http://localhost:8081` | Dev proxy target |
| `AURORA_UI_ADDR` | `npm start` (server.mjs) | `127.0.0.1:5173` | Production listen address |
| `AURORA_API_URL` | `npm start` (server.mjs) | `http://127.0.0.1:8081` | Production proxy target |

Stack: React 18 + Vite + TypeScript. `npm run typecheck` runs `tsc --noEmit`.
