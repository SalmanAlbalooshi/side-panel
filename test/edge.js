// Odd setups and misbehaving tools: a messy saved config, HTML in names, an AI tool that crashes, hangs or prints
// garbage, double taps, odd window sizes, odd things typed into Blink, and voice downloads that fail.
// Never touches real volume, the mic or speakers. Usage: node test/edge.js  (PANEL_EXE=<path> for the packaged app)
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const SHOTS = path.join(__dirname, "shots", "edge");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
async function until(page, fn, ms, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await wait(300); } return false; }
const DATA = path.join(os.tmpdir(), "side-panel-test");
const answer = (page) => page.evaluate(() => (document.querySelector(".cmd-answer") || {}).textContent || "");
async function ask(page, text) { await page.evaluate((t) => { const e = document.querySelector("#cmdText"); e.focus(); e.value = t; e.dispatchEvent(new Event("input", { bubbles: true })); }, text); await page.keyboard.press("Enter"); for (let i = 0; i < 24; i++) { await wait(250); const a = await answer(page); if (/\S/.test(a) && !/^Thinking/.test(a)) return a; } return answer(page); }
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);

// a saved config that a buggy older version, a hand edit or a sync tool could leave behind
function messyConfig() {
  const xss = '<img src=x onerror="window.__pwned=1">';
  const keys = [{ id: "k-xss", label: xss + "Evil", action: { type: "url", url: "https://example.com" }, glyph: "globe" }];
  for (let i = 0; i < 70; i++) keys.push({ id: "k" + i, label: i % 7 === 0 ? "كتاب " + i : i % 5 === 0 ? "🎮 Game key with a very very long name number " + i : "Key " + i, action: { type: "url", url: "https://example.com/" + i }, glyph: "globe" });
  keys.push({ id: "bad1", label: "no action" }, { id: "bad2", label: "js", action: { type: "url", url: "javascript:alert(1)" } }, "not even an object", null);
  return {
    setupDone: true, theme: "neon", companion: "dragon", companionTalk: 7, replyHome: "loud", replyWork: null, webAI: "evil-web", aiModel: 5, voiceEn: "yes", autoDesktop: "sure",
    miniParts: 42, routines: [{ id: 1 }, "x", { id: "r1", when: { type: "game" }, steps: ["open github.com"], on: true }, { id: "r2", when: { type: "time", value: "25:99" }, steps: new Array(50).fill("x") }],
    activeLayout: "Nope",
    layouts: [{ name: "🏠 Home with a really long layout name that keeps going and going and going", rules: [] }, { name: "شغل", rules: "bad" }, { name: "", rules: [] }, { name: "Work", rules: [{ type: "time", from: "aa", to: 5 }] }],
    keySets: { home: keys, work: "nope" },
    playlists: [{ label: "x", url: "javascript:alert(1)" }],
    customWidgets: { evil: { approved: "yes" } }
  };
}

(async () => {
  try { fs.rmSync(DATA, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(DATA) ? fs.readdirSync(DATA) : [])) try { fs.rmSync(path.join(DATA, f), { recursive: true, force: true }); } catch { } }
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, "config.json"), JSON.stringify(messyConfig()));
  const env = Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" });
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env, executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"]), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); page.screenshot = ((o) => (opts) => o(Object.assign({ timeout: 8000 }, opts || {})).catch(() => null))(page.screenshot.bind(page)); page.click = ((orig) => async (sel, o) => { try { await orig(sel, Object.assign({ timeout: 5000 }, o || {})); } catch { await page.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("no " + s); if (e.focus) e.focus(); e.click(); }, sel); } })(page.click.bind(page));
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 30000 });
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  await wait(2500);

  // 1. the messy config: the panel opens and repairs what it can
  const c = await page.evaluate(() => D.cfg);
  ok("messy config: the panel opens", !!(await page.$(".top")));
  ok("messy config: bad values fall back to defaults", c.companion === "blink" && ["light", "dark", "auto"].includes(c.theme) && c.webAI === "claude-web" && c.replyHome === "listen" && typeof c.voiceEn === "boolean", JSON.stringify({ companion: c.companion, theme: c.theme, webAI: c.webAI, replyHome: c.replyHome, voiceEn: c.voiceEn }));
  ok("messy config: only valid routines kept", Array.isArray(c.routines) && c.routines.every((r) => typeof r.id === "string" && r.steps.length <= 6), JSON.stringify(c.routines));
  ok("messy config: broken keys dropped, javascript links refused", !c.keySets.home.some((k) => !k || !k.action || /javascript:/i.test(JSON.stringify(k.action))));
  ok("messy config: an unknown layout falls back to a real one", c.layouts.some((L) => L.name === c.activeLayout), c.activeLayout);
  ok("HTML in a key name shows as text and never runs", await page.evaluate(() => window.__pwned === undefined && !document.querySelector(".top img[src='x'], #app img[src='x']")));
  ok("a very long layout name doesn't push the top bar wider than the screen", await page.evaluate(() => { const t = document.querySelector(".top"); return t.scrollWidth <= t.clientWidth + 2; }));
  ok("no sideways scrolling with 70 keys", await noSideScroll(page));
  await page.screenshot({ path: path.join(SHOTS, "e01-messy-config.png") });

  // 2. odd window sizes
  for (const [w, h] of [[800, 480], [600, 1024], [1920, 1080], [1024, 300]]) {
    await page.setViewportSize({ width: w, height: h }); await wait(700);
    ok(`window ${w}x${h}: no sideways scrolling, top bar visible`, (await noSideScroll(page)) && await page.evaluate(() => { const r = document.querySelector(".askblink").getBoundingClientRect(); return r.width > 0 && r.right <= window.innerWidth + 1; }));
    await page.evaluate(() => H.cmdOpen()); await wait(400);
    ok(`window ${w}x${h}: the Blink bar fits`, await page.evaluate(() => { const b = document.querySelector(".cmdbar"); if (!b) return false; const r = b.getBoundingClientRect(); return r.right <= window.innerWidth + 1 && r.left >= -1; }));
    await page.screenshot({ path: path.join(SHOTS, `e02-size-${w}x${h}.png`) });
    await page.evaluate(() => closeSheet()); await wait(200);
  }
  await page.setViewportSize({ width: 1280, height: 800 }); await wait(600);

  // 3. odd things typed into Blink
  await page.evaluate(() => H.cmdOpen()); await wait(400);
  for (const [text, name] of [["🙂🙂🙂", "only emoji"], ["      ", "only spaces"], ["x".repeat(5000), "5,000 characters"], ["remind me in 0 minutes to blink", "a reminder in 0 minutes"], ["remind me in 999999 minutes to wait", "a reminder far away"], ["focus 0 minutes", "focus for 0 minutes"], ["open", "open with nothing"], ["ذكرني بعد", "half an Arabic reminder"], ["what is 1/0", "divide by zero"], ["<script>window.__pwned=3</script>", "a script tag"]]) {
    const a = await ask(page, text);
    ok("Blink copes with " + name, errors.length === 0 && (await page.evaluate(() => window.__pwned === undefined)) && (/\S/.test(a) || text.trim() === ""), a.slice(0, 80));
  }
  const r999 = await page.evaluate(() => window.panel.act("command", "remind me in 999999 minutes to wait"));
  ok("a far reminder is capped, not lost or instant", /week/i.test(r999.say || ""), r999.say);
  await page.evaluate(() => { D.ui.focus.running = false; });

  // 4. double taps don't start two of the same thing
  const before = (await page.evaluate(() => (D.threads || []).length));
  await page.evaluate(() => { const e = document.querySelector("#cmdText"); e.focus(); e.value = "write a haiku about rain"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.evaluate(() => { const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true }); const i = document.querySelector("#cmdText"); i.dispatchEvent(e); i.dispatchEvent(e); });
  await page.click("[data-act=cmdSend]").catch(() => { });
  await wait(2500);
  const after = (await page.evaluate(() => (D.threads || []).length));
  ok("pressing Send twice fast starts one AI chat, not two", after - before <= 1, before + " -> " + after);

  // 5. an AI tool that misbehaves
  const run = async (prompt) => { const r = await page.evaluate((p) => window.panel.act("ask", { provider: "claude-code", question: p }), prompt); await page.evaluate((id) => H.openThread(id), r.thread); return r.thread; };
  const conv = () => page.evaluate(() => (document.querySelector("#conv") || {}).textContent || "");
  await run("CRASHNOW please");
  ok("AI tool crashes: the chat says so in plain words", await until(page, () => D.ui.threadData && D.ui.threadData.state === "error" && /stopped|error|went wrong|crash/i.test(document.querySelector("#conv").textContent), 15000), await conv());
  await page.screenshot({ path: path.join(SHOTS, "e03-ai-crash.png") });
  await run("GARBAGE then answer");
  ok("AI tool prints garbage: the panel ignores it and still shows the answer", await until(page, () => /Echo: GARBAGE/.test((document.querySelector("#conv") || {}).textContent || ""), 15000), await conv());
  await run("HTMLNOW");
  ok("AI answer with HTML in it shows as text and never runs", await until(page, () => /done/.test((document.querySelector("#conv") || {}).textContent || ""), 15000) && await page.evaluate(() => window.__pwned === undefined && !document.querySelector("#conv img[src='x'], #conv script")));
  await run("HANGNOW forever");
  await wait(1500);
  await page.click("[data-act=chatStop]").catch(() => { });
  ok("AI tool hangs: Stop ends it", await until(page, () => D.ui.threadData && ["stopped", "error"].includes(D.ui.threadData.state), 15000), await page.evaluate(() => D.ui.threadData && D.ui.threadData.state));
  await page.evaluate(() => closeSheet());

  // 6. bad input straight to the panel's actions (what a buggy page or a stray script might send)
  const bad = await page.evaluate(async () => {
    const tries = [["voiceInstall", "../../etc"], ["voiceRemove", "engine"], ["threadDesktop", "nope"], ["threadTerminal", null], ["codexContinue", { id: "../x", text: "hi" }], ["codexTerminal", { id: "a b; rm" }], ["continueSession", { id: "x", text: "" }], ["askWeb", { q: "hi", id: "javascript:alert(1)" }], ["command", { weird: true }], ["setLayout", "<script>"], ["saveSettings", { webAI: "file:///c:/", replyHome: 1, autoDesktop: "x" }]];
    const out = [];
    for (const [a, arg] of tries) { try { const r = await window.panel.act(a, arg); out.push(a + ":" + (r && (r.error ? "refused" : "ok"))); } catch (e) { out.push(a + ":threw " + e.message); } }
    return out;
  });
  ok("bad input to actions is refused calmly, nothing throws", !bad.some((x) => /threw/.test(x)), bad.join(" "));
  ok("a web AI that isn't on the list is never opened", await page.evaluate(() => !(window.panel.testState ? true : false) || true) && !(await page.evaluate(async () => (await window.panel.testState()).sent.some((s) => /javascript:/.test(s)))));
  ok("settings stay valid after bad values", await page.evaluate(() => ["claude-web", "chatgpt-web", "gemini-web", "copilot-web"].includes(D.cfg.webAI) && ["read", "listen"].includes(D.cfg.replyHome)));

  ok("no page errors (edge)", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();

  // 7. voice downloads that fail (no app needed): a dead link and a refused connection give plain messages
  const { Voices, CATALOG } = require(path.join(__dirname, "..", "src", "voices.js"));
  const root = path.join(os.tmpdir(), "sp-test-voices"); fs.rmSync(root, { recursive: true, force: true });
  const saved = JSON.parse(JSON.stringify(CATALOG));
  CATALOG.engine.url = "https://127.0.0.1:9/nothing-here.tar.bz2";
  const v = new Voices(root, { busy: () => false });
  v.install("ar"); await v.queue; await wait(100);
  const j = v.jobs.ar || {};
  ok("voice download with no connection: fails with a plain message", j.state === "failed" && /internet/i.test(j.error || ""), j.error);
  ok("voice download failure leaves nothing half-installed", !v.has("engine") && !v.has("ar"));
  ok("unknown voice refused", !!v.install("../x").error && !!v.remove("engine").error);
  ok("speaking with no voice installed falls back to Windows voices", (await v.say("hello", "en", { en: true })) === null);
  Object.assign(CATALOG, saved);
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
