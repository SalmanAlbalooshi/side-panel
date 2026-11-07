// Local HTTP server that Claude Code hooks POST to. Tracks sessions, plans and approvals.
// Approvals: the PermissionRequest hook waits here until you tap Allow or Deny, or the wait runs out
// (then we answer with no decision and Claude Code shows its normal prompt).
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");

const crypto = require("crypto");
const PORT = Number(process.env.SP_HOOK_PORT) || 47821; // tests use their own port so they never touch a running panel
let TOKEN = "";
// One random secret per install. Claude Code sends it as a header; anything without it is ignored.
function setTokenFile(file) {
  try { TOKEN = fs.readFileSync(file, "utf8").trim(); } catch { }
  if (!/^[a-f0-9]{64}$/.test(TOKEN)) { TOKEN = crypto.randomBytes(32).toString("hex"); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, TOKEN); }
  return TOKEN;
}
function tokenOk(got) {
  const a = Buffer.from(String(got || "")), b = Buffer.from(TOKEN);
  return a.length === b.length && b.length > 0 && crypto.timingSafeEqual(a, b);
}
const APPROVAL_WAIT_MS = 50000;

function plain(s) { return String(s || "").replace(/```[\s\S]*?```/g, " ").replace(/\*\*|__|`|^#+\s*|^\s*[-*]\s+/gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); }
function short(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function base(p) { return p ? path.basename(String(p)) : ""; }

// The question shown on an approval card.
function askLine(tool, input) {
  input = input || {};
  switch (tool) {
    case "Bash": case "PowerShell": { const c = String(input.command || "").replace(/\s+/g, " ").trim(); return c ? "Run: " + (c.length > 90 ? c.slice(0, 89) + "… (full command below)" : c) : "Run a command"; }
    case "Edit": case "MultiEdit": return "Edit " + base(input.file_path);
    case "Write": return "Write " + base(input.file_path);
    case "WebFetch": return "Open a web page";
    case "WebSearch": return "Search the web";
    default: return tool && tool.startsWith("mcp__") ? "Use " + tool.split("__").slice(1).join(" ") : "Use " + (tool || "a tool");
  }
}
// Turns a tool call into plain words.
function describe(tool, input) {
  input = input || {};
  switch (tool) {
    case "Read": return "Reading " + base(input.file_path);
    case "Edit": case "MultiEdit": return "Editing " + base(input.file_path);
    case "Write": return "Writing " + base(input.file_path);
    case "NotebookEdit": return "Editing a notebook";
    case "Bash": case "PowerShell": return "Running " + short(input.description || input.command, 60);
    case "Grep": return "Searching for " + short(input.pattern, 40);
    case "Glob": return "Looking for files " + short(input.pattern, 40);
    case "WebFetch": return "Reading a web page";
    case "WebSearch": return "Searching the web for " + short(input.query, 40);
    case "Task": case "Agent": return "Helper: " + short(input.description || input.prompt, 60);
    case "TodoWrite": case "TaskCreate": case "TaskUpdate": return "Updating the plan";
    default: return tool && tool.startsWith("mcp__") ? "Using " + tool.split("__")[1] : "Using " + (tool || "a tool");
  }
}

class ClaudeHub {
  // canAnswer(): true when the panel is on screen and approvals from the panel are switched on.
  constructor(onChange, canAnswer) {
    this.sessions = new Map();
    this.approvals = new Map();
    this.onChange = onChange || (() => {});
    this.canAnswer = canAnswer || (() => true);
    this.nextApproval = 1;
    this.server = null;
    this.listening = false;
    this.portBusy = false;
    // forget sessions that went silent (crashed terminals never send SessionEnd)
    this.gc = setInterval(() => {
      const cut = Date.now() - 6 * 3600 * 1000;
      for (const [id, s] of this.sessions) if (s.updated < cut && s.state !== "waiting") this.sessions.delete(id);
    }, 10 * 60 * 1000);
  }

  session(ev) {
    const id = ev.session_id || "unknown";
    let s = this.sessions.get(id);
    if (!s) {
      s = { id, provider: "Claude Code", project: base(ev.cwd) || "session", cwd: ev.cwd || "", state: "working", now: "Starting", summary: "", plan: [], taskIds: {}, files: {}, started: Date.now(), updated: Date.now(), feed: [], transcript: ev.transcript_path || "" };
      this.sessions.set(id, s);
    }
    if (ev.cwd) { s.cwd = ev.cwd; s.project = base(ev.cwd); }
    if (ev.transcript_path) s.transcript = ev.transcript_path;
    s.updated = Date.now();
    return s;
  }
  log(s, text) { s.feed.unshift({ t: Date.now(), text }); s.feed = s.feed.slice(0, 12); }

  handle(event, ev, res) {
    const s = this.session(ev);
    switch (event) {
      case "UserPromptSubmit":
        // tool and system notices arrive as prompts too; they aren't something you asked
        const real = !/^\s*(<|\[SYSTEM|Caveat:)/.test(String(ev.prompt || ""));
        s.state = "working"; s.now = real ? "Thinking about: " + short(ev.prompt, 70) : "Working"; if (real) s.ask = short(ev.prompt, 120); s.summary = "";
        if (ev.session_title) s.title = ev.session_title;
        this.log(s, "You asked: " + short(ev.prompt, 80));
        break;
      case "PreToolUse":
        s.state = "working"; s.now = describe(ev.tool_name, ev.tool_input);
        this.log(s, s.now);
        break;
      case "PostToolUse": {
        const ti = ev.tool_input || {};
        if (["Edit", "MultiEdit", "Write"].includes(ev.tool_name) && ti.file_path) {
          const f = base(ti.file_path);
          if (s.files[f] || Object.keys(s.files).length < 200) s.files[f] = (s.files[f] || 0) + 1;
        }
        if (ev.tool_name === "TodoWrite" && Array.isArray(ti.todos)) {
          s.plan = ti.todos.slice(0, 50).map((t) => ({ text: short(t.content || t.activeForm || "", 120), status: t.status || "pending" }));
        }
        if (ev.tool_name === "TaskCreate" && s.plan.length < 50) {
          const tr = ev.tool_response || {};
          const tid = (tr.task && tr.task.id) || tr.id || String(s.plan.length + 1);
          s.taskIds[tid] = s.plan.length;
          s.plan.push({ text: ti.subject || ti.activeForm || "Task", status: "pending" });
        }
        if (ev.tool_name === "TaskUpdate") {
          const tid = ti.taskId || ti.id || ti.task_id;
          const idx = s.taskIds[tid];
          if (idx !== undefined && s.plan[idx]) {
            if (ti.status === "deleted") s.plan[idx].status = "deleted";
            else if (ti.status) s.plan[idx].status = ti.status;
          }
        }
        break;
      }
      case "Notification":
        if (ev.notification_type === "permission_prompt") { s.state = "waiting"; s.now = short(ev.message, 90) || "Needs your OK"; }
        else if (ev.notification_type === "idle_prompt") { s.state = "yourturn"; s.now = "Waiting for your reply"; }
        else { this.log(s, short(ev.message, 90)); }
        break;
      case "Stop":
        s.state = "yourturn"; s.now = "Finished. Your turn";
        s.summary = short(plain(ev.last_assistant_message), 260);
        this.log(s, "Finished: " + short(ev.last_assistant_message, 80));
        break;
      case "SubagentStop":
        this.log(s, "Helper finished");
        break;
      case "SessionEnd":
        s.state = "ended"; s.now = "Session closed";
        setTimeout(() => { this.sessions.delete(s.id); this.onChange(); }, 10 * 60 * 1000);
        break;
      case "PermissionRequest":
        return this.approval(s, ev, res);
      default: break;
    }
    this.onChange();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  }

  approval(s, ev, res) {
    // If nobody can answer on the panel, don't make Claude Code wait: answer at once with no decision.
    if (!this.canAnswer() || this.approvals.size >= 20) {
      s.state = "waiting"; s.now = "Asking in its window";
      res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}");
      this.onChange(); return;
    }
    const id = this.nextApproval++;
    const input = ev.tool_input || {};
    const a = {
      id, sessionId: s.id, project: s.project, tool: ev.tool_name,
      what: askLine(ev.tool_name, input),
      detail: short(input.command || input.file_path || input.url || JSON.stringify(input), 220),
      started: Date.now(), until: Date.now() + APPROVAL_WAIT_MS, res
    };
    s.state = "waiting"; s.now = "Needs your OK: " + a.what;
    this.approvals.set(id, a);
    a.timer = setTimeout(() => this.resolve(id, null), APPROVAL_WAIT_MS);
    // answered in the terminal (Claude Code dropped the request): remove the card
    res.on("close", () => { if (this.approvals.has(id) && !res.writableEnded) { clearTimeout(a.timer); this.approvals.delete(id); s.now = "Answered in its window"; this.onChange(); } });
    this.onChange();
  }

  // decision: "allow" | "deny" | null (null = let Claude Code ask in the terminal)
  resolve(id, decision) {
    const a = this.approvals.get(id);
    if (!a) return false;
    clearTimeout(a.timer);
    this.approvals.delete(id);
    let body = {};
    if (decision === "allow") body = { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } };
    if (decision === "deny") body = { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "Denied from the side panel." } } };
    try { a.res.writeHead(200, { "Content-Type": "application/json" }); a.res.end(JSON.stringify(body)); } catch { }
    const s = this.sessions.get(a.sessionId);
    if (s) {
      s.state = decision === "deny" ? "yourturn" : "working";
      s.now = decision === "allow" ? "Allowed. " + a.what : decision === "deny" ? "Denied. " + a.what : "Asking in the terminal";
      this.log(s, s.now);
    }
    this.onChange();
    return true;
  }

  dismiss(id) { this.sessions.delete(id); this.onChange(); }

  snapshot() {
    const sessions = [...this.sessions.values()].map((s) => {
      const plan = s.plan.filter((p) => p.status !== "deleted");
      return {
        id: s.id, provider: s.provider, project: s.project, cwd: s.cwd, state: s.state, now: s.now, ask: s.ask || "", summary: s.summary,
        title: s.title || "", started: s.started, updated: s.updated,
        plan, done: plan.filter((p) => p.status === "completed").length, total: plan.length,
        files: Object.keys(s.files).length, feed: s.feed.slice(0, 6)
      };
    }).sort((a, b) => rank(a) - rank(b) || b.updated - a.updated);
    const approvals = [...this.approvals.values()].map((a) => ({ id: a.id, sessionId: a.sessionId, project: a.project, tool: a.tool, what: a.what, detail: a.detail, until: a.until }));
    return { listening: this.listening, portBusy: this.portBusy, port: PORT, sessions, approvals };
  }

  listen() {
    this.server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/health") { res.writeHead(200); res.end("ok"); return; }
      const m = req.url.match(/^\/hook\/(\w+)/);
      if (req.method !== "POST" || !m) { res.writeHead(404); res.end(); return; }
      // Only Claude Code (with the secret header) may post. Browsers always send Origin, so refuse those outright.
      if (req.headers.origin || !tokenOk(req.headers["x-side-panel-token"]) || !/application\/json/i.test(req.headers["content-type"] || "")) { res.writeHead(403); res.end(); return; }
      const chunks = []; let size = 0;
      req.setTimeout(10000, () => req.destroy());
      req.on("data", (c) => { size += c.length; if (size > 2e6) { req.destroy(); return; } chunks.push(c); });
      req.on("end", () => {
        let ev = {};
        try { ev = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { }
        if (!ev || typeof ev !== "object") ev = {};
        try { this.handle(m[1], ev, res); } catch (e) { try { res.writeHead(200); res.end("{}"); } catch { } }
      });
    });
    this.server.headersTimeout = 10000;
    this.server.requestTimeout = (APPROVAL_WAIT_MS + 15000);
    this.server.maxConnections = 64;
    this.server.on("error", (e) => {
      this.listening = false; this.portBusy = e && e.code === "EADDRINUSE"; this.onChange();
      clearTimeout(this.retry); this.retry = setTimeout(() => { try { this.server.close(); } catch { } this.listen(); }, 15000);
    });
    this.server.listen(PORT, "127.0.0.1", () => { this.listening = true; this.portBusy = false; this.onChange(); });
  }
}
function rank(s) { return { waiting: 0, working: 1, yourturn: 2, ended: 3 }[s.state] ?? 4; }

// The hooks block for Claude Code settings. http hooks for everything; nothing runs if the panel is closed.
function hooksBlock() {
  const h = (ev, timeout) => ({ hooks: [{ type: "http", url: `http://127.0.0.1:${PORT}/hook/${ev}`, headers: { "X-Side-Panel-Token": TOKEN }, timeout: timeout || 5 }] });
  return {
    UserPromptSubmit: [h("UserPromptSubmit")],
    PreToolUse: [Object.assign({ matcher: "*" }, h("PreToolUse"))],
    PostToolUse: [Object.assign({ matcher: "*" }, h("PostToolUse"))],
    Notification: [h("Notification")],
    Stop: [h("Stop")],
    SubagentStop: [h("SubagentStop")],
    SessionEnd: [h("SessionEnd")],
    PermissionRequest: [Object.assign({ matcher: "*" }, h("PermissionRequest", Math.ceil(APPROVAL_WAIT_MS / 1000) + 10))]
  };
}

// Adds the panel's hooks to a Claude Code settings file, after a timestamped backup. Existing hooks are kept.
function installHooks(settingsPath) {
  let cfg = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, "utf8");
    cfg = JSON.parse(raw.replace(/^﻿/, ""));
    const bak = settingsPath + ".sidepanel-backup-" + new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(bak, raw);
  } else {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  }
  cfg.hooks = cfg.hooks || {};
  const add = hooksBlock();
  for (const [ev, entries] of Object.entries(add)) {
    const list = cfg.hooks[ev] || [];
    const kept = list.filter((e) => !(e.hooks || []).some((x) => x.type === "http" && String(x.url || "").includes(":" + PORT + "/hook/")));
    cfg.hooks[ev] = kept.concat(entries);
  }
  fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2));
  return true;
}
// "connected" = hooks present AND carrying this install's token; "stale" = present but with an old token.
function hooksInstalled(settingsPath) {
  try {
    const t = fs.readFileSync(settingsPath, "utf8");
    if (!t.includes(":" + PORT + "/hook/")) return false;
    return t.includes(TOKEN) ? true : "stale";
  } catch { return false; }
}
// Removes the panel's hooks again (with a backup), leaving every other hook untouched.
function uninstallHooks(settingsPath) {
  if (!fs.existsSync(settingsPath)) return true;
  const raw = fs.readFileSync(settingsPath, "utf8");
  const cfg = JSON.parse(raw.replace(/^﻿/, ""));
  fs.writeFileSync(settingsPath + ".sidepanel-backup-" + new Date().toISOString().replace(/[:.]/g, "-"), raw);
  for (const ev of Object.keys(cfg.hooks || {})) {
    cfg.hooks[ev] = (cfg.hooks[ev] || []).filter((e) => !(e.hooks || []).some((x) => x.type === "http" && String(x.url || "").includes(":" + PORT + "/hook/")));
    if (!cfg.hooks[ev].length) delete cfg.hooks[ev];
  }
  fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2));
  return true;
}
function userSettingsPath() { return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "settings.json"); }

module.exports = { describe, ClaudeHub, installHooks, uninstallHooks, hooksInstalled, userSettingsPath, hooksBlock, setTokenFile, PORT };
