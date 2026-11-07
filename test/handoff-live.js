// Live check: a task handed over by Blink runs in the person's full Claude Code setup (their skills, agents, settings),
// through the app's own runner. No mic, speakers or panel window. Usage: node test/handoff-live.js
const { Runner } = require("../src/ai-runner");
const { execSync } = require("child_process");
const os = require("os"), path = require("path"), fs = require("fs");
const exe = execSync("where claude", { encoding: "utf8" }).split(/\r?\n/).find((l) => /\.(exe|cmd)$/i.test(l.trim())).trim();
const dir = path.join(os.tmpdir(), "sp-handoff-test"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const r = new Runner({ dataDir: dir, nodeExe: process.execPath, claudePath: () => exe, model: () => "sonnet", onChange: () => { }, onCommand: async () => ({ say: "ok" }), onTool: async () => ({ say: "ok" }) });
const t0 = Date.now();
setTimeout(() => {
  const t = r.start({ kind: "task", provider: "claude-code", mode: "ask", prompt: "Without using any tools, reply with one line: the word READY, then how many skills and how many agents you can see available to you right now (just the two numbers).", title: "handoff check", cwd: os.homedir(), extra: { full: true, system: "This task came from Blink." } });
  const args = r.args(t);
  console.log("loads your settings:", !args.includes("--setting-sources"), "| your MCP servers allowed:", !args.includes("--strict-mcp-config"), "| keeps Claude Code's own prompt:", args.includes("--append-system-prompt-file"));
  const iv = setInterval(() => {
    if (t.state === "running") return;
    clearInterval(iv);
    const last = [...t.messages].reverse().find((m) => m.role === "ai"); const text = last ? last.parts.filter((p) => p.type === "text").map((p) => p.text).join(" ") : "";
    console.log("state:", t.state, "| session:", t.sessionId ? "yes" : "no", "| took", Math.round((Date.now() - t0) / 1000) + " s");
    console.log("answer:", text.trim().slice(0, 300));
    r.stopAll(); process.exit(0);
  }, 500);
}, 800);
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 240000);
