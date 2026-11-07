// One shape for every AI tool: what it can do, how to ask it, how to start a task with it.
const { execFile, spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

function providers(disc) {
  const ai = (disc && disc.ai) || {};
  const list = [];
  if (ai.claudeCode) list.push({ id: "claude-code", name: "Claude Code", kind: "cli", caps: { status: true, approvals: true, ask: true, task: true }, level: "Full", path: ai.claudeCode.path });
  if (ai.codex) list.push({ id: "codex", name: "Codex", kind: "cli", caps: { status: false, approvals: true, ask: true, task: true }, level: "Full", path: ai.codex.path });
  if (ai.geminiCli) list.push({ id: "gemini-cli", name: "Gemini CLI", kind: "cli", caps: { status: false, approvals: false, ask: true, task: true }, level: "Basic", path: ai.geminiCli.path });
  list.push({ id: "claude-web", name: "Claude (web)", kind: "web", caps: { ask: true, task: false }, level: "Basic" });
  list.push({ id: "chatgpt-web", name: "ChatGPT (web)", kind: "web", caps: { ask: true, task: false }, level: "Basic" });
  list.push({ id: "gemini-web", name: "Gemini (web)", kind: "web", caps: { ask: true, task: false }, level: "Basic" });
  list.push({ id: "copilot-web", name: "Copilot (web)", kind: "web", caps: { ask: true, task: false }, level: "Basic" });
  return list;
}

function webUrl(id, q) {
  const e = encodeURIComponent(q || "");
  if (id === "claude-web") return "https://claude.ai/new?q=" + e;
  if (id === "chatgpt-web") return "https://chatgpt.com/?q=" + e;
  if (id === "copilot-web") return "https://m365.cloud.microsoft/chat";
  return "https://gemini.google.com/app";
}

// Quick question: answered in the background, read-only. Returns { text, seconds }.
// A prompt that starts with "-" would be read as a command-line option; a leading space keeps it plain text.
const noFlag = (q) => (/^\s*-/.test(String(q)) ? " " + String(q).trimStart() : String(q));
function ask(p, question, cwd) {
  question = noFlag(question);
  return new Promise((resolve) => {
    const t0 = Date.now();
    let cmd, args;
    if (p.id === "claude-code") { cmd = p.path; args = ["-p", question, "--permission-mode", "plan", "--output-format", "json", "--no-session-persistence"]; }
    else if (p.id === "codex") { cmd = p.path; args = ["exec", "--sandbox", "read-only", "--", question]; }
    else if (p.id === "gemini-cli") { cmd = p.path; args = ["-p", question]; }
    else { resolve({ error: "This AI answers in the browser." }); return; }
    // .cmd/.bat shims need cmd.exe; quote every argument for cmd so typed text can never become a command.
    const isShim = /\.(cmd|bat)$/i.test(cmd);
    const file = isShim ? "cmd.exe" : cmd;
    const argv = isShim ? ["/d", "/s", "/c", "\"" + [cmd].concat(args).map(cmdQuote).join(" ") + "\""] : args;
    execFile(file, argv, { cwd: cwd || os.homedir(), windowsHide: true, timeout: 180000, maxBuffer: 16 * 1024 * 1024, windowsVerbatimArguments: isShim }, (err, stdout, stderr) => {
      const secs = Math.round((Date.now() - t0) / 1000);
      if (err && !stdout) { resolve({ error: String(stderr || err.message).slice(0, 400), seconds: secs }); return; }
      let text = String(stdout || "").trim();
      if (p.id === "claude-code") { try { const j = JSON.parse(text); if (j.is_error) { resolve({ error: friendly(j.result || ""), seconds: secs }); return; } text = j.result || text; } catch { } }
      if (/authenticate|oauth|log ?in|sign ?in|401/i.test(text) && text.length < 300) { resolve({ error: friendly(text), seconds: secs }); return; }
      resolve({ text, seconds: secs });
    });
  });
}

// Quote one argument for cmd.exe. Inside double quotes & | < > ( ) ^ are plain text; a doubled quote stays inside the quotes.
// % can't be escaped on a cmd command line, so it becomes the full-width percent sign (an AI reads it the same).
function cmdQuote(a) {
  const s = String(a).replace(/[\r\n]+/g, " ").replace(/%/g, "％");
  return "\"" + s.replace(/"/g, "\"\"") + "\"";
}

function friendly(t) {
  if (/oauth|authenticate|log ?in|401/i.test(t)) return "This AI tool needs you to sign in again. Open a terminal, run it once (for Claude Code: claude), sign in, then try again.";
  return String(t).slice(0, 300);
}

// New task: opens a terminal on the main screen running the tool with your words already sent.
// Your words never pass through a command line: they go into a temp file that a small PowerShell script
// (sent base64-encoded) reads and hands to the tool as one argument.
function newTask(p, prompt, dir, wt) {
  dir = dir && fs.existsSync(dir) ? dir : os.homedir();
  if (!["claude-code", "codex", "gemini-cli"].includes(p.id) || !p.path) return false;
  let text = String(prompt || "").slice(0, 20000);
  const shim = /\.(cmd|bat)$/i.test(p.path);
  // .cmd tools are run through cmd.exe, where a double quote or % could break out of the argument.
  // PowerShell only quotes an argument that has a space in it, so a shim prompt always gets one.
  if (shim) { text = text.replace(/"/g, "”").replace(/%/g, "％").replace(/[\r\n]+/g, " "); if (!/\s/.test(text)) text += " "; }
  text = noFlag(text);
  const tmp = path.join(os.tmpdir(), "side-panel-task-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".txt");
  fs.writeFileSync(tmp, text, "utf8");
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const flag = p.id === "gemini-cli" ? "'-i', " : "";
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Set-Location -LiteralPath " + q(dir),
    "$p = Get-Content -Raw -Encoding UTF8 -LiteralPath " + q(tmp),
    "Remove-Item -LiteralPath " + q(tmp) + " -ErrorAction SilentlyContinue",
    "$a = @(" + flag + "$p)",
    "if ($p.Trim().Length -eq 0) { $a = @() }",
    "& " + q(p.path) + " @a"
  ].join("; ");
  const enc = Buffer.from(script, "utf16le").toString("base64");
  const ps = ["powershell.exe", "-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc];
  const child = wt
    ? spawn(wt, ["-w", "0", "nt", "-d", dir].concat(ps), { detached: true, stdio: "ignore", windowsHide: false })
    : spawn(ps[0], ps.slice(1), { detached: true, stdio: "ignore", windowsHide: false });
  child.on("error", () => { });
  child.unref();
  return true;
}

// Voice: transcribe a recorded file with a local whisper CLI, if the PC has one.
function transcribe(whisperPath, file) {
  return new Promise((resolve) => {
    const isShim = /\.(cmd|bat)$/i.test(whisperPath);
    const exe = isShim ? "cmd.exe" : whisperPath;
    const argv = isShim ? ["/d", "/s", "/c", "\"" + [whisperPath, file].map(cmdQuote).join(" ") + "\""] : [file]; // smart mode: detects Arabic or English by itself
    execFile(exe, argv, { windowsHide: true, timeout: 120000, windowsVerbatimArguments: isShim }, () => {
      const txt = file.replace(/\.[^.]+$/, ".txt");
      try { resolve(fs.readFileSync(txt, "utf8").trim()); } catch { resolve(""); }
    });
  });
}


// Opens a terminal on the main screen that carries on a panel chat, with the whole conversation.
function resumeInTerminal(p, sessionId, dir, wt) {
  if (!p || !p.path || !/^[\w-]{8,80}$/.test(String(sessionId))) return false;
  dir = dir && fs.existsSync(dir) ? dir : os.homedir();
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const script = ["Set-Location -LiteralPath " + q(dir), p.id === "codex" ? "& " + q(p.path) + " resume " + q(sessionId) : "& " + q(p.path) + " --resume " + q(sessionId) + " --remote-control"].join("; ");
  const enc = Buffer.from(script, "utf16le").toString("base64");
  const ps = ["powershell.exe", "-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc];
  const child = wt ? spawn(wt, ["-w", "0", "nt", "-d", dir].concat(ps), { detached: true, stdio: "ignore" }) : spawn(ps[0], ps.slice(1), { detached: true, stdio: "ignore" });
  child.on("error", () => { }); child.unref();
  return true;
}

// Moves a Claude Code conversation into the Claude desktop app (claude --desktop --resume, Claude Code 2.1.285+).
// --desktop refuses to run without a console of its own, so it starts in a small minimised one that closes itself.
function resumeInDesktop(p, sessionId, dir) {
  return new Promise((resolve) => {
    if (!p || !p.path || !/^[\w-]{8,80}$/.test(String(sessionId))) return resolve({ ok: false, why: "no conversation id" });
    dir = dir && fs.existsSync(dir) ? dir : os.homedir();
    const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
    // started directly in a console of its own (tested: a quoted path through cmd fails, the exe itself works)
    const start = /\.(cmd|bat)$/i.test(p.path)
      ? "Start-Process -FilePath cmd.exe -ArgumentList '/c'," + q(p.path.replace(/^.*[\\/]/, "").replace(/\.(cmd|bat)$/i, "") + " --desktop --resume " + sessionId)
      : "Start-Process -FilePath " + q(p.path) + " -ArgumentList '--desktop','--resume'," + q(sessionId);
    const script = "$p = " + start + " -WorkingDirectory " + q(dir) + " -WindowStyle Minimized -PassThru; if ($p.WaitForExit(20000)) { exit $p.ExitCode } else { exit 0 }";
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, timeout: 30000 }, (err) => {
      if (!err) return resolve({ ok: true });
      resolve({ ok: false, why: err.code ? "it closed with code " + err.code : "it didn't start" });
    });
  });
}
module.exports = { providers, ask, newTask, resumeInTerminal, resumeInDesktop, webUrl, transcribe };
