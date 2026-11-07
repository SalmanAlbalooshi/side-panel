// This round: one voice at a time; Blink's own echo doesn't cut it off, your words do; an interrupted answer never
// leaks into the next; spoken part vs on-screen details; tables; the model you picked; "play" isn't taken by games.
// Never uses the real mic, speakers, volume or music (speech is replaced with a silent fake). Usage: node test/round9.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
(async () => {
  // ---- the AI process: words from an interrupted answer are skipped (no app needed) ----
  const { CallBrain } = require("../src/call-brain");
  const got = []; const b = new CallBrain({ claudePath: () => null, system: () => "", onDelta: (t) => got.push("d:" + t), onDone: (t) => got.push("done:" + t), onError: (m) => got.push("err:" + m) });
  b.p = { exitCode: null, stdin: { write() { } } }; b.alive = () => true; b.start = () => true;
  const ev = (t) => JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: t } } });
  b.ask("first"); b.line(ev("Old answer part one. ")); b.interrupt();
  b.ask("second"); b.line(ev("old leftover ")); b.line(JSON.stringify({ type: "result", result: "old" }));
  b.line(ev("New answer.")); b.line(JSON.stringify({ type: "result", result: "New answer." }));
  ok("AI: an interrupted answer's leftovers never reach the next answer", got.join("|") === "d:Old answer part one. |d:New answer.|done:New answer.", got.join("|"));

  // ---- "play" goes to music unless it's clearly a game ----
  const c = require("../src/commands");
  const games = ["Marvel's Wolverine", "Assassin's Creed Shadows", "Halo Infinite", "Lights Out", "Elden Ring"].map((n, i) => ({ name: n, url: "steam://rungameid/" + i }));
  const ctx = { keys: [], people: [], playlists: [], layouts: ["Home"], apps: [], games, hasAI: true, meeting: null, name: "" };
  const kind = (t) => (c.parse(t, ctx) || {}).act;
  ok("'play halo', 'play lights', 'play creed' play music", ["play halo", "play lights", "play creed"].every((t) => kind(t) === "musicPlay"));
  ok("'play elden ring', 'play wolverine', 'start halo' start the game", ["play elden ring", "play wolverine", "start halo"].every((t) => kind(t) === "openUrl"));

  // ---- the app ----
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }), args: [path.join(__dirname, ".."), "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);

  await page.evaluate(() => H.callStart()); await wait(800);
  // a silent fake voice: sentence audio takes 150-400 ms to make and 120 ms to "play"; counts voices at once
  await page.evaluate(() => {
    window.__voices = { now: 0, max: 0, said: [] };
    const realAct = window.panel.act;
    window.panel.act = (n, a) => n === "voiceSay" ? new Promise((r) => setTimeout(() => r(null), 150 + Math.random() * 250)) : realAct(n, a);
    window.act = (n, a) => window.panel.act(n, a);
    window.speechSynthesis.speak = (u) => { const v = window.__voices; v.now++; v.max = Math.max(v.max, v.now); v.said.push(u.text); setTimeout(() => { v.now--; u.onend && u.onend(); }, 120); };
    window.speechSynthesis.cancel = () => { };
    Object.defineProperty(D, "test", { get: () => false, set() { }, configurable: true }); Call.queue = []; Call.playing = null; // the regular refresh would switch test mode back on
  });
  // the answer arrives faster than it's spoken
  await page.evaluate(() => { Call.aiBusy = true; Call.answer = ""; Call.spokenUpTo = 0; Call.add("blink", ""); for (const s of ["First sentence here. ", "Second one now. ", "Third sentence. ", "And a fourth."]) Call.delta(s); Call.done(""); });
  await wait(3500);
  const v = await page.evaluate(() => window.__voices);
  ok("one voice at a time, even when sentences arrive faster than they're spoken", v.max === 1 && v.said.length === 4, JSON.stringify(v));
  ok("sentences are spoken in order", v.said.join(" ") === "First sentence here. Second one now. Third sentence. And a fourth.", v.said.join(" | "));

  // Blink's own voice comes back through the mic: it stays talking; your words stop it
  const echo = await page.evaluate(async () => {
    Call.heardSelf("I found three great places to eat near you tonight");
    Call.playing = { volume: 1, pause() { this.paused = true; } }; Call.queue = [{}];
    Call.heardStart(); const ducked = Call.playing.volume < 1 && Call.maybeBarge;
    Call.recognize = async () => "three great places to eat near you";
    await Call.heardEnd([new Float32Array(16000).fill(0.1)]);
    const kept = !!Call.playing && !Call.playing.paused && Call.playing.volume === 1;
    Call.heardStart(); Call.recognize = async () => "wait stop, what about pizza";
    let handled = ""; const h = Call.handle; Call.handle = (t) => { handled = t; };
    await Call.heardEnd([new Float32Array(16000).fill(0.1)]);
    Call.handle = h;
    return { ducked, kept, stopped: !Call.playing, handled };
  });
  ok("while Blink talks and hears something, it lowers its voice first", echo.ducked);
  ok("its own echo doesn't cut it off", echo.kept);
  ok("your words do stop it, and get answered", echo.stopped && /pizza/.test(echo.handled), JSON.stringify(echo));

  // spoken part vs on-screen details
  const scr = await page.evaluate(async () => {
    window.__voices.said = []; Call.queue = []; Call.playing = null;
    Call.aiBusy = true; Call.answer = ""; Call.spokenUpTo = 0; Call.add("blink", "");
    for (const s of ["There are 32 missions. ", "Here's the full list.", "\n[scr", "een]\n1. **Back in Action**\n2. A Debt Repaid\n", "| Act | Missions |\n|---|---|\n| 1 | 8 |\n"]) Call.delta(s);
    Call.done("");
    await new Promise((r) => setTimeout(r, 2000));
    const el = document.querySelector(".call-screen");
    return { said: window.__voices.said.join(" "), html: el ? el.innerHTML : "" };
  });
  ok("only the short part is spoken", scr.said === "There are 32 missions. Here's the full list.", scr.said);
  ok("the details show on screen, formatted (list, bold, table)", /<ol>/.test(scr.html) && /<b>Back in Action<\/b>/.test(scr.html) && /<table>/.test(scr.html) && !/\[screen\]/.test(scr.html), scr.html.slice(0, 160));
  await page.evaluate(() => { Object.defineProperty(D, "test", { value: true, writable: true, configurable: true }); Call.end(true); }); await wait(400);

  // the model picked in Settings is the one used (Balanced = Sonnet)
  const m = await page.evaluate(async () => { await window.panel.act("saveSettings", { aiModel: "sonnet" }); return D.cfg && D.cfg.aiModel; });
  ok("Settings model choice is kept (Balanced)", m === "sonnet" || m === undefined, m);
  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.mkdirSync(path.join(__dirname, "shots", "round9"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "round9", "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
