# aurora-ui

Dependency-free debug UI for `aurora-capcompute`.

Start Aurora:

```sh
cd ../aurora-capcompute
sh guest/build.sh
AURORA_LLM=openai go run ./cmd/aurora-server
```

Start the UI:

```sh
cd ../aurora-ui
npm start
```

Open <http://127.0.0.1:5173>.

Creating a thread opens a JSON manifest editor. The manifest controls the
thread system prompt and default capabilities. The composer accepts an optional
JSON array of per-run capability overrides; restart can use the same field to
replace privileges for a failed or stopped run.

Configuration:

- `AURORA_UI_ADDR`, default `127.0.0.1:5173`
- `AURORA_API_URL`, default `http://127.0.0.1:8080`

The Node server serves static files and streams `/v1/*` to Aurora. It has no
external dependencies or build step.
