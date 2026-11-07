// The AI side of a voice call: one Claude Code process stays open for the whole call (no start-up wait per question),
// answers stream back word by word so Blink can start speaking the first sentence at once, and you can cut it off.
const { spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

class CallBrain {
  // o: { claudePath(), system(), onDelta(text), onDone(text), onError(msg) }
  constructor(o) { this.o = o; this.p = null; this.buf = ""; this.answer = ""; this.busy = false; this.reqN = 0; }
  alive() { return !!(this.p && this.p.exitCode === null); }
  // the instructions in a file (a long command line is cut at 8,191 characters when Claude Code is an npm .cmd)
  sysFile() { const f = path.join(os.tmpdir(), "side-panel-call-" + process.pid + ".txt"); fs.writeFileSync(f, this.o.system()); return f; }
  start() {
    if (this.alive()) return true;
    const exe = this.o.claudePath(); if (!exe) return false;
    const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
      "--model", (this.o.model && this.o.model()) || "sonnet", "--setting-sources", "", "--strict-mcp-config",
      // lean: Blink's own short instructions (not Claude Code's long coding prompt), only web search plus the panel's tools,
      // no skills, nothing saved to disk; measured about twice as fast to the first word
      "--tools", "WebSearch", "--disable-slash-commands",
      "--system-prompt-file", this.sysFile()];
    const mcp = this.o.mcpConfig && this.o.mcpConfig();
    if (mcp) args.push("--mcp-config", mcp, "--allowedTools", "mcp__panel__panel_command", "mcp__panel__open_link", "mcp__panel__app_look", "mcp__panel__app_do", "mcp__panel__press_keys", "mcp__panel__type_text", "mcp__panel__claude_task", "mcp__panel__remember", "WebSearch");
    else args.push("--allowedTools", "WebSearch");
    const q = (s) => (s === "" ? '""' : /[\s"&|<>^%]/.test(s) ? '"' + String(s).replace(/"/g, '""').replace(/%/g, " percent") + '"' : s);
    const env = Object.assign({}, process.env, { CLAUDE_CODE_ENTRYPOINT: "side-panel" });
    this.p = /\.(cmd|bat)$/i.test(exe)
      ? spawn("cmd.exe", ["/d", "/s", "/c", '"' + [exe].concat(args).map(q).join(" ") + '"'], { cwd: os.homedir(), windowsHide: true, windowsVerbatimArguments: true, env })
      : spawn(exe, args, { cwd: os.homedir(), windowsHide: true, env });
    this.p.stdout.setEncoding("utf8");
    this.p.stdout.on("data", (d) => { this.buf += d; let i; while ((i = this.buf.indexOf("\n")) >= 0) { const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (l) this.line(l); } });
    this.p.stderr.on("data", () => { });
    this.p.on("error", (e) => { this.busy = false; this.o.onError("couldn't start: " + e.message); });
    this.p.on("exit", () => { if (this.busy) { this.busy = false; this.o.onError("stopped"); } this.p = null; });
    return true;
  }
  line(l) {
    let m; try { m = JSON.parse(l); } catch { return; }
    if (m.type === "system" && m.subtype === "init" && m.session_id) this.sessionId = m.session_id;
    // the answer you cut off still finishes inside Claude Code; its words and its end are skipped
    if (this.skip > 0) { if (m.type === "result") this.skip--; return; }
    if (m.type === "stream_event" && m.event && m.event.type === "content_block_start" && m.event.content_block && /tool_use$/.test(m.event.content_block.type || "")) {
      if (this.busy && this.o.onTool) this.o.onTool(String(m.event.content_block.name || ""));
      return;
    }
    if (m.type === "stream_event" && m.event && m.event.type === "content_block_delta" && m.event.delta && m.event.delta.type === "text_delta") {
      if (!this.busy) return; this.answer += m.event.delta.text; this.o.onDelta(m.event.delta.text);
    } else if (m.type === "result") {
      if (!this.busy) return; this.busy = false;
      if (m.is_error) this.o.onError(String(m.result || "error").slice(0, 200)); else this.o.onDone(this.answer || String(m.result || ""));
    }
  }
  ask(text) {
    if (!this.start()) return false;
    this.answer = ""; this.busy = true;
    try { this.p.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: String(text).slice(0, 4000) }] } }) + "\n"); return true; }
    catch { this.busy = false; return false; }
  }
  // you started talking: stop the answer (the conversation so far is kept)
  interrupt() {
    if (!this.busy || !this.alive()) return;
    this.busy = false; this.skip = (this.skip || 0) + 1;
    try { this.p.stdin.write(JSON.stringify({ type: "control_request", request_id: "int-" + (++this.reqN), request: { subtype: "interrupt" } }) + "\n"); } catch { }
  }
  stop() { this.busy = false; if (this.p) { try { this.p.stdin.end(); } catch { } const p = this.p; setTimeout(() => { try { p.kill(); } catch { } }, 1500); this.p = null; } }
}
module.exports = { CallBrain };
