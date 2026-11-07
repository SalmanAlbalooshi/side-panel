// The four fixes from the last round: seeking, Mini's player, typing in Settings, where the panel lives.
// Never touches real music, volume or the mic (test mode records them). Usage: node test/fixes.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const SHOTS = path.join(__dirname, "shots", "fixes"); fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
async function until(page, fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await wait(250); } return false; }
(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832" }), executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"]), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); page.screenshot = ((o) => (opts) => o(Object.assign({ timeout: 8000 }, opts || {})).catch(() => null))(page.screenshot.bind(page)); page.click = ((orig) => async (sel, o) => { try { await orig(sel, Object.assign({ timeout: 5000 }, o || {})); } catch { await page.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("no " + s); if (e.focus) e.focus(); e.click(); }, sel); } })(page.click.bind(page)); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".top", { timeout: 30000 });
  const song = { app: "Spotify.exe", name: "Spotify", title: "Big Iron", artist: "Marty Robbins", dur: 236, pos: 60, canSeek: true, playing: true, at: Date.now(), updatedAt: Date.now() };
  await page.evaluate((s) => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" }, media: { sessions: [s] } }), song);
  await wait(2000);
  const sent = async () => (await page.evaluate(() => window.panel.testState())).sent;

  // 1. seeking: hold and drag, then let go
  await page.evaluate(() => H.musicOpen("")); await wait(800);
  const bar = await page.$(".prog.big[data-seek]");
  ok("player opens with a seek bar", !!bar);
  const b = await bar.boundingBox();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(b.x + b.width * (0.2 + i * 0.05), b.y + b.height / 2); await wait(60); }
  // a refresh in the middle of the drag must not break it
  await page.evaluate(() => drawSheet()); await page.mouse.move(b.x + b.width * 0.75, b.y + b.height / 2); await wait(100);
  const tip = await page.evaluate(() => (document.querySelector(".scrubtip") || {}).textContent || "");
  await page.mouse.up(); await wait(400);
  const seek = (await sent()).filter((x) => /^media seek/.test(x)).pop() || "";
  const at = Number((seek.match(/seek (\d+)/) || [])[1]);
  ok("dragging shows the time under your finger and survives a refresh", /\d:\d\d/.test(tip), tip);
  ok("letting go jumps to where you dragged (about 3/4 of the song)", at > 236 * 0.65 && at < 236 * 0.85, seek);
  // the music app reports the old position for a moment: the bar must not jump back
  await page.evaluate((s) => window.panel.testLive({ media: { sessions: [Object.assign({}, s, { pos: 60, at: Date.now(), updatedAt: Date.now() })] } }), song); await wait(1200);
  ok("the bar doesn't snap back while the music app catches up", await page.evaluate(() => { const c = curMedia(D); return c && c.pos > 150; }), await page.evaluate(() => curMedia(D).pos));
  await page.mouse.click(b.x + b.width * 0.1, b.y + b.height / 2); await wait(300);
  ok("a single tap jumps too", /^media seek \d+/.test((await sent()).filter((x) => /^media seek/.test(x)).pop() || "") && Number(((await sent()).filter((x) => /^media seek/.test(x)).pop().match(/seek (\d+)/) || [])[1]) < 40);
  await page.keyboard.press("ArrowRight"); await wait(200);
  ok("arrow keys jump 10 seconds", /^media seek \d+/.test((await sent()).filter((x) => /^media seek/.test(x)).pop() || ""));
  await page.screenshot({ path: path.join(SHOTS, "f1-seek.png") });
  await page.evaluate(() => closeSheet());

  // 2. Mini: the player works and tapping the song doesn't get stuck
  await page.evaluate(() => H.shrink()); await wait(1500);
  await page.evaluate(() => document.querySelector(".minip [data-act=media][data-arg*='toggle']").click()); await wait(300);
  ok("Mini: play/pause works", (await sent()).some((x) => /^media toggle/.test(x)));
  await page.evaluate(() => document.querySelector(".minip [data-act=musicOpen]").click()); await until(page, () => !D.mini && D.ui.sheet === "music" && !!document.querySelector(".prog.big"), 5000);
  ok("Mini: tapping the song opens the full player (not stuck)", await page.evaluate(() => !D.mini && D.ui.sheet === "music" && !!document.querySelector(".prog.big")));
  await page.screenshot({ path: path.join(SHOTS, "f2-mini-to-player.png"), timeout: 8000 }).catch(() => { });
  await page.evaluate(() => closeSheet());

  // 3. typing your name in Settings isn't reset by refreshes
  await page.evaluate(() => openSheet("settings")); await wait(600);
  await page.click("#setName"); await page.keyboard.type("Al", { delay: 40 });
  await page.evaluate(() => drawSheet()); await page.evaluate(() => drawSheet());
  await page.keyboard.type("ex", { delay: 40 });
  ok("Settings: what you type survives refreshes", (await page.inputValue("#setName")) === "Alex", await page.inputValue("#setName"));
  await page.keyboard.press("Enter"); await wait(500);
  ok("Settings: Enter saves the name", await page.evaluate(() => D.cfg.userName === "Alex"));
  await page.evaluate(() => closeSheet());

  // 4. where the panel lives: full screen on a screen, then Mini, then a window, without closing
  const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map((d) => ({ id: String(d.id), primary: d.id === screen.getPrimaryDisplay().id })));
  const pid = (await app.evaluate(() => process.pid));
  await page.evaluate(() => openSheet("screens")); await wait(500);
  const t = await page.textContent("#layer");
  ok("Where the panel lives: window, Mini and each screen are offered", /A normal window/.test(t) && /Mini, in a corner/.test(t) && /full screen on a screen/.test(t), t.slice(0, 160));
  await page.evaluate(() => closeSheet());
  await page.evaluate((id) => window.panel.act("moveToDisplay", id), displays[0].id); await wait(1200);
  ok("full screen on a screen", await page.evaluate(() => D.sideScreen === true));
  ok("from full screen, Mini is still available", await page.evaluate(() => D.canMini === true));
  await page.evaluate(() => window.panel.act("setMini", true)); await wait(1500);
  ok("full screen -> Mini works", await page.evaluate(() => D.mini === true && D.sideScreen === false));
  await page.evaluate(() => window.panel.act("moveToDisplay", "window")); await wait(1500);
  ok("Mini -> normal window works", await page.evaluate(() => D.mini === false && D.sideScreen === false));
  ok("the app never closed while switching", (await app.evaluate(() => process.pid)) === pid && !!(await page.$(".top")));
  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
