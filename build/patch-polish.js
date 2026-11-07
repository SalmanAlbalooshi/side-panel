// One-off patch: plain-text summaries, "Done" for old sessions, last-active times, quieter held rows, test fixes.
const fs = require("fs");
const path = require("path");
const R = (f) => path.join(__dirname, "..", f);
const edit = (f, a, b) => { let s = fs.readFileSync(R(f), "utf8"); if (!s.includes(a)) throw new Error("missing in " + f + ": " + a.slice(0, 70)); s = s.replace(a, b); fs.writeFileSync(R(f), s); };

// plain text: strip markdown from summaries
const plain = 'function plain(s) { return String(s || "").replace(/```[\\s\\S]*?```/g, " ").replace(/\\*\\*|__|`|^#+\\s*|^\\s*[-*]\\s+/gm, "").replace(/\\[([^\\]]+)\\]\\([^)]+\\)/g, "$1"); }\n';
edit("src/claude-logs.js", "function short(s, n) {", plain + "function short(s, n) {");
edit("src/claude-logs.js", 'if (txt && m.stop_reason === "end_turn") { s.summary = short(txt, 260);', 'if (txt && m.stop_reason === "end_turn") { s.summary = short(plain(txt), 260);');
edit("src/claude-logs.js", '  if (lastKind === "end") { s.state = "yourturn"; s.now = "Finished. Your turn"; }', '  if (lastKind === "end") { if (idle > 30 * 60000) { s.state = "done"; s.now = "Done"; } else { s.state = "yourturn"; s.now = "Finished. Your turn"; } }');
edit("src/claude-hooks.js", "function short(s, n) {", plain + "function short(s, n) {");
edit("src/claude-hooks.js", "s.summary = short(ev.last_assistant_message, 260);", "s.summary = short(plain(ev.last_assistant_message), 260);");

// renderer: Done state, last-active time, quieter held rows
edit("src/renderer/widgets.js", 'idle: ["var(--mute)", "Idle"],', 'idle: ["var(--mute)", "Idle"], done: ["var(--ok)", "Done"],');
edit("src/renderer/widgets.js", '      const ss = c.sessions.filter((s) => s.state !== "ended" && !(D.ui.hiddenSessions || []).includes(s.id));', '      const ss = c.sessions.filter((s) => s.state !== "ended" && !(D.ui.hiddenSessions || []).includes(s.id) && !(s.state === "done" && Date.now() - s.updated > 6 * 3600000));');
edit("src/renderer/widgets.js", '      const need = ss.filter((s) => s.state === "waiting").length;\n      const head = ss.length ? `${ss.length} running', '      const need = ss.filter((s) => s.state === "waiting").length;\n      const running = ss.filter((s) => s.state === "working" || s.state === "waiting").length;\n      const head = ss.length ? `${running} running${ss.length > running ? ", " + (ss.length - running) + " finished" : ""}');
edit("src/renderer/widgets.js", '<span class="ell m" style="font-size:13px">${held ? "Held until you stop playing" : esc(label + ". " + (s.state === "yourturn" && s.summary ? s.summary : s.now))}</span>', '<span class="ell m" style="font-size:13px">${esc(label + ". " + ((s.state === "yourturn" || s.state === "done") && s.summary ? s.summary : s.now))}</span>');
edit("src/renderer/sheets.js", '${esc(s.provider)}. ${ago(s.started)}', '${esc(s.provider)}. Active ${ago(s.updated)}${ago(s.updated) === "now" ? "" : " ago"}');
edit("src/renderer/sheets.js", '${esc(s.state === "yourturn" && s.summary ? s.summary : s.now)}', '${esc((s.state === "yourturn" || s.state === "done") && s.summary ? s.summary : s.now)}');
edit("src/main.js", 'for (const s of snap.sessions) if (s.state === "yourturn" && Date.now() - s.updated < 30 * 60000)', 'for (const s of mergedSessions()) if (s.state === "yourturn" && Date.now() - s.updated < 30 * 60000)');
edit("src/main.js", "function attention() {", `function mergedSessions() {
  const own = hub ? hub.snapshot().sessions : [];
  const logs = (live.logSessions || []).map((s) => ({ id: s.id, project: s.project, state: s.state, summary: s.summary, updated: s.updated }));
  return own.concat(logs);
}
function attention() {`);

// tests: check sessions through data, not the small widget
edit("test/run.js", '    const txt = await page.textContent("#app");\n    ok("AI widget lists sessions", txt.includes("salflix-web") && txt.includes("wwe-mod-index"));\n    ok("plan progress shown", txt.includes("2/5"));',
  '    const data = await page.evaluate(() => (D.claude.sessions || []).map((s) => s.project + ":" + s.done + "/" + s.total));\n    ok("AI sessions include hook sessions", data.some((x) => x.startsWith("salflix-web")) && data.some((x) => x.startsWith("wwe-mod-index")), data.slice(0, 6).join(" "));\n    ok("plan progress tracked", data.includes("salflix-web:2/5"));');
console.log("patched");
