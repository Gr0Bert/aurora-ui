export function parseRoute(hash) {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] !== "threads" || !parts[1]) return {};
  return {
    threadId: decodeURIComponent(parts[1]),
    runId: parts[2] === "runs" && parts[3] ? decodeURIComponent(parts[3]) : null,
  };
}

export function routeFor(threadId, runId = null) {
  const thread = encodeURIComponent(threadId);
  return runId
    ? `#/threads/${thread}/runs/${encodeURIComponent(runId)}`
    : `#/threads/${thread}`;
}

export function mergeRun(thread, run) {
  const runs = [...(thread.runs || [])];
  const index = runs.findIndex((candidate) => candidate.id === run.id);
  if (index === -1) runs.push(run);
  else runs[index] = { ...runs[index], ...run };
  return {
    ...thread,
    runs,
    active_run_id: isActive(run.status)
      ? run.id
      : thread.active_run_id === run.id
        ? ""
        : thread.active_run_id,
  };
}

export function isActive(status) {
  return ["queued", "running", "stopping", "yielded"].includes(status);
}

export function canStop(status) {
  return ["queued", "running", "stopping", "yielded"].includes(status);
}

export function canRetry(status) {
  return ["yielded", "stopped", "failed"].includes(status);
}

export function preview(value, limit = 500) {
  const characters = Array.from(String(value));
  if (characters.length <= limit) return { text: String(value), truncated: false };
  return { text: `${characters.slice(0, limit).join("")}[…]`, truncated: true };
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `${response.status} ${response.statusText}`);
  }
  return data;
}
