// A stand-in for "codex app-server" (newline-delimited JSON-RPC over stdio, as Codex documents it).
// The prompt picks the behaviour: RUN (asks to run a command), FAIL, SLOW, LOGGEDOUT, or a plain echo.
let buf = "";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const pending = new Map();
let nextReq = 1000, threads = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const loggedOut = process.argv.includes("--logged-out");
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) handle(JSON.parse(l)); } });
function ask(method, params) { const id = nextReq++; return new Promise((res) => { pending.set(id, res); out({ id, method, params }); }); }
const active = new Map();
async function handle(m) {
  if (m.id !== undefined && !m.method) { const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m.result); } return; }
  const p = m.params || {};
  switch (m.method) {
    case "initialize": return out({ id: m.id, result: { userAgent: "fake-codex/1.0" } });
    case "initialized": return;
    case "account/read": return out({ id: m.id, result: loggedOut ? { account: null, requiresOpenaiAuth: true } : { account: { type: "chatgpt", email: "me@example.com" }, requiresOpenaiAuth: true } });
    case "thread/start": { const id = "thr_" + (++threads); out({ id: m.id, result: { thread: { id, preview: "" } } }); return out({ method: "thread/started", params: { thread: { id } } }); }
    case "thread/list": return out({ id: m.id, result: { data: [{ id: "thr_elsewhere1", preview: "Fix the login page tests", cwd: "C:\\Users\\me\\web", createdAt: Math.floor(Date.now() / 1000) - 3600 }], nextCursor: null } });
    case "thread/resume": return out({ id: m.id, result: { thread: { id: p.threadId } } });
    case "turn/interrupt": { const a = active.get(p.threadId); if (a) a.stop = true; return out({ id: m.id, result: {} }); }
    case "turn/start": {
      const tid = p.threadId, turn = { id: "turn_" + Date.now() }, text = (p.input || []).map((x) => x.text).join(" ");
      out({ id: m.id, result: { turn: Object.assign({ status: "inProgress", items: [] }, turn) } });
      out({ method: "turn/started", params: { threadId: tid, turn } });
      const a = { stop: false }; active.set(tid, a);
      const say = async (s, slow) => { const iid = "msg_" + Date.now(); out({ method: "item/started", params: { threadId: tid, turnId: turn.id, item: { id: iid, type: "agentMessage" } } }); for (const w of s.split(/(?<= )/)) { if (a.stop) return; out({ method: "item/agentMessage/delta", params: { threadId: tid, turnId: turn.id, itemId: iid, delta: w } }); if (slow) await wait(slow); } out({ method: "item/completed", params: { threadId: tid, turnId: turn.id, item: { id: iid, type: "agentMessage", text: s } } }); };
      out({ method: "account/rateLimits/updated", params: { rateLimits: { limitId: "codex", primary: { usedPercent: 31, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 3600 } } } });
      if (/RUN/.test(text)) {
        const cid = "cmd_1";
        out({ method: "item/started", params: { threadId: tid, turnId: turn.id, item: { id: cid, type: "commandExecution", command: "npm test", cwd: "C:\\proj", status: "inProgress" } } });
        const r = await ask("item/commandExecution/requestApproval", { threadId: tid, turnId: turn.id, itemId: cid, command: "npm test", cwd: "C:\\proj", reason: "run the tests" });
        const ok = r && r.decision === "accept";
        out({ method: "item/completed", params: { threadId: tid, turnId: turn.id, item: { id: cid, type: "commandExecution", command: "npm test", status: ok ? "completed" : "declined", exitCode: ok ? 0 : null } } });
        await say(ok ? "Tests pass. 12 of 12." : "Okay, I won't run them.");
      } else if (/FAIL/.test(text)) {
        return out({ method: "turn/completed", params: { threadId: tid, turn: Object.assign({ status: "failed", error: { message: "Model overloaded, try again" } }, turn) } });
      } else if (/SLOW/.test(text)) await say("Thinking about it slowly, one word at a time, so you can stop me whenever you want.", 700);
      else await say("Codex echo: " + text);
      active.delete(tid);
      out({ method: "turn/completed", params: { threadId: tid, turn: Object.assign({ status: a.stop ? "interrupted" : "completed" }, turn) } });
    }
  }
}
