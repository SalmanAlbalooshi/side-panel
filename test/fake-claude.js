// A stand-in for `claude -p --output-format stream-json`, run through fake-claude.cmd the way npm installs it.
// The prompt (stdin) picks the behaviour: AUTHFAIL, SLOW, TOOL, ARGS, CRASHNOW, HANGNOW, GARBAGE, HTMLNOW, or a plain echo.
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", run);
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const argv = process.argv.slice(2);
const resume = argv.includes("--resume") ? argv[argv.indexOf("--resume") + 1] : null;
const sid = resume || "fake-" + Date.now();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  out({ type: "system", subtype: "init", session_id: sid, model: "fake" });
  const say = async (text, slow) => {
    for (const w of text.split(/(?<= )/)) { out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: w } } }); if (slow) await wait(slow); }
    out({ type: "assistant", message: { content: [{ type: "text", text }] } });
  };
  if (/CRASHNOW/.test(input)) { process.stderr.write("Segmentation fault (core dumped)\n"); process.exit(139); }
  if (/HANGNOW/.test(input)) { await wait(600000); }
  if (/GARBAGE/.test(input)) { process.stdout.write("not json at all\n{broken json\n\u0000\u0001 binary\n"); out({ type: "weird_unknown_event", x: 1 }); }
  if (/HTMLNOW/.test(input)) { await say("<img src=x onerror=\"window.__pwned=1\"><script>window.__pwned=2</script> **bold** done"); out({ type: "result", is_error: false, result: "", session_id: sid }); return; }
  if (/AUTHFAIL/.test(input)) { out({ type: "result", is_error: true, result: "Invalid API key · Please run /login", session_id: sid }); process.exit(1); }
  if (/SLOW/.test(input)) { await say("Working on it slowly, one word at a time so you can stop me whenever you like and see that it stops.", 900); }
  else if (/TOOL/.test(input)) {
    out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "C:\\x\\notes.md" } }] } });
    out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1" }] } });
    await say("Read the notes. All good.");
  }
  else if (/ARGS/.test(input)) await say("ARGS " + JSON.stringify(argv));
  else await say((resume ? "Resumed. " : "") + "Echo: " + input.trim().slice(0, 200));
  out({ type: "result", is_error: false, result: "", session_id: sid, total_cost_usd: 0.001, duration_ms: 1200 });
}
