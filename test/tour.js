// Screenshots of every everyday screen, light and dark, for a usability pass. Usage: node test/tour.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const OUT = path.join(__dirname, "shots", "tour");
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(path.join(os.tmpdir(), "side-panel-test")) ? fs.readdirSync(path.join(os.tmpdir(), "side-panel-test")) : [])) try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  const env = Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd") });
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env, executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed"]), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForSelector(".top", { timeout: 30000 });
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  await wait(6000);
  const cover = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "build", "cover.png")).toString("base64");
  await page.evaluate((c) => window.panel.testLive({ media: { available: true, sessions: [{ app: "Spotify.exe", name: "Spotify", title: "Nights", artist: "Frank Ocean", album: "Blonde", playing: true, canNext: true, canPrev: true, canSeek: true, canShuffle: true, canRepeat: true, shuffle: false, repeat: "list", pos: 74, dur: 307, at: Date.now(), updatedAt: Date.now(), current: true, art: c, artKey: "s" }] } }), cover);
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png") });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => window.panel.act("saveSettings", { theme: t }), theme); await wait(1200);
    for (const L of ["Home", "Work", "Gaming", "Focus"]) { await page.evaluate((l) => window.panel.act("setLayout", l), L); await wait(1500); await shot(`${theme}-layout-${L}`); }
    await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(800);
    for (const s of ["ask", "sessions", "settings", "layouts", "music", "addKey", "library", "build", "browser"]) { await page.evaluate((x) => openSheet(x), s); await wait(900); await shot(`${theme}-sheet-${s}`); await page.evaluate(() => closeSheet()); }
    await page.evaluate(() => { D.ui.addKey.tab = "people"; openSheet("addKey"); }); await wait(500); await shot(`${theme}-addkey-people`);
    await page.evaluate(() => { D.ui.addKey.tab = "shortcuts"; openSheet("addKey"); }); await wait(500); await shot(`${theme}-addkey-shortcuts`);
    await page.evaluate(() => closeSheet());
    await page.evaluate(() => { D.ui.editing = D.cfg.activeLayout; render(); }); await wait(600); await shot(`${theme}-edit-mode`);
    await page.evaluate(() => { D.ui.editing = null; render(); }); await wait(400);
  }
  await page.evaluate(() => window.panel.act("saveSettings", { theme: "light" }));
  // a chat with steps
  await page.evaluate(() => { D.ui.ask.thread = null; openSheet("ask"); }); await wait(300);
  await page.fill("#askText", "TOOL check my notes"); await page.click("[data-act=askSend]"); await wait(4000); await shot("light-ask-answer");
  await page.evaluate(() => H.openThread(D.ui.ask.thread)); await wait(1200); await shot("light-chat");
  await page.evaluate(() => closeSheet());
  await page.evaluate(() => window.panel.testLive({ away: true })); await wait(1500); await shot("light-ambient");
  await app.close();
  console.log("shots in", OUT, fs.readdirSync(OUT).length);
})().catch((e) => { console.error("TOUR CRASH", e); process.exit(1); });
