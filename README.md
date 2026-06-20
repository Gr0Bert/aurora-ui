# aurora-ui

Dependency-free debug UI for `aurora-capcompute`.

Start Aurora:

```sh
cd ../aurora-capcompute
sh guest/build.sh
AURORA_LLM=openai AURORA_HTTP_ALLOW=GET:https://go.dev go run ./cmd/aurora-server
```

Start the UI:

```sh
cd ../aurora-ui
npm start
```

Open <http://127.0.0.1:5173>.

Configuration:

- `AURORA_UI_ADDR`, default `127.0.0.1:5173`
- `AURORA_API_URL`, default `http://127.0.0.1:8080`

The Node server serves static files and streams `/v1/*` to Aurora. It has no
external dependencies or build step.
