// Live check of the call brain against the real Claude Code on this PC (no mic, no speakers, no panel tools):
// it starts, answers with a short spoken part and a [screen] part, can search the web, and how fast the first words come.
// Usage: node test/brain-live.js [model]
const { CallBrain } = require("../src/call-brain");
const { execSync } = require("child_process");
const exe = execSync("where claude", { encoding: "utf8" }).split(/\r?\n/).find((l) => /\.(exe|cmd)$/i.test(l.trim())).trim();
const model = process.argv[2] || "sonnet";
const sys = "You are Blink, a friendly assistant on a live voice call. Get it right first: for facts that may have changed, use WebSearch. Reply in two parts: first one to three short spoken sentences, no markdown; then, only if there are details, a line with exactly [screen] followed by markdown details.";
let t0 = 0, first = 0, text = "";
const qs = ["Hi, quick one: what's two plus two?", "List the playable characters in the 2025 game Marvel's Wolverine... actually just tell me its release date and developer."];
let i = 0;
const b = new CallBrain({ claudePath: () => exe, model: () => model, system: () => sys,
  onTool: (n) => console.log("  [tool started: " + n + " at " + (Date.now() - t0) + " ms]"),
  onDelta: (d) => { if (!first) first = Date.now() - t0; text += d; },
  onDone: () => { console.log(`Q${i + 1} first words after ${first} ms, done after ${Date.now() - t0} ms\n${text.trim()}\n`); next(); },
  onError: (m) => { console.log("ERROR", m); process.exit(1); } });
function next() {
  if (i >= qs.length - 1 && text) { b.stop(); setTimeout(() => process.exit(0), 300); return; }
  if (text) i++;
  text = ""; first = 0; t0 = Date.now(); b.ask(qs[i]);
}
b.start(); setTimeout(next, 1500);
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 120000);
