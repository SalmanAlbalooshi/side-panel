// Talks to PanelHost.exe (media, volume, mic, foreground window, icons) over stdin/stdout JSON lines.
// Never crashes the app: spawn errors and broken pipes are caught, restarts back off, and after repeated
// failures it stops and reports "unavailable" so the UI can say so.
const { spawn, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

class Helper {
  constructor(exePath) {
    this.exePath = exePath;
    this.nextId = 1;
    this.pending = new Map();
    this.buf = "";
    this.proc = null;
    this.failures = 0;
    this.available = fs.existsSync(exePath);
    this.lastError = this.available ? "" : "Helper not found";
    if (this.available) this.start();
  }
  start() {
    if (this.stopping) return;
    let p;
    try { p = spawn(this.exePath, [], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] }); }
    catch (e) { return this.died(e.message); }
    this.proc = p;
    this.startedAt = Date.now();
    p.on("error", (e) => this.died(e.message));
    p.stdin.on("error", () => { });
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d) => {
      this.buf += d;
      if (this.buf.length > 32 * 1024 * 1024) this.buf = "";
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        const q = this.pending.get(msg.id);
        if (q) { this.pending.delete(msg.id); clearTimeout(q.t); msg.ok ? q.res(msg.data) : q.rej(new Error(msg.error || "helper error")); }
      }
    });
    p.on("exit", () => this.died("exited"));
  }
  died(why) {
    if (this.proc) { try { this.proc.removeAllListeners(); } catch { } }
    this.proc = null;
    for (const q of this.pending.values()) { clearTimeout(q.t); q.rej(new Error("helper " + why)); }
    this.pending.clear();
    if (this.stopping) return;
    // a run that lasted a minute or more counts as healthy
    if (this.startedAt && Date.now() - this.startedAt > 60000) this.failures = 0;
    this.failures++;
    this.lastError = why;
    if (this.failures >= 6) { this.available = false; return; }
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this.start(), Math.min(60000, 1000 * 2 ** this.failures));
  }
  call(cmd, arg, timeoutMs) {
    if (!this.proc) return Promise.reject(new Error("helper not running"));
    const id = this.nextId++;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error("helper timeout")); }, timeoutMs || 8000);
      this.pending.set(id, { res, rej, t });
      try { this.proc.stdin.write(JSON.stringify({ id, cmd, arg }) + "\n"); }
      catch (e) { clearTimeout(t); this.pending.delete(id); rej(e); }
    });
  }
  // Album art runs in its own short-lived process (reading it breaks media controls in a long-lived one).
  art(app, title) {
    return new Promise((res) => {
      if (!fs.existsSync(this.exePath)) { res(null); return; }
      execFile(this.exePath, ["--art"].concat(app ? [app] : [], app && title ? [String(title).slice(0, 300)] : []), { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
        const s = String(out || "").trim();
        res(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) ? s : null);
      });
    });
  }
  status() { return { available: this.available && (!!this.proc || this.failures < 6), running: !!this.proc, error: this.lastError }; }
  stop() { this.stopping = true; clearTimeout(this.restartTimer); if (this.proc) { try { this.proc.kill(); } catch { } } }
}

function helperPath() {
  if (process.env.SP_HELPER) return process.env.SP_HELPER; // tests: simulate a PC where the helper is missing
  const candidates = [
    path.join(process.resourcesPath || "", "helper", "PanelHost.exe"),
    path.join(__dirname, "..", "bin", "helper", "PanelHost.exe")
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[1];
}

module.exports = { Helper, helperPath };
