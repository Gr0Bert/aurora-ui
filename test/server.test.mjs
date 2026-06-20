import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { createUIApp, parseAddress } from "../server.mjs";

test("serves static files with content types", async (t) => {
  const ui = createUIApp();
  ui.listen(0, "127.0.0.1");
  await once(ui, "listening");
  t.after(() => ui.close());
  const address = ui.address();

  const html = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get("content-type"), /text\/html/);
  assert.match(await html.text(), /Aurora Debug UI/);

  const script = await fetch(`http://127.0.0.1:${address.port}/app.mjs`);
  assert.match(script.headers.get("content-type"), /text\/javascript/);
});

test("proxies REST bodies and SSE streams", async (t) => {
  const api = createServer((request, response) => {
    if (request.url === "/v1/echo") {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(body);
      });
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end("event: snapshot\ndata: {\"ok\":true}\n\n");
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  t.after(() => api.close());

  const apiAddress = api.address();
  const ui = createUIApp({ apiURL: `http://127.0.0.1:${apiAddress.port}` });
  ui.listen(0, "127.0.0.1");
  await once(ui, "listening");
  t.after(() => ui.close());
  const uiAddress = ui.address();

  const rest = await fetch(`http://127.0.0.1:${uiAddress.port}/v1/echo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: 1 }),
  });
  assert.equal(rest.status, 201);
  assert.deepEqual(await rest.json(), { value: 1 });

  const events = await fetch(`http://127.0.0.1:${uiAddress.port}/v1/events`);
  assert.match(await events.text(), /event: snapshot/);
});

test("parses configured listen address", () => {
  assert.deepEqual(parseAddress("127.0.0.1:5173"), { host: "127.0.0.1", port: 5173 });
  assert.throws(() => parseAddress("bad"));
});
