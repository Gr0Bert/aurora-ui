import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { request as proxyRequest } from "node:http";
import { request as secureProxyRequest } from "node:https";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Serve the Vite production build. Run `npm run build` first; `npm run dev`
// uses Vite's own dev server (with its own /api proxy) instead of this one.
const root = fileURLToPath(new URL("./dist", import.meta.url));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

export function createUIApp({ apiURL = "http://127.0.0.1:8081", staticRoot = root } = {}) {
  const upstream = new URL(apiURL);
  return createServer((request, response) => {
    if (request.url === "/api" || request.url.startsWith("/api/")) {
      proxy(request, response, upstream);
      return;
    }
    serveStatic(request, response, staticRoot);
  });
}

function proxy(clientRequest, clientResponse, upstream) {
  const transport = upstream.protocol === "https:" ? secureProxyRequest : proxyRequest;
  const target = new URL(clientRequest.url, upstream);
  const headers = { ...clientRequest.headers, host: target.host };
  const outgoing = transport(target, {
    method: clientRequest.method,
    headers,
  }, (upstreamResponse) => {
    clientResponse.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(clientResponse);
  });
  outgoing.on("error", (error) => {
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, { "content-type": "application/json" });
    }
    clientResponse.end(JSON.stringify({ error: "bad_gateway", message: error.message }));
  });
  clientRequest.on("aborted", () => outgoing.destroy());
  clientRequest.pipe(outgoing);
}

function serveStatic(request, response, staticRoot) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let filename = resolve(staticRoot, relative);
  if (filename !== resolve(staticRoot) && !filename.startsWith(resolve(staticRoot) + sep)) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    if (!statSync(filename).isFile()) throw new Error("not a file");
  } catch {
    // Single-page app: fall back to index.html for non-asset routes so deep
    // links and reloads load the app rather than 404ing.
    if (extname(filename) === "") {
      filename = resolve(staticRoot, "index.html");
      try {
        statSync(filename);
      } catch {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Build missing — run `npm run build` first.");
        return;
      }
    } else {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
  }
  response.writeHead(200, {
    "content-type": contentTypes[extname(filename)] || "application/octet-stream",
    "cache-control": "no-cache",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filename).pipe(response);
}

export function parseAddress(value = "127.0.0.1:5173") {
  const index = value.lastIndexOf(":");
  if (index < 1) throw new Error(`invalid address: ${value}`);
  const host = value.slice(0, index);
  const port = Number(value.slice(index + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid address: ${value}`);
  return { host, port };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const address = parseAddress(process.env.AURORA_UI_ADDR);
  const server = createUIApp({ apiURL: process.env.AURORA_API_URL });
  server.listen(address.port, address.host, () => {
    console.log(`Aurora UI listening on http://${address.host}:${address.port}`);
  });
}
