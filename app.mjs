import {
  api, canRetry, canStop, mergeRun, parseJSON, parseRoute, preview, routeFor,
} from "./lib.mjs";

const state = {
  threads: [],
  thread: null,
  journal: null,
  eventSource: null,
  journalTimer: null,
  pending: false,
};

const elements = {
  connection: document.querySelector("#connection"),
  errorBanner: document.querySelector("#error-banner"),
  errorMessage: document.querySelector("#error-message"),
  threadList: document.querySelector("#thread-list"),
  threadTitle: document.querySelector("#thread-title"),
  threadMeta: document.querySelector("#thread-meta"),
  conversation: document.querySelector("#conversation"),
  composer: document.querySelector("#composer"),
  input: document.querySelector("#message-input"),
  send: document.querySelector("#send-message"),
  inspector: document.querySelector("#run-inspector"),
  overrides: document.querySelector("#capability-overrides"),
  threadDialog: document.querySelector("#thread-dialog"),
  threadForm: document.querySelector("#thread-form"),
  threadManifest: document.querySelector("#thread-manifest"),
};

document.querySelector("#new-thread").addEventListener("click", () => elements.threadDialog.showModal());
document.querySelector("#dismiss-error").addEventListener("click", clearError);
elements.threadForm.addEventListener("submit", createThread);
elements.composer.addEventListener("submit", sendMessage);
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});
window.addEventListener("hashchange", loadRoute);

boot();

async function boot() {
  try {
    const data = await api("/v1/threads");
    state.threads = data.threads || [];
    renderThreads();
    await loadRoute();
  } catch (error) {
    showError(error);
  }
}

async function loadRoute() {
  const { threadId, runId } = parseRoute(location.hash);
  closeEvents();
  state.thread = null;
  state.journal = null;
  if (!threadId) {
    render();
    return;
  }
  try {
    state.thread = await api(`/v1/threads/${encodeURIComponent(threadId)}`);
    upsertThread(state.thread);
    render();
    connectEvents(threadId);
    if (runId) await loadJournal(runId);
  } catch (error) {
    showError(error);
    render();
  }
}

async function createThread(event) {
  event.preventDefault();
  if (event.submitter?.value !== "create") {
    elements.threadDialog.close();
    return;
  }
  await withPending(async () => {
    const manifest = parseJSON(elements.threadManifest.value, "Invalid manifest JSON");
    const thread = await api("/v1/threads", {
      method: "POST",
      body: JSON.stringify({ manifest }),
    });
    upsertThread(thread);
    elements.threadDialog.close();
    location.hash = routeFor(thread.id);
    queueMicrotask(() => elements.input.focus());
  });
}

async function sendMessage(event) {
  event.preventDefault();
  const content = elements.input.value.trim();
  if (!state.thread || !content) return;
  await withPending(async () => {
    const capabilityOverrides = parseJSON(elements.overrides.value, "Invalid capability overrides JSON");
    if (!Array.isArray(capabilityOverrides)) {
      throw new Error("Capability overrides must be a JSON array");
    }
    const run = await api(`/v1/threads/${encodeURIComponent(state.thread.id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, capability_overrides: capabilityOverrides }),
    });
    elements.input.value = "";
    elements.overrides.value = "[]";
    state.thread = mergeRun(state.thread, run);
    if ((state.thread.run_count || 0) === 0) {
      state.thread.title = threadTitle(content);
    }
    state.thread.run_count = state.thread.runs.length;
    upsertThread(state.thread);
    location.hash = routeFor(state.thread.id, run.id);
  });
}

function connectEvents(threadId) {
  const source = new EventSource(`/v1/threads/${encodeURIComponent(threadId)}/events`);
  state.eventSource = source;
  source.onopen = () => setConnection(true);
  source.onerror = () => setConnection(false);
  source.addEventListener("snapshot", (event) => {
    state.thread = JSON.parse(event.data);
    upsertThread(state.thread);
    render();
  });
  source.addEventListener("run.updated", (event) => {
    const run = JSON.parse(event.data);
    state.thread = mergeRun(state.thread, run);
    upsertThread(state.thread);
    render();
  });
  source.addEventListener("journal.appended", (event) => {
    const update = JSON.parse(event.data);
    const selected = parseRoute(location.hash).runId;
    if (selected === update.run_id) {
      clearTimeout(state.journalTimer);
      state.journalTimer = setTimeout(() => loadJournal(selected), 150);
    }
  });
}

function closeEvents() {
  state.eventSource?.close();
  state.eventSource = null;
  setConnection(false);
}

async function loadJournal(runId) {
  try {
    state.journal = await api(`/v1/runs/${encodeURIComponent(runId)}/journal`);
    renderInspector();
  } catch (error) {
    showError(error);
  }
}

async function runAction(runId, action, body = null) {
  await withPending(async () => {
    const run = await api(`/v1/runs/${encodeURIComponent(runId)}/${action}`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    state.thread = mergeRun(state.thread, run);
    render();
  });
}

async function withPending(action) {
  if (state.pending) return;
  state.pending = true;
  clearError();
  render();
  try {
    await action();
  } catch (error) {
    showError(error);
  } finally {
    state.pending = false;
    render();
  }
}

function render() {
  renderThreads();
  renderConversation();
  renderInspector();
}

function renderThreads() {
  elements.threadList.replaceChildren();
  if (!state.threads.length) {
    elements.threadList.append(textElement("div", "No threads yet.", "empty-state"));
    return;
  }
  for (const thread of [...state.threads].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
    const button = document.createElement("button");
    button.className = `thread-item${state.thread?.id === thread.id ? " selected" : ""}`;
    const title = textElement("span", thread.title || "New thread", "thread-title");
    const details = textElement("span", `${thread.run_count} run${thread.run_count === 1 ? "" : "s"}`, "thread-details");
    button.append(title, details);
    button.addEventListener("click", () => { location.hash = routeFor(thread.id); });
    elements.threadList.append(button);
  }
}

function renderConversation() {
  const thread = state.thread;
  elements.conversation.replaceChildren();
  if (!thread) {
    elements.threadTitle.textContent = "Select a thread";
    elements.threadMeta.textContent = "";
    elements.conversation.className = "conversation empty-state";
    elements.conversation.textContent = "Create or select a thread to begin.";
    updateComposer();
    return;
  }
  elements.threadTitle.textContent = thread.title || "New thread";
  elements.threadMeta.textContent = thread.id;
  elements.conversation.className = "conversation";

  const selectedRunId = parseRoute(location.hash).runId;
  for (const run of thread.runs || []) {
    elements.conversation.append(textElement("div", run.message, "message user"));
    const response = document.createElement("div");
    response.className = `message assistant ${run.status}${selectedRunId === run.id ? " selected" : ""}`;
    response.append(textElement("span", run.status, `message-status ${run.status}`));
    if (run.answer) {
      response.append(document.createTextNode(run.answer));
    } else if (run.error) {
      response.append(document.createTextNode(run.error));
    } else {
      response.append(document.createTextNode(statusText(run.status)));
    }
    response.addEventListener("click", () => { location.hash = routeFor(thread.id, run.id); });
    elements.conversation.append(response);
  }
  if (!(thread.runs || []).length) {
    elements.conversation.append(textElement("div", "Send the first message.", "empty-state"));
  }
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
  updateComposer();
}

function updateComposer() {
  const disabled = !state.thread || Boolean(state.thread.active_run_id) || state.pending;
  elements.input.disabled = disabled;
  elements.send.disabled = disabled;
}

function renderInspector() {
  elements.inspector.replaceChildren();
  const runId = parseRoute(location.hash).runId;
  const run = state.thread?.runs?.find((candidate) => candidate.id === runId);
  if (!run) {
    elements.inspector.className = "inspector empty-state";
    elements.inspector.textContent = "Select a run.";
    return;
  }
  elements.inspector.className = "inspector";
  const metadata = document.createElement("dl");
  metadata.className = "metadata";
  addMetadata(metadata, "Status", run.status);
  addMetadata(metadata, "Attempt", run.attempt);
  addMetadata(metadata, "Run ID", run.id);
  addMetadata(metadata, "Created", formatTime(run.created_at));
  addMetadata(metadata, "Updated", formatTime(run.updated_at));
  addMetadata(metadata, "Journal", run.journal_length);
  addMetadata(metadata, "Capabilities", run.effective_manifest?.capabilities?.map((item) => item.name).join(", ") || "none");
  elements.inspector.append(metadata);

  if (run.answer) elements.inspector.append(textElement("div", run.answer, "message assistant"));
  if (run.error) elements.inspector.append(textElement("div", run.error, "message"));

  const controls = document.createElement("div");
  controls.className = "controls";
  if (canStop(run.status)) {
    controls.append(actionButton("Stop", "danger", () => runAction(run.id, "stop")));
  }
  if (canRetry(run.status)) {
    controls.append(
      actionButton("Resume", "", () => runAction(run.id, "retry", { mode: "resume" })),
      actionButton("Restart", "", () => {
        const capabilityOverrides = parseJSON(elements.overrides.value, "Invalid capability overrides JSON");
        if (!Array.isArray(capabilityOverrides)) throw new Error("Capability overrides must be a JSON array");
        return runAction(run.id, "retry", { mode: "restart", capability_overrides: capabilityOverrides });
      }),
    );
  }
  elements.inspector.append(controls);

  const header = document.createElement("div");
  header.className = "journal-header";
  header.append(textElement("strong", `Journal (${run.journal_length})`));
  const refresh = actionButton("Refresh", "", () => loadJournal(run.id));
  header.append(refresh);
  elements.inspector.append(header);

  if (!state.journal) {
    elements.inspector.append(textElement("div", "Loading journal…", "muted"));
    loadJournal(run.id);
    return;
  }
  for (const entry of state.journal.entries || []) {
    elements.inspector.append(renderJournalEntry(entry));
  }
}

function renderJournalEntry(entry) {
  const details = document.createElement("details");
  details.className = "journal-entry";
  details.append(textElement("summary", `#${entry.index} ${entry.call.name} → ${entry.outcome.status}`));
  const body = document.createElement("div");
  body.className = "journal-body";
  const copyRow = document.createElement("div");
  copyRow.className = "copy-row";
  copyRow.append(actionButton("Copy raw JSON", "", () => navigator.clipboard.writeText(JSON.stringify(entry, null, 2))));
  body.append(copyRow, renderJSON(entry));
  details.append(body);
  return details;
}

function renderJSON(value) {
  const root = document.createElement("div");
  root.className = "json-value";
  appendJSON(root, value, 0);
  return root;
}

function appendJSON(parent, value, depth) {
  const indent = "  ".repeat(depth);
  if (typeof value === "string") {
    const short = preview(value);
    const span = textElement("span", JSON.stringify(short.text));
    parent.append(span);
    if (short.truncated) {
      let expanded = false;
      const button = actionButton("expand", "expand-string", () => {
        expanded = !expanded;
        span.textContent = JSON.stringify(expanded ? value : short.text);
        button.textContent = expanded ? "collapse" : "expand";
      });
      parent.append(button);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    parent.append(document.createTextNode(JSON.stringify(value)));
    return;
  }
  if (Array.isArray(value)) {
    parent.append(document.createTextNode("[\n"));
    value.forEach((item, index) => {
      parent.append(document.createTextNode(`${"  ".repeat(depth + 1)}`));
      appendJSON(parent, item, depth + 1);
      parent.append(document.createTextNode(`${index < value.length - 1 ? "," : ""}\n`));
    });
    parent.append(document.createTextNode(`${indent}]`));
    return;
  }
  const entries = Object.entries(value);
  parent.append(document.createTextNode("{\n"));
  entries.forEach(([key, item], index) => {
    parent.append(document.createTextNode(`${"  ".repeat(depth + 1)}`));
    const keyNode = textElement("span", JSON.stringify(key), "json-key");
    parent.append(keyNode, document.createTextNode(": "));
    appendJSON(parent, item, depth + 1);
    parent.append(document.createTextNode(`${index < entries.length - 1 ? "," : ""}\n`));
  });
  parent.append(document.createTextNode(`${indent}}`));
}

function threadTitle(message) {
  const compact = message.trim().replace(/\s+/g, " ");
  const characters = Array.from(compact);
  if (characters.length <= 60) {
    return compact || "New thread";
  }
  return `${characters.slice(0, 60).join("")}…`;
}

function addMetadata(dl, label, value) {
  dl.append(textElement("dt", label), textElement("dd", value ?? "—"));
}

function actionButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.disabled = state.pending;
  button.addEventListener("click", () => {
    Promise.resolve().then(handler).catch(showError);
  });
  return button;
}

function textElement(tag, text, className = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function upsertThread(thread) {
  const summary = {
    id: thread.id,
    title: thread.title,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    run_count: thread.run_count,
    active_run_id: thread.active_run_id,
  };
  const index = state.threads.findIndex((candidate) => candidate.id === summary.id);
  if (index === -1) state.threads.push(summary);
  else state.threads[index] = { ...state.threads[index], ...summary };
}

function setConnection(online) {
  elements.connection.textContent = online ? "live" : "disconnected";
  elements.connection.className = `connection ${online ? "online" : "offline"}`;
}

function showError(error) {
  elements.errorMessage.textContent = error.message || String(error);
  elements.errorBanner.classList.remove("hidden");
}

function clearError() {
  elements.errorBanner.classList.add("hidden");
  elements.errorMessage.textContent = "";
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function statusText(status) {
  switch (status) {
    case "queued": return "Waiting to start...";
    case "running": return "Aurora is working...";
    case "stopping": return "Stopping...";
    case "yielded": return "Aurora yielded. Resume or stop this run.";
    case "stopped": return "Run stopped.";
    case "failed": return "Run failed.";
    default: return status;
  }
}
