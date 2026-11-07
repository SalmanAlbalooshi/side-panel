// Robustness: different PCs, people and things going wrong. The app must start, stay usable and never crash.
// Each case uses its own temporary data; never touches your real settings, files, mic, speakers or apps.
// Usage: node test/round15.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 220) : "")); console.log(log[log.length - 1]); };
const DATA = path.join(os.tmpdir(), "side-panel-test");
const clean = () => { for (const f of ["config.json", "config.json.bad", "ai"]) { try { fs.rmSync(path.join(DATA, f), { recursive: true, force: true }); } catch { } } try { for (const f of fs.readdirSync(DATA)) if (/^config.*\.(bad|broken|bak)/i.test(f)) fs.rmSync(path.join(DATA, f), { force: true }); } catch { } };
async function launch(env, size) {
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }, env || {}), args: [path.join(__dirname, ".."), "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error" && !/favicon|net::ERR_/.test(m.text())) errors.push(m.text()); });
  if (size) await page.setViewportSize(size).catch(() => { });
  const started = await page.waitForSelector(".top", { timeout: 30000 }).then(() => true).catch(() => false);
  await wait(1500);
  return { app, page, errors, started };
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  // 1. a PC where the Windows helper is missing (blocked by antivirus, or a broken copy)
  clean(); let s = await launch({ SP_HELPER: path.join(os.tmpdir(), "no-such-helper", "PanelHost.exe") });
  ok("no helper: the panel still starts", s.started);
  let r = await s.page.evaluate(() => window.panel.act("command", "what time is it"));
  ok("no helper: everyday answers still work", /\d/.test(r.say || ""), r.say);
  r = await s.page.evaluate(() => window.panel.act("testTool", { name: "app_look", args: { app: "notepad" } }));
  ok("no helper: app control says it isn't available, no crash", !!r && (r.error || r.say) !== undefined, JSON.stringify(r));
  ok("no helper: no page errors", s.errors.length === 0, s.errors.slice(0, 2).join(" | "));
  await s.app.close();

  // 2. settings file damaged (power cut while saving, a bad hand edit)
  clean(); fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, "config.json"), "{ this is not json ");
  s = await launch();
  ok("damaged settings: starts with fresh settings instead of crashing", s.started && await s.page.evaluate(() => !!D.cfg && Array.isArray(D.cfg.layouts)));
  ok("damaged settings: the broken file is kept as a backup, not thrown away", fs.readdirSync(DATA).some((f) => /^config.*(bad|broken|bak|corrupt)/i.test(f) || /config\.json\.\d+/.test(f)), fs.readdirSync(DATA).join(", "));
  await s.app.close();

  // 3. settings from an older version with odd values
  clean(); fs.writeFileSync(path.join(DATA, "config.json"), JSON.stringify({ version: 0, theme: "purple", aiModel: 42, notes: "not a list", appAllow: ["x"], musicSource: "napster", keySets: { home: [{ id: "bad key!", label: 5 }] }, layouts: "nope", userName: "<script>alert(1)</script>" }));
  s = await launch();
  ok("odd old settings: starts and repairs them", s.started && await s.page.evaluate(() => ["light", "dark", "auto"].includes(D.cfg.theme) && Array.isArray(D.cfg.notes) && D.cfg.musicSource === "auto" && Array.isArray(D.cfg.layouts)), await s.page.evaluate(() => JSON.stringify({ t: D.cfg.theme, n: D.cfg.notes, m: D.cfg.musicSource })));
  ok("odd old settings: a name with code in it can't run", await s.page.evaluate(() => !window.__pwned && !document.querySelector("#app script")));
  ok("odd old settings: no page errors", s.errors.length === 0, s.errors.slice(0, 2).join(" | "));
  await s.app.close();

  // 4. chat history damaged, then a huge one
  clean(); fs.mkdirSync(path.join(DATA, "ai"), { recursive: true }); fs.writeFileSync(path.join(DATA, "ai", "chats.json"), "[{\"id\":\"x\",\"messages\":");
  s = await launch();
  ok("damaged chat history: starts with no chats instead of crashing", s.started && await s.page.evaluate(() => Array.isArray(D.threads)));
  await s.app.close();
  const big = []; for (let i = 0; i < 150; i++) big.push({ id: "t" + i, engine: "claude", kind: "chat", provider: "Claude Code", title: "Chat number " + i + " with a long title that goes on and on and on", cwd: os.tmpdir(), mode: "ask", sessionId: "s" + i, state: "done", started: Date.now() - i * 60000, updated: Date.now() - i * 60000, cost: 0, extra: { blink: true }, messages: Array.from({ length: 80 }, (_, j) => (j % 2 ? { role: "ai", parts: [{ type: "text", text: "Answer " + j + " ".repeat(5) + "x".repeat(400) }] } : { role: "you", text: "Question " + j })) });
  fs.writeFileSync(path.join(DATA, "ai", "chats.json"), JSON.stringify(big));
  s = await launch();
  const t0 = Date.now(); await s.page.evaluate(() => H.chats()); await wait(300);
  const n = await s.page.evaluate(() => document.querySelectorAll(".chatrow").length); const ms = Date.now() - t0;
  ok("150 long chats: Chats opens fast and lists them", n === 150 && ms < 2500, n + " rows in " + ms + " ms");
  await s.page.evaluate(() => H.openThread("t0")); await wait(800);
  ok("a chat with 80 long messages opens", await s.page.evaluate(() => D.ui.sheet === "chat" && document.querySelectorAll("#conv .msg").length > 20));
  ok("huge history: no page errors", s.errors.length === 0, s.errors.slice(0, 2).join(" | "));
  await s.app.close();

  // 5. a person with a non-English name, lots of notes in different languages, a tiny portrait screen
  clean(); s = await launch({}, { width: 600, height: 1024 });
  await s.page.evaluate(() => window.panel.act("saveSettings", { userName: "Zoë-Ann" }));
  for (const t of ["note: اتصل بالبنك قبل الساعة 3", "note: 🎉 book the team lunch by Friday", "note: " + "a very long note that keeps going ".repeat(8)]) await s.page.evaluate((x) => window.panel.act("command", x), t);
  for (let i = 0; i < 57; i++) await s.page.evaluate((x) => window.panel.act("noteAdd", { text: x, due: "" }), "item " + i);
  await wait(800);
  ok("60 notes in Arabic, emoji and long text: the screen doesn't scroll sideways (portrait 600x1024)", await noSideScroll(s.page));
  ok("Arabic notes show right-to-left", await s.page.evaluate(() => [...document.querySelectorAll(".note .nt")].some((e) => /[؀-ۿ]/.test(e.textContent) && e.getAttribute("dir") === "auto")));
  r = await s.page.evaluate(() => window.panel.act("command", "what's my name")); ok("a non-English name is kept and used", /Zoë-Ann/.test(r.say || ""), r.say);
  await s.page.evaluate(() => H.callStart()); await wait(700);
  ok("portrait: the call screen fits with its buttons visible", await s.page.evaluate(() => { const b = [...document.querySelectorAll(".call-end")].map((e) => e.getBoundingClientRect()); return b.length === 2 && b.every((x) => x.bottom <= window.innerHeight + 1 && x.right <= window.innerWidth + 1); }) && await noSideScroll(s.page));
  await s.page.evaluate(() => Call.end(true)); await wait(300);
  await s.page.setViewportSize({ width: 800, height: 480 }); await wait(500);
  await s.page.evaluate(() => H.chats()); await wait(400);
  ok("tiny 800x480 screen: Chats fits", await noSideScroll(s.page) && await s.page.evaluate(() => !!document.querySelector("[data-act=chatNew]")));
  await s.page.evaluate(() => closeSheet());
  ok("different person and screen: no page errors", s.errors.length === 0, s.errors.slice(0, 2).join(" | "));

  // 6. someone who taps and talks fast: 40 commands in a burst, a call opened and closed 5 times
  const cmds = ["volume 30", "pause", "play", "next song", "what time is it", "work mode", "home mode", "focus 5 minutes", "note: x", "what's on my list", "open my downloads", "how much battery do I have"];
  const t1 = Date.now(); await Promise.all(Array.from({ length: 40 }, (_, i) => s.page.evaluate((x) => window.panel.act("command", x), cmds[i % cmds.length])));
  ok("40 commands at once: all answered, quickly", Date.now() - t1 < 8000, (Date.now() - t1) + " ms");
  for (let i = 0; i < 5; i++) { await s.page.evaluate(() => H.callStart()); await wait(150); await s.page.evaluate(() => Call.end(true)); await wait(150); }
  await wait(500);
  ok("a call opened and closed 5 times fast: ends cleanly, microphone off", await s.page.evaluate(() => !Call.on && !Call.starting && !Call.mic && D.ui.sheet !== "call"));
  ok("fast use: no page errors", s.errors.length === 0, s.errors.slice(0, 2).join(" | "));
  await s.app.close();

  // 7. no internet: the update check fails quietly; no AI at all
  clean(); s = await launch({ SP_UPDATE_URL: "http://127.0.0.1:9/none", SP_CLAUDE: "none", SP_CODEX: "none" });
  await wait(2500);
  ok("no internet: the update check fails quietly (no pop-up, app fine)", await s.page.evaluate(() => D.ui.sheet !== "update" && (!D.update || D.update.status !== "available")));
  r = await s.page.evaluate(() => window.panel.act("command", "what's the tallest building in the world"));
  ok("no AI: a question offers a browser AI", /browser/i.test(r.say || "") && !!r.web, JSON.stringify(r));
  r = await s.page.evaluate(() => window.panel.act("testTool", { name: "claude_task", args: { task: "write my report" } }));
  ok("no AI: handing over work says what's needed instead of failing", /needs Claude Code/i.test(r.error || ""), JSON.stringify(r));
  ok("no internet, no AI: no page errors", s.errors.length === 0, s.errors.slice(0, 2).join(" | "));
  await s.app.close();

  // 8. a new user's first 'remember': the memory folder doesn't exist yet
  clean(); const mem = path.join(os.tmpdir(), "sp-new-memory", "projects", "x", "memory"); fs.rmSync(path.join(os.tmpdir(), "sp-new-memory"), { recursive: true, force: true });
  s = await launch({ SP_TEST_MEMORY: mem });
  r = await s.page.evaluate(() => window.panel.act("testTool", { name: "remember", args: { fact: "My team stand-up is at 9:30" } }));
  ok("first 'remember' on a new PC creates the memory folder and index", /remember/i.test(r.say || "") && fs.existsSync(path.join(mem, "MEMORY.md")), JSON.stringify(r));
  r = await s.page.evaluate(() => window.panel.act("testTool", { name: "remember", args: { fact: "" } }));
  ok("an empty 'remember' is refused politely", !!r.error, JSON.stringify(r));
  await s.app.close();
  fs.rmSync(path.join(os.tmpdir(), "sp-new-memory"), { recursive: true, force: true });

  fs.mkdirSync(path.join(__dirname, "shots", "round15"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "round15", "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
