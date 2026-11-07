// Codex on the panel, through "codex app-server" (the same JSON-RPC interface Codex's VS Code extension uses):
// newline-delimited JSON over stdio. One server process serves every Codex chat and task; approvals arrive as
// requests from the server and are answered from the panel's approval cards.
const { spawn, execFile } = require("child_process");
const path = require("path");

const short = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const base = (p) => (p ? path.basename(String(p)) : "");
function itemLabel(it, done) {
  const cmd = Array.isArray(it.command) ? it.command.join(" ") : it.command;
  switch (it.type) {
    case "commandExecution": return (done ? "Ran " : "Running ") + short(cmd, 70);
    case "fileChange": { const ch = it.changes || []; return (done ? "Changed " : "Changing ") + (ch.length === 1 ? base(ch[0].path) : ch.length + " files"); }
    case "webSearch": return (done ? "Searched the web for " : "Searching the web for ") + short(it.query, 50);
    case "mcpToolCall": return (done ? "Used " : "Using ") + short(it.tool || it.server || "a tool", 40);
    default: return "";
  }
}

class CodexEngine {
  // runner: the Runner (threads, approvals, changed, onLimits); exe(): path to codex
  constructor(runner, exe) { this.r = runner; this.exe = exe; this.proc = null; this.next = 1; this.waiting = new Map(); this.byCodex = new Map(); this.buf = ""; this.ready = null; }
  ensure() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const exe = this.exe();
      if (!exe) return reject(new Error("Codex isn't installed on this PC"));
      const shim = /\.(cmd|bat)$/i.test(exe);
      const p = shim
        ? spawn("cmd.exe", ["/d", "/s", "/c", '"' + '"' + exe + '" app-server' + '"'], { windowsHide: true, windowsVerbatimArguments: true })
        : spawn(exe, ["app-server"], { windowsHide: true });
      this.proc = p;
      p.stdout.setEncoding("utf8");
      p.stdout.on("data", (d) => { this.buf += d; let i; while ((i = this.buf.indexOf("\n")) >= 0) { const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (l) { let m; try { m = JSON.parse(l); } catch { continue; } this.onMessage(m); } } });
      p.stderr.on("data", () => { });
      p.on("error", (e) => { this.fail(e.message); reject(e); });
      p.on("close", () => { this.fail("Codex stopped"); });
      this.call("initialize", { clientInfo: { name: "side_panel", title: "Side Panel", version: "1.5.0" } })
        .then(() => { this.notify("initialized", {}); resolve(); })
        .catch((e) => { reject(e); });
    });
    this.ready.catch(() => { this.ready = null; });
    return this.ready;
  }
  fail(why) {
    this.proc = null; this.ready = null;
    for (const [, w] of this.waiting) w.rej(new Error(why));
    this.waiting.clear();
    for (const t of this.r.threads.values()) if (t.engine === "codex" && t.state === "running") this.finish(t, "error", why);
  }
  write(o) { try { this.proc.stdin.write(JSON.stringify(o) + "\n"); } catch { } }
  call(method, params, ms) {
    const id = this.next++;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.waiting.delete(id); rej(new Error("Codex didn't answer")); }, ms || 30000);
      this.waiting.set(id, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      this.write({ method, id, params });
    });
  }
  notify(method, params) { this.write({ method, params }); }
  // conversations from the Codex app, terminal or VS Code, newest first
  async list() {
    await this.ensure();
    const r = await this.call("thread/list", { limit: 20 }, 15000);
    const rows = (r && (r.data || r.threads)) || [];
    const mine = new Set([...this.r.threads.values()].map((t) => t.sessionId));
    return rows.filter((x) => x && x.id && !mine.has(x.id)).slice(0, 20).map((x) => ({ id: String(x.id), title: String(x.preview || x.name || "Codex conversation").slice(0, 80), cwd: String(x.cwd || ""), updated: (Number(x.updatedAt || x.createdAt) || 0) * (Number(x.updatedAt || x.createdAt) > 1e12 ? 1 : 1000) }));
  }
  onMessage(m) {
    // a reply to one of our requests
    if (m.id !== undefined && !m.method) { const w = this.waiting.get(m.id); if (w) { this.waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message || "Codex error")) : w.res(m.result); } return; }
    const p = m.params || {};
    const t = this.byCodex.get(p.threadId || (p.thread && p.thread.id) || (p.turn && p.turn.threadId));
    // the server asks for permission
    if (m.id !== undefined && m.method) {
      if (/requestApproval$/.test(m.method) && t) return this.approval(t, m);
      return this.write({ id: m.id, result: { decision: "decline" } });
    }
    if (m.method === "account/rateLimits/updated" && p.rateLimits && this.r.o.onLimits) {
      const pr = p.rateLimits.primary || {};
      try { this.r.o.onLimits({ rateLimitType: "codex", unifiedWindows: { five_hour: { utilization: (pr.usedPercent || 0) / 100, resetsAt: pr.resetsAt } } }); } catch { }
      return;
    }
    if (!t) return;
    const reply = t.messages[t.messages.length - 1];
    if (!reply || reply.role !== "ai") return;
    t.updated = Date.now();
    switch (m.method) {
      case "turn/started": if (p.turn) t.turnId = p.turn.id; break;
      case "item/agentMessage/delta": {
        const d = typeof p.delta === "string" ? p.delta : (p.delta && p.delta.text) || p.text || "";
        let last = reply.parts[reply.parts.length - 1];
        if (!last || last.type !== "text" || last.done || last.itemId !== p.itemId) { last = { type: "text", text: "", itemId: p.itemId }; reply.parts.push(last); }
        last.text += d; t.now = "Writing"; this.r.throttle(); return;
      }
      case "item/started": {
        const it = p.item || {};
        const label = itemLabel(it, false);
        if (label) { reply.parts.push({ type: "step", id: it.id, label, state: "run" }); t.now = label; }
        break;
      }
      case "item/completed": {
        const it = p.item || {};
        if (it.type === "agentMessage") {
          const txt = it.text || (Array.isArray(it.content) ? it.content.map((c) => c.text || "").join("") : "");
          const part = reply.parts.find((x) => x.type === "text" && x.itemId === it.id);
          if (part) { if (txt) part.text = txt; part.done = true; } else if (txt) reply.parts.push({ type: "text", text: txt, itemId: it.id, done: true });
        } else {
          const s = reply.parts.find((x) => x.type === "step" && x.id === it.id);
          const bad = it.status === "failed" || it.status === "declined" || (typeof it.exitCode === "number" && it.exitCode !== 0);
          if (s) { s.state = bad ? "bad" : "ok"; s.label = itemLabel(it, true) || s.label; }
          if (it.type === "todoList" || it.type === "plan") t.plan = (it.items || it.steps || []).map((x) => ({ text: short(x.text || x.step || "", 80), status: x.completed || x.status === "completed" ? "completed" : x.status === "inProgress" ? "in_progress" : "pending" }));
        }
        break;
      }
      case "turn/completed": {
        const st = (p.turn && p.turn.status) || "completed";
        const err = p.turn && p.turn.error;
        this.finish(t, st === "completed" ? "done" : st === "interrupted" ? "stopped" : "error", err && err.message);
        return;
      }
      case "error": { const e = p.error || p; if (!e.willRetry) reply.parts.push({ type: "error", text: short(e.message || "Codex hit a problem", 300) }); break; }
    }
    this.r.changed();
  }
  approval(t, m) {
    const p = m.params || {};
    const cmd = Array.isArray(p.command) ? p.command.join(" ") : p.command;
    const isCmd = /commandExecution/.test(m.method);
    const id = "r" + this.r.nextApproval++;
    const what = isCmd ? "Run: " + short(cmd || "a command", 90) : /fileChange/.test(m.method) ? "Change files" + (p.grantRoot ? " in " + base(p.grantRoot) : "") : "Allow Codex more access";
    const ap = { id, threadId: t.id, project: t.title, tool: "codex", what, detail: (cmd || p.reason || p.grantRoot || "").slice(0, 1200), at: Date.now(), until: Date.now() + 10 * 60000 };
    ap.answer = (allow) => {
      if (!this.r.approvals.has(id)) return;
      this.r.approvals.delete(id); clearTimeout(ap.timer);
      this.write({ id: m.id, result: { decision: allow ? "accept" : "decline" } });
      this.r.step(t, { label: (allow ? "Allowed: " : "Said no: ") + what, state: allow ? "ok" : "bad" });
      this.r.refreshWaiting(t); this.r.changed();
    };
    ap.timer = setTimeout(() => ap.answer(false), 10 * 60000);
    this.r.approvals.set(id, ap); t.waiting = what; this.r.changed();
  }
  finish(t, state, err) {
    const reply = t.messages[t.messages.length - 1];
    for (const ap of [...this.r.approvals.values()]) if (ap.threadId === t.id) ap.answer(false);
    if (reply && reply.role === "ai") { if (err && state === "error") reply.parts.push({ type: "error", text: friendly(err) }); if (state === "stopped") reply.parts.push({ type: "note", text: "Stopped." }); for (const p of reply.parts) p.done = true; }
    t.state = state; t.proc = null; t.turnId = null; t.now = ""; t.waiting = ""; t.updated = Date.now();
    this.r.changed();
  }
  async send(t, text) {
    t.state = "running"; t.now = "Starting Codex"; t.proc = { codex: true }; this.r.changed();
    try {
      await this.ensure();
      if (!t.signedIn) {
        const acc = await this.call("account/read", { refreshToken: false }).catch(() => null);
        if (acc && acc.requiresOpenaiAuth && !acc.account) throw new Error("not logged in");
        t.signedIn = true;
      }
      // read-only chats can't change anything; tasks ask before commands; "edit freely" works inside the folder without asking
      const policy = t.mode === "read" ? { approvalPolicy: "never", sandbox: "read-only" } : t.mode === "edit" ? { approvalPolicy: "never", sandbox: "workspace-write" } : { approvalPolicy: "on-request", sandbox: "workspace-write" };
      if (!t.sessionId) {
        const r = await this.call("thread/start", Object.assign({ cwd: t.cwd, serviceName: "side_panel" }, policy));
        t.sessionId = r.thread.id;
      } else if (!this.byCodex.has(t.sessionId)) {
        await this.call("thread/resume", { threadId: t.sessionId, excludeTurns: true });
      }
      this.byCodex.set(t.sessionId, t);
      const r = await this.call("turn/start", { threadId: t.sessionId, input: [{ type: "text", text: String(text) }] }, 60000);
      if (r && r.turn) t.turnId = r.turn.id;
      t.now = "Thinking"; this.r.changed();
    } catch (e) { this.finish(t, "error", e.message); }
  }
  interrupt(t) {
    t.stopped = true;
    if (t.turnId) this.call("turn/interrupt", { threadId: t.sessionId, turnId: t.turnId }).catch(() => { });
    else this.finish(t, "stopped");
    return true;
  }
  close() { if (this.proc) { try { execFile("taskkill", ["/PID", String(this.proc.pid), "/T", "/F"], { windowsHide: true }, () => { }); } catch { } } }
}
function friendly(t) {
  t = String(t || "");
  if (/not logged in|auth|login|401|unauthori[sz]ed/i.test(t)) return "Codex needs you to sign in. Open a terminal, run codex once and sign in, then try again.";
  if (/rate limit|usage limit|429|quota/i.test(t)) return "You've hit your Codex usage limit for now. Try again later.";
  return short(t, 300) || "Codex stopped with an error.";
}
module.exports = { CodexEngine, itemLabel };
