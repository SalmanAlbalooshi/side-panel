// Live check: a call's conversation is a real Claude Code session you can carry on later (no mic, no speakers).
const { CallBrain } = require("../src/call-brain");
const { execSync, execFileSync } = require("child_process");
const exe = execSync("where claude", { encoding: "utf8" }).split(/\r?\n/).find((l) => /\.(exe|cmd)$/i.test(l.trim())).trim();
let text = "";
const b = new CallBrain({ claudePath: () => exe, model: () => "haiku", system: () => "You are Blink. Answer in one short sentence.",
  onDelta: (d) => { text += d; },
  onDone: () => {
    const sid = b.sessionId; b.stop();
    console.log("call answered:", text.trim(), "| session:", sid ? "yes" : "NO");
    if (!sid) process.exit(1);
    setTimeout(() => {
      const out = execFileSync(exe, ["-p", "--resume", sid, "--model", "haiku", "--setting-sources", "", "What word did I ask you to remember? Answer with just the word."], { encoding: "utf8", cwd: require("os").homedir(), timeout: 90000 });
      console.log("later, carried on:", out.trim(), /KIWI/i.test(out) ? "PASS" : "FAIL");
      process.exit(0);
    }, 1500);
  },
  onError: (m) => { console.log("ERROR", m); process.exit(1); } });
b.start(); setTimeout(() => b.ask("Remember this word for later: KIWI. Just say okay."), 1200);
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 150000);
