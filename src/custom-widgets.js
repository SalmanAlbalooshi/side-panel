// Widgets you (or Claude Code) add as folders: <data>/widgets/<name>/widget.json + scripts.
// Nothing runs until you approve it. The approval covers a fingerprint of EVERY file in the widget folder,
// so changing the command or any script afterwards needs a fresh OK.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec, execFile } = require("child_process");

const MAX_FILES = 50, MAX_BYTES = 2 * 1024 * 1024;

function fingerprint(dir) {
  const h = crypto.createHash("sha256");
  const files = [];
  (function walk(d, rel, depth) {
    if (depth > 3) return;
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, it.name), r = rel ? rel + "/" + it.name : it.name;
      if (it.isDirectory()) walk(p, r, depth + 1); else files.push([r, p]);
    }
  })(dir, "", 0);
  if (files.length > MAX_FILES) return null;
  let total = 0;
  for (const [r, p] of files) {
    let b; try { b = fs.readFileSync(p); } catch { return null; }
    total += b.length; if (total > MAX_BYTES) return null;
    h.update(r + "\0"); h.update(b); h.update("\0");
  }
  return h.digest("hex");
}

// A widget may print one line of JSON for a richer look. Only known fields, short strings, https links.
function parseRich(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
  if (!line) return null;
  let j; try { j = JSON.parse(line); } catch { return null; }
  if (!j || typeof j !== "object") return null;
  const S = (v, n) => (v == null ? "" : String(v).slice(0, n));
  const out = { big: S(j.big, 24), label: S(j.label, 60), lines: (Array.isArray(j.lines) ? j.lines : []).slice(0, 3).map((x) => S(x, 100)), tone: ["ok", "warn", "bad"].includes(j.tone) ? j.tone : "" };
  const bar = Number(j.bar); if (j.bar != null && Number.isFinite(bar)) out.bar = Math.max(0, Math.min(100, bar));
  if (Array.isArray(j.items)) out.items = j.items.slice(0, 6).filter((x) => x && typeof x === "object").map((x) => ({ label: S(x.label, 40), value: S(x.value, 30) }));
  if (j.link && typeof j.link === "object" && /^https:\/\//i.test(String(j.link.url || ""))) out.link = { label: S(j.link.label || "Open", 20), url: S(j.link.url, 1000) };
  return out;
}

class CustomWidgets {
  constructor(dir, getApprovals) {
    this.dir = dir;
    this.getApprovals = getApprovals;
    this.state = {};
    this.timers = {};
    this.running = {};
    fs.mkdirSync(dir, { recursive: true });
    this.writeReadme();
  }
  writeReadme() {
    const f = path.join(this.dir, "README.txt");
    if (fs.existsSync(f)) return;
    fs.writeFileSync(f, [
      "Side Panel widgets",
      "",
      "Each widget is a folder here with a widget.json file:",
      '  { "title": "Downloads", "command": "powershell -NoProfile -File count.ps1", "interval": 60 }',
      "",
      "The command runs inside the widget's folder and prints up to 4 short lines of text (the first is shown biggest),",
      'or one line of JSON: {"big": "42", "label": "files", "lines": ["..."], "bar": 0-100, "tone": "ok|warn|bad", "items": [{"label": "", "value": ""}], "link": {"label": "Open", "url": "https://..."}}',
      "interval is in seconds (at least 10).",
      "Nothing runs until you approve it on the panel, and changing any file in the folder needs a new OK."
    ].join("\r\n"));
  }
  read(name) {
    const folder = path.join(this.dir, name);
    const def = JSON.parse(fs.readFileSync(path.join(folder, "widget.json"), "utf8"));
    return { folder, title: String(def.title || name).slice(0, 40), command: String(def.command || "").slice(0, 1000), interval: Math.max(10, Math.min(86400, Number(def.interval) || 60)), hash: fingerprint(folder) };
  }
  scan() {
    let names = [];
    try { names = fs.readdirSync(this.dir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^[\w .-]{1,60}$/.test(d.name)).map((d) => d.name).slice(0, 40); } catch { }
    const approvals = this.getApprovals() || {};
    const seen = new Set();
    for (const name of names) {
      seen.add(name);
      const w = this.state[name] || (this.state[name] = { name, lines: [], error: "", updated: 0 });
      try {
        const d = this.read(name);
        const ok = approvals[name];
        Object.assign(w, d, { approved: !!(d.command && d.hash && ok && ok.hash === d.hash && ok.command === d.command), tooBig: !d.hash });
      } catch { Object.assign(w, { title: name, command: "", approved: false, error: "widget.json is missing or broken" }); }
    }
    for (const name of Object.keys(this.state)) if (!seen.has(name)) { this.unschedule(name); delete this.state[name]; }
    this.schedule();
    return this.state;
  }
  unschedule(name) { if (this.timers[name]) { clearInterval(this.timers[name].t); delete this.timers[name]; } }
  schedule() {
    for (const [name, w] of Object.entries(this.state)) {
      const key = w.command + "|" + w.interval + "|" + w.approved + "|" + w.hash;
      if (this.timers[name] && this.timers[name].key === key) continue;
      this.unschedule(name);
      if (!w.approved) continue;
      const run = () => this.run(name);
      run();
      this.timers[name] = { key, t: setInterval(run, w.interval * 1000) };
    }
  }
  run(name) {
    const w = this.state[name];
    if (!w || !w.approved || this.running[name]) return;
    // re-check the fingerprint right before running, so an edit after approval can't sneak in
    let now; try { now = fingerprint(w.folder); } catch { now = null; }
    if (now !== w.hash) { w.approved = false; w.error = ""; this.unschedule(name); return; }
    this.running[name] = true;
    const child = exec(w.command, { cwd: w.folder, timeout: 0, windowsHide: true, maxBuffer: 256 * 1024 }, (err, stdout, stderr) => {
      clearTimeout(killer);
      this.running[name] = false;
      const cur = this.state[name]; if (!cur) return;
      const text = String(stdout || "").trim();
      const lines = text.split(/\r?\n/).map((s) => s.trim().slice(0, 120)).filter(Boolean).slice(0, 4);
      Object.assign(cur, { lines, data: parseRich(text), error: err && !lines.length ? String(stderr || err.message).trim().slice(0, 160) : "", updated: Date.now() });
    });
    // kill the whole process tree if it hangs (exec's own timeout only kills cmd.exe)
    const killer = setTimeout(() => { if (child.pid) execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => { }); }, 20000);
  }
  stopAll() { for (const n of Object.keys(this.timers)) this.unschedule(n); }
}
module.exports = { CustomWidgets, fingerprint, parseRich };
