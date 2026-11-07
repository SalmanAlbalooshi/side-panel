// A brand-new PC and the awkward moments. Usage: node test/fresh.js [bare|edge]
// bare: no Claude Code, no Windows helper, no Claude history, first start with the setup wizard.
// edge: a stand-in Claude (a .cmd shim like npm installs) to force sign-in errors, slow replies, Stop, busy follow-ups.
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");

const SHOTS = path.join(__dirname, "shots", "fresh");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const want = process.argv.slice(2);
const on = (n) => !want.length || want.includes(n);
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 220) : "")); console.log(log[log.length - 1]); };
async function until(page, fn, ms, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await wait(400); } return false; }
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") });

async function launch(extraEnv, args) {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(path.join(os.tmpdir(), "side-panel-test")) ? fs.readdirSync(path.join(os.tmpdir(), "side-panel-test")) : [])) try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  const env = Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832" }, extraEnv);
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env, executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed"], args || []), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top, .sheet", { timeout: 30000 });
  return { app, page, errors };
}

(async () => {
  if (on("bare")) {
    const emptyClaude = fs.mkdtempSync(path.join(os.tmpdir(), "sp-noclaude-"));
    const { app, page, errors } = await launch({ SP_CLAUDE: "none", SP_HELPER: "C:\\nowhere\\PanelHost.exe", CLAUDE_CONFIG_DIR: emptyClaude }, ["--setup"]);
    ok("bare: first start opens setup", await until(page, () => D.ui.sheet === "setup", 15000));
    await shot(page, "b01-setup");
    for (let i = 0; i < 60 && !(await page.$("[data-act=setupApp]")); i++) await wait(1000);
    ok("bare: setup suggests apps even with no usage history", (await page.$$("[data-act=setupApp]")).length > 0);
    for (let i = 0; i < 2; i++) { await page.click("[data-act=setupNext]").catch(() => { }); await wait(600); }
    await page.click("[data-act=setupScreen][data-arg*='window']").catch(() => { }); await wait(300);
    await shot(page, "b02-setup-last");
    await page.click("[data-act=setupNext]").catch(() => { }); await wait(1500);
    ok("bare: setup finishes", await page.evaluate(() => D.cfg.setupDone === true && !D.ui.sheet));
    ok("bare: discovery found this PC's apps without help", await until(page, () => D.discReady && Object.values(D.cfg.keySets).flat().length > 0, 60000), await page.evaluate(() => Object.values(D.cfg.keySets).flat().map((k) => k.label).slice(0, 6).join(",")));
    await wait(1500); await shot(page, "b03-home");
    ok("bare: says plainly that music and game detection are off", /Music, sound and game detection are off/.test(await page.textContent("body")));
    ok("bare: no Claude Code means no Claude Code choices", await page.evaluate(() => !D.providers.some((p) => p.id === "claude-code") && D.providers.some((p) => p.kind === "web")));
    await page.evaluate(() => openSheet("ask")); await wait(500);
    ok("bare: Ask still works with web AI", /Claude \(web\)/.test(await page.textContent("#layer")));
    await shot(page, "b04-ask-web");
    await page.evaluate(() => openSheet("build")); await wait(400);
    ok("bare: Build a widget explains it needs Claude Code", /Needs Claude Code/.test(await page.textContent("#layer")) && !!(await page.$("[data-act=buildWidget][disabled]")));
    await page.evaluate(() => openSheet("sessions")); await wait(400);
    ok("bare: AI sessions is empty, not broken, and says what to do", /No AI tools on this PC yet|No AI sessions right now/.test(await page.textContent("#layer")));
    await page.evaluate(() => openSheet("music")); await wait(400);
    ok("bare: music sheet without the helper", /Nothing playing/.test(await page.textContent("#layer")));
    await page.evaluate(() => closeSheet());
    // every widget renders on a bare PC
    const bad = await page.evaluate(() => Object.keys(W).filter((t) => { try { W[t].render({ id: "x", type: t, w: 3, h: 2, opts: { name: "x", set: "home" } }, D); return false; } catch (e) { return true; } }));
    ok("bare: every widget renders with nothing installed", bad.length === 0, bad.join(","));
    ok("no page errors (bare)", errors.length === 0, errors.slice(0, 4).join(" | "));
    await app.close();
    fs.rmSync(emptyClaude, { recursive: true, force: true });
  }

  if (on("edge")) {
    const fake = path.join(__dirname, "fake-claude.cmd");
    const { app, page, errors } = await launch({ SP_CLAUDE: fake });
    await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
    ok("edge: the stand-in Claude is found", await until(page, () => D.providers.some((p) => p.id === "claude-code"), 30000));
    const ask = async (q) => { await page.evaluate(() => { D.ui.ask.thread = null; D.ui.ask.mode = "quick"; openSheet("ask"); }); await wait(300); await page.fill("#askText", q); await page.click("[data-act=askSend]"); };
    const thread = () => page.evaluate(() => D.ui.ask.thread && D.ui.threadCache && D.ui.threadCache[D.ui.ask.thread]);

    // the flags survive the .cmd shim, including the empty one
    await ask("ARGS please");
    await until(page, () => /ARGS \[/.test((document.querySelector("#conv") || {}).textContent || ""), 20000);
    const argText = await page.textContent("#conv");
    ok("edge: lean flags reach Claude through a .cmd shim", /"--setting-sources",""/.test(argText) && /"--strict-mcp-config"/.test(argText) && /"--permission-mode","plan"/.test(argText), argText.slice(0, 200));

    // signed out: a clear message, not a crash
    await ask("AUTHFAIL now");
    ok("edge: signed out shows what to do", await until(page, () => /sign in again/i.test((document.querySelector("#conv") || {}).textContent || ""), 20000));
    await shot(page, "e01-signed-out");

    // a follow-up keeps the conversation
    await ask("hello there");
    await until(page, () => { const t = D.ui.ask.thread && (D.ui.threadCache || {})[D.ui.ask.thread]; return t && t.state === "done"; }, 20000);
    await page.fill("#askText", "and again"); await page.click("[data-act=askSend]");
    ok("edge: follow-up resumes the same chat", await until(page, () => /Resumed\. Echo: and again/.test((document.querySelector("#conv") || {}).textContent || ""), 20000));

    // slow reply: typing while it works, a follow-up is held, Stop stops it
    await ask("SLOW please");
    ok("edge: words appear while it writes", await until(page, () => /Working on it/.test((document.querySelector("#conv") || {}).textContent || ""), 15000));
    const r = await page.evaluate(() => window.panel.act("threadFollow", { id: D.ui.ask.thread, text: "hurry" }));
    ok("edge: a follow-up while it's busy is held back politely", /Wait for this reply/.test(r.error || ""), JSON.stringify(r));
    await page.evaluate(() => H.openThread(D.ui.ask.thread)); await wait(600);
    await shot(page, "e02-slow");
    await page.click("[data-act=chatStop]");
    ok("edge: Stop stops it", await until(page, () => D.ui.threadData && D.ui.threadData.state === "stopped", 15000), await page.evaluate(() => D.ui.threadData && D.ui.threadData.state));
    await shot(page, "e03-stopped");
    // steps fold, delete needs a second tap
    await ask("TOOL time");
    ok("edge: tool steps show", await until(page, () => /Read notes\.md/.test((document.querySelector("#conv") || {}).textContent || ""), 15000));
    await page.evaluate(() => H.openThread(D.ui.ask.thread)); await wait(500);
    await page.click("[data-act=chatDelete]"); await wait(200);
    ok("edge: delete asks for a second tap", await page.evaluate(() => D.ui.sheet === "chat" && /Tap again/.test(document.querySelector("[data-act=chatDelete]").textContent)));
    await page.click("[data-act=chatDelete]"); await wait(500);
    ok("edge: deleted chat is gone", await page.evaluate(() => D.ui.sheet === null));
    // empty input, huge input
    await page.evaluate(() => { D.ui.ask.thread = null; openSheet("ask"); }); await wait(200);
    await page.fill("#askText", "   "); await page.click("[data-act=askSend]"); await wait(300);
    ok("edge: empty question is refused with a hint", /Type or say something first/.test(await page.textContent("body")));
    const big = await page.evaluate(() => window.panel.act("ask", { provider: "claude-code", question: "x".repeat(50000) }));
    ok("edge: an oversized question is trimmed, not crashing", !!(big && big.thread));
    // unknown thread ids and bad input to new actions
    const junk = await page.evaluate(async () => [await window.panel.act("threadFollow", { id: "nope", text: "x" }), await window.panel.act("thread", { evil: 1 }), await window.panel.act("threadStop", "../x"), await window.panel.act("sessionLog", "../../etc"), await window.panel.act("continueSession", { id: "x", text: "y" }), await window.panel.act("aiAction", { preset: "__proto__" }), await window.panel.act("personDo", { id: "nope", how: "chat" }), await window.panel.act("media", { action: "rm -rf", app: "x" })]);
    ok("edge: bad input to every new action is refused calmly", junk.every((x) => x && (x.error || x.ok === false || x.thread === null || x.log === null)), JSON.stringify(junk));
    ok("no page errors (edge)", errors.length === 0, errors.slice(0, 4).join(" | "));
    await app.close();
  }
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
