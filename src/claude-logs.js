// Reads Claude Code's own session logs (~/.claude/projects/<project>/<session>.jsonl) so sessions show up
// with no setup at all, including desktop-app sessions. Hooks, when connected, add live approvals on top.
// The log format is internal to Claude Code and may change; every read here is best effort.
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const ROOT = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "projects");
const RECENT_MS = 3 * 3600 * 1000;

function plain(s) { return String(s || "").replace(/```[\s\S]*?```/g, " ").replace(/\*\*|__|`|^#+\s*|^\s*[-*]\s+/gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); }
function short(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function base(p) { return p ? path.basename(String(p)) : ""; }

function listFiles(maxAgeMs) {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return out; }
  const now = Date.now();
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(path.join(ROOT, d.name)).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const p = path.join(ROOT, d.name, f);
      try { const st = fs.statSync(p); if (now - st.mtimeMs <= maxAgeMs) out.push({ p, mtime: st.mtimeMs, size: st.size }); } catch { }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function tailLines(file, bytes) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString("utf8").split("\n");
    if (start > 0) lines.shift();
    return lines.filter(Boolean);
  } finally { fs.closeSync(fd); }
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((c) => c && c.type === "text").map((c) => c.text).join(" ");
  return "";
}

const { describe } = (() => { try { return require("./claude-hooks"); } catch { return {}; } })();

// Parsing a log is the expensive part, so it's cached until the file changes; the state is re-judged every time
// because "quiet" and "stopped" depend on how long ago the file last changed.
const parsed = new Map();
function readSession(file) {
  const hit = parsed.get(file.p);
  let base0;
  if (hit && hit.mtime === file.mtime && hit.size === file.size) base0 = hit.data;
  else { base0 = parseSession(file); parsed.set(file.p, { mtime: file.mtime, size: file.size, data: base0 }); if (parsed.size > 60) parsed.delete(parsed.keys().next().value); }
  return judge(Object.assign({}, base0, { plan: base0.plan.slice(), _m: base0._m }), file);
}
function parseSession(file) {
  const lines = tailLines(file.p, 400 * 1024);
  const s = { id: path.basename(file.p, ".jsonl"), source: "log", provider: "Claude Code", cwd: "", project: "", entry: "", state: "working", now: "", summary: "", ask: "", title: "", plan: [], updated: file.mtime, started: 0, files: new Set() };
  let lastKind = null, lastTool = null, lastToolInput = null, pendingTool = false;
  for (const raw of lines) {
    let e; try { e = JSON.parse(raw); } catch { continue; }
    if (e.cwd) s.cwd = e.cwd;
    if (e.entrypoint) s.entry = e.entrypoint;
    if (e.type === "summary" && e.summary) s.title = e.summary;
    const ts = e.timestamp ? Date.parse(e.timestamp) : 0;
    if (ts && !s.started) s.started = ts;
    const m = e.message;
    if (!m) continue;
    if (e.type === "user" && m.role === "user") {
      if (Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result")) { pendingTool = false; lastKind = "tool_result"; continue; }
      const t = textOf(m.content);
      if (t && !/^\s*(<|\[SYSTEM|Caveat:)/.test(t) && !e.isMeta) { s.ask = short(t, 140); lastKind = "user"; s.summary = ""; }
    }
    if (e.type === "assistant" && m.role === "assistant") {
      const uses = (m.content || []).filter((c) => c.type === "tool_use");
      const txt = textOf(m.content);
      if (uses.length) {
        const u = uses[uses.length - 1];
        lastTool = u.name; lastToolInput = u.input; pendingTool = true; lastKind = "tool_use";
        if (u.name === "TodoWrite" && u.input && Array.isArray(u.input.todos)) s.plan = u.input.todos.map((t) => ({ text: t.content || t.activeForm || "", status: t.status || "pending" }));
        if (["Edit", "Write", "MultiEdit"].includes(u.name) && u.input && u.input.file_path) s.files.add(base(u.input.file_path));
      }
      if (txt && m.stop_reason === "end_turn") { s.summary = short(plain(txt), 260); lastKind = "end"; pendingTool = false; }
      else if (txt && !uses.length) { lastKind = "text"; }
    }
  }
  s.project = base(s.cwd) || "session";
  s.files = s.files.size;
  s._m = { lastKind, lastTool, lastToolInput, pendingTool };
  return s;
}
function judge(s, file) {
  const { lastKind, lastTool, lastToolInput, pendingTool } = s._m;
  delete s._m;
  const idle = Date.now() - file.mtime;
  // Logs can't tell "waiting for your OK" from "a long command is running" or "closed mid-step".
  // So only a real question to you counts as waiting; everything else is reported as what we actually know.
  const mins = Math.round(idle / 60000);
  const asking = pendingTool && /^(AskUserQuestion|ExitPlanMode)$/.test(lastTool || "");
  if (lastKind === "end") {
    if (idle > 30 * 60000) { s.state = "done"; s.now = "Done"; } else { s.state = "yourturn"; s.now = "Finished. Your turn"; }
  } else if (asking && idle < 6 * 3600000) {
    s.state = "waiting"; s.now = lastTool === "ExitPlanMode" ? "Has a plan ready for you to approve" : "Asked you a question";
  } else if (idle < 2 * 60000) {
    s.state = "working"; s.now = lastTool && pendingTool ? (describe ? describe(lastTool, lastToolInput) : lastTool) : "Thinking";
  } else if (idle < 30 * 60000) {
    s.state = "quiet"; s.now = "Quiet for " + mins + " min" + (pendingTool && lastTool ? ". Last step: " + (describe ? describe(lastTool, lastToolInput) : lastTool) : "");
  } else {
    s.state = "idle"; s.now = "Stopped " + (mins >= 120 ? Math.round(mins / 60) + " h" : mins + " min") + " ago";
  }
  return s;
}

function recentSessions(excludeIds) {
  const out = [];
  for (const f of listFiles(RECENT_MS).slice(0, 12)) {
    const id = path.basename(f.p, ".jsonl");
    if (excludeIds && excludeIds.has(id)) continue;
    // chats the panel ran come back (after a restart) labelled as panel chats; live ones are excluded above
    try { const s = readSession(f); if (s.entry === "side-panel") { s.provider = "Side Panel chat"; s.panel = true; if (!s.summary && !s.ask) continue; } if (s.ask || s.summary || s.now) out.push(s); } catch { }
  }
  return out;
}

// Today's AI activity across every Claude Code session on this PC.
async function today() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  const files = listFiles(Date.now() - t0 + 60000);
  const projects = {};
  let msgs = 0, outTok = 0, inTok = 0, prompts = 0;
  const stamps = [];
  for (const f of files) {
    const key = f.mtime + "|" + f.size + "|" + t0;
    const c = dayCache.get(f.p);
    let r;
    if (c && c.key === key) r = c.r;
    else { try { r = await countFile(f, t0); } catch { r = { msgs: 0, outTok: 0, inTok: 0, prompts: 0, stamps: [], cwd: "" }; } dayCache.set(f.p, { key, r }); }
    msgs += r.msgs; outTok += r.outTok; inTok += r.inTok; prompts += r.prompts; for (const t of r.stamps) stamps.push(t);
    const name = base(r.cwd) || path.basename(path.dirname(f.p)).split("-").filter(Boolean).pop() || "session";
    projects[name] = (projects[name] || 0) + 1;
  }
  for (const k of [...dayCache.keys()]) if (!files.some((f) => f.p === k)) dayCache.delete(k);
  stamps.sort((a, b) => a - b);
  let active = 0;
  for (let i = 1; i < stamps.length; i++) { const g = stamps[i] - stamps[i - 1]; if (g < 5 * 60000) active += g; }
  const top = Object.entries(projects).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => ({ name: n, sessions: c }));
  return { sessions: files.length, prompts, replies: msgs, activeMin: Math.round(active / 60000), outTokens: outTok, inTokens: inTok, top, at: Date.now() };
}
// Files that haven't changed since the last count are not read again.
const dayCache = new Map();
async function countFile(f, t0) {
  let msgs = 0, outTok = 0, inTok = 0, prompts = 0;
  const stamps = [];
  const proj = {};
  const input = fs.createReadStream(f.p, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line.includes('"timestamp"')) continue;
      const tm = line.match(/"timestamp":"([^"]+)"/);
      const ts = tm ? Date.parse(tm[1]) : 0;
      if (!ts || ts < t0) continue;
      if (line.includes('"type":"assistant"')) {
        msgs++;
        const o = line.match(/"output_tokens":(\d+)/); if (o) outTok += Number(o[1]);
        const i1 = line.match(/"input_tokens":(\d+)/); if (i1) inTok += Number(i1[1]);
        const i2 = line.match(/"cache_read_input_tokens":(\d+)/); if (i2) inTok += Number(i2[1]);
        const i3 = line.match(/"cache_creation_input_tokens":(\d+)/); if (i3) inTok += Number(i3[1]);
        stamps.push(ts);
      } else if (line.includes('"type":"user"') && !line.includes('"tool_result"')) { prompts++; stamps.push(ts); }
      if (!proj.cwd) { const c = line.match(/"cwd":"((?:[^"\\]|\\.)*)"/); if (c) { try { proj.cwd = JSON.parse('"' + c[1] + '"'); } catch { } } }
    }
  } finally { rl.close(); input.destroy(); }
  return { msgs, outTok, inTok, prompts, stamps, cwd: proj.cwd || "" };
}


// The recent conversation of one session, for the panel's session view: what you asked, what it said, what it did.
function transcript(id) {
  if (!/^[\w-]{8,80}$/.test(String(id))) return null;
  let file = null;
  try { for (const d of fs.readdirSync(ROOT)) { const p = path.join(ROOT, d, id + ".jsonl"); if (fs.existsSync(p)) { file = p; break; } } } catch { }
  if (!file) return null;
  const out = [];
  let cwd = "";
  for (const raw of tailLines(file, 600 * 1024)) {
    let e; try { e = JSON.parse(raw); } catch { continue; }
    if (e.cwd) cwd = e.cwd;
    const m = e.message; if (!m || e.isMeta) continue;
    if (e.type === "user" && m.role === "user") {
      if (Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result")) continue;
      const t = textOf(m.content);
      if (t && !/^\s*(<|\[SYSTEM|Caveat:)/.test(t)) out.push({ role: "you", text: t.slice(0, 4000) });
    } else if (e.type === "assistant" && m.role === "assistant") {
      for (const c of m.content || []) {
        if (c.type === "text" && c.text.trim()) out.push({ role: "ai", parts: [{ type: "text", text: c.text.slice(0, 8000) }] });
        else if (c.type === "tool_use") out.push({ role: "ai", parts: [{ type: "step", label: describe ? describe(c.name, c.input) : c.name, state: "ok" }] });
      }
    }
  }
  // merge neighbouring AI pieces into one reply
  const merged = [];
  for (const x of out) { const last = merged[merged.length - 1]; if (x.role === "ai" && last && last.role === "ai") last.parts.push(...x.parts); else merged.push(x); }
  return { id, cwd, project: base(cwd), messages: merged.slice(-30) };
}

function busy(id) {
  if (!/^[\w-]{8,80}$/.test(String(id))) return false;
  try { for (const d of fs.readdirSync(ROOT)) { const p = path.join(ROOT, d, id + ".jsonl"); if (fs.existsSync(p)) return Date.now() - fs.statSync(p).mtimeMs < 12000; } } catch { }
  return false;
}
module.exports = { recentSessions, today, transcript, busy, ROOT };
