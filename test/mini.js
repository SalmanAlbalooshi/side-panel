// The mini panel for normal monitors: small, on top, in a corner, never stealing focus; expand and shrink back.
// Usage: node test/mini.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const SHOTS = path.join(__dirname, "shots", "mini");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(path.join(os.tmpdir(), "side-panel-test")) ? fs.readdirSync(path.join(os.tmpdir(), "side-panel-test")) : [])) try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  const env = Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd") });
  const exe = process.env.PANEL_EXE;
  const launch = () => electron.launch({ env, executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed"]), cwd: path.join(__dirname, "..") });
  let app = await launch();
  let page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".top", { timeout: 30000 });
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  await wait(5000);
  const state = async () => { const w = await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const b = w.getBounds(); const a = screen.getDisplayMatching(b).workArea; return { b, a, etop: w.isAlwaysOnTop(), focusable: w.isFocusable() }; }); await wait(400); const t = await page.evaluate(() => window.panel.testState()); return Object.assign(w, { top: w.etop || !!t.live.miniTop }); };
  ok("window mode shows a Mini button", !!(await page.$("[data-act=shrink]")));
  await page.click("[data-act=shrink]"); await wait(1500);
  let s = await state();
  ok("mini: small window", s.b.width === 440 && s.b.height === 300, JSON.stringify(s.b));
  ok("mini: bottom-right corner of the screen", Math.abs(s.b.x + s.b.width - (s.a.x + s.a.width - 12)) <= 2 && Math.abs(s.b.y + s.b.height - (s.a.y + s.a.height - 12)) <= 2, JSON.stringify(s));
  ok("mini: stays on top", s.top);
  ok("mini: never takes focus from your work", s.focusable === false);
  ok("mini: shows AI, keys", !!(await page.$(".minip .mhead")) && (await page.$$(".minip .mk")).length > 0);
  await page.screenshot({ path: path.join(SHOTS, "m01-mini.png") });
  // an approval shows right in the mini panel
  await page.evaluate(() => { window.__ap = window.panel.testHook("PermissionRequest", { session_id: "m1", cwd: "C:\\work\\report", tool_name: "Bash", tool_input: { command: "python build.py", description: "build" } }); });
  await page.evaluate(() => window.panel.act("saveSettings", { approvalsFromPanel: true })); await wait(1500);
  ok("mini: approval with Allow inside the mini panel", !!(await page.$(".minip .mrow.need [data-act=approve]")));
  await page.screenshot({ path: path.join(SHOTS, "m02-mini-approval.png") });
  await page.click(".minip [data-act=approve][data-arg*='allow']"); await wait(800);
  ok("mini: Allow answers Claude Code", /"behavior":"allow"/.test(await page.evaluate(() => window.__ap)));
  // play answers at once
  const cover = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "build", "cover.png")).toString("base64");
  await page.evaluate((c) => window.panel.testLive({ media: { available: true, sessions: [{ app: "Test.exe", name: "Test", title: "Nights", artist: "Frank Ocean", playing: false, canNext: true, canPrev: true, pos: 10, dur: 200, at: Date.now(), current: true, art: c, artKey: "t" }] } }), cover);
  await wait(1500);
  await page.click(".minip [data-act=media][data-arg*='toggle']");
  await wait(150);
  ok("mini: play icon changes at once", await page.evaluate(() => !!document.querySelector(".minip [data-act=media][data-arg*='toggle'] svg path[d^='M8 5v14M16']")));
  await page.evaluate(() => window.panel.testLive({ media: null }));
  // Work mode: the mode name shows, Focus is there and starts
  await page.click(".minip .mmode"); await wait(400);
  await page.click(".minip [data-act=miniLayout][data-arg*='Work']"); await wait(1500);
  ok("mini: shows the mode and switches it", /Work/.test(await page.textContent(".minip .mmode")));
  ok("mini: Work shows Focus", !!(await page.$(".minip [data-act=focus][data-arg*='start']")));
  await page.click(".minip [data-act=focus][data-arg*='start']"); await wait(1200);
  ok("mini: Focus runs from the mini panel", await page.evaluate(() => D.ui.focus.running) && /24:5\d|25:00/.test(await page.textContent("[data-focusleft]")));
  await page.evaluate(() => { D.ui.focus.running = false; D.ui.focus.left = 25 * 60; });
  await page.screenshot({ path: path.join(SHOTS, "m03-mini-work.png") });
  // resize it bigger: more fits, the size is kept, it stays in its corner
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(560, 460); w.emit("resized"); });
  await wait(1000);
  s = await state();
  ok("mini: resizable and stays in its corner", s.b.width === 560 && s.b.height === 460 && s.b.x + s.b.width === s.a.x + s.a.width - 12, JSON.stringify(s.b));
  ok("mini: a bigger mini shows more keys", (await page.$$(".minip .mk")).length > 6, (await page.$$(".minip .mk")).length);
  await page.screenshot({ path: path.join(SHOTS, "m04-mini-big.png") });
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(320, 180); w.emit("resized"); });
  await wait(1000);
  ok("mini: a tiny mini still fits without spilling", await page.evaluate(() => { const m = document.querySelector(".minip"); return [...m.children].every((c) => c.getBoundingClientRect().bottom <= window.innerHeight + 1); }));
  await page.screenshot({ path: path.join(SHOTS, "m05-mini-tiny.png") });
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(440, 300); w.emit("resized"); });
  await wait(800);
  // pick what it shows
  await page.evaluate(() => window.panel.act("saveSettings", { miniFollow: false, miniParts: ["music", "keys"] })); await wait(1500);
  ok("mini: shows only what you picked", !(await page.$(".minip [data-act=focus]")));
  await page.evaluate(() => window.panel.act("saveSettings", { miniFollow: true })); await wait(800);
  await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(800);
  // drag it to the top-left: it snaps to that corner and remembers it
  await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const a = screen.getDisplayMatching(w.getBounds()).workArea; w.setPosition(a.x + 140, a.y + 90); w.emit("moved"); });
  await wait(800);
  s = await state();
  ok("mini: dropped near a corner, it snaps there", s.b.x === s.a.x + 12 && s.b.y === s.a.y + 12, JSON.stringify(s));
  // expand: the full panel, focusable, not on top
  await page.click("[data-act=expand]"); await wait(1500);
  s = await state();
  ok("expand: full panel as a normal window", s.b.width >= 720 && !s.top && s.focusable, JSON.stringify(s));
  ok("expand: full layout is back", !!(await page.$(".g6")));
  await page.click("[data-act=shrink]"); await wait(1200);
  // ask the AI without leaving the mini panel
  await page.click(".minip [data-act=miniAsk]"); await wait(600);
  s = await state();
  ok("mini: the ask box opens in the mini panel, ready to type", !!(await page.$(".minip #cmdText")) && s.focusable && s.b.width < 720);
  await page.fill(".minip #cmdText", "hello from mini"); await page.keyboard.press("Enter");
  let got = false; for (let i = 0; i < 30 && !got; i++) { await wait(500); got = /Echo: hello from mini/.test((await page.textContent(".minip").catch(() => "")) || ""); }
  ok("mini: the answer shows in the mini panel", got);
  await page.screenshot({ path: path.join(SHOTS, "m06-mini-ask.png") });
  await page.click(".minip [data-act=openThread]"); await wait(1500);
  s = await state();
  ok("mini: Open takes the chat to the full panel", (await page.evaluate(() => D.ui.sheet === "chat")) && s.b.width >= 720);
  await page.evaluate(() => closeSheet());
  await page.click("[data-act=shrink]"); await wait(1200);
  await page.evaluate(() => { D.ui.miniAsk = false; lastAppHTML = ""; render(); });
  await app.close();
  // it starts as mini again next time, in the same corner
  app = await launch(); page = await app.firstWindow(); await page.waitForSelector(".minip, .top", { timeout: 30000 }); await wait(4000);
  s = await state();
  ok("mini: comes back as mini in the same corner after a restart", s.b.width === 440 && s.b.height === 300 && s.top && !s.focusable && s.b.x === s.a.x + 12 && s.b.y === s.a.y + 12, JSON.stringify(s));
  await page.evaluate(() => H.expand()); await wait(800);
  ok("no page errors (mini)", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
