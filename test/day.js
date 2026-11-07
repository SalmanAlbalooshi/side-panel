// A day at work and a day at home, played through the real app with faked live data (meeting, music, a game,
// approvals) so every moment can be checked and screenshotted. Usage: node test/day.js [work|home]
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");

const SHOTS = path.join(__dirname, "shots", "day");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const want = process.argv.slice(2);
const on = (n) => !want.length || want.includes(n);
const log = [];
const ok = (name, cond, note) => log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + note : ""));
const cover = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "build", "cover.png")).toString("base64");

async function launch() {
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832" }), args: [path.join(__dirname, ".."), "--test", "--windowed"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 20000 });
  await wait(2000);
  return { app, page, errors };
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
const live = (page, patch) => page.evaluate((p) => window.panel.testLive(p), patch);
const hook = (page, ev, body) => page.evaluate(([e, b]) => { window.__last = window.panel.testHook(e, b); return true; }, [ev, body]);
const text = (page) => page.textContent("body");
const notGame = { fullscreen: false, app: "explorer", title: "" };

(async () => {
  (() => { const d = path.join(require("os").tmpdir(), "side-panel-test"); try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(d) ? fs.readdirSync(d) : [])) try { fs.rmSync(require("path").join(d, f), { recursive: true, force: true }); } catch { } } })();
  const { app, page, errors } = await launch();
  // the real PC may have a game open full screen; the day starts at the desk
  await live(page, { fg: notGame });

  if (on("work")) {
    await page.evaluate(() => window.panel.act("setLayout", "Work")); await wait(1200);
    // 08:52, a Teams meeting in 8 minutes
    const start = new Date(Date.now() + 8 * 60000), end = new Date(Date.now() + 38 * 60000);
    await live(page, { meeting: { available: true, meetings: [{ subject: "Quarterly plan: final review", start: start.toISOString(), end: end.toISOString(), location: "Teams", join: "https://teams.microsoft.com/l/meetup-join/test" }] } });
    for (let i = 0; i < 20 && !(await page.$(".att")); i++) await wait(300);
    await wait(300); await shot(page, "w01-meeting-soon");
    ok("work: meeting banner shows 8 min before", /Meeting in [78] min/.test(await text(page)));
    ok("work: Join button on the banner", (await page.$(".att [data-act=openUrl]")) !== null);
    await page.click(".att [data-act=dismissAtt]"); await wait(1500);
    ok("work: Later hides the banner", (await page.$(".att")) === null);
    ok("work: meeting widget still shows it", /Quarterly plan/.test(await text(page)));
    // hide titles for screen sharing
    await page.evaluate(() => window.panel.act("saveSettings", { hideMeetingTitles: true })); await wait(1500);
    await shot(page, "w02-titles-hidden");
    ok("work: meeting titles hidden when asked", !/Quarterly plan/.test(await page.textContent(".g6")));
    await page.evaluate(() => window.panel.act("saveSettings", { hideMeetingTitles: false }));

    // 10:15, Claude Code is working on a script and asks to run a command
    const sid = "work-1", cwd = "C:\\Users\\me\\work\\budget-report";
    await hook(page, "UserPromptSubmit", { session_id: sid, cwd, prompt: "Update the budget report numbers from the tracker" });
    await hook(page, "PostToolUse", { session_id: sid, cwd, tool_name: "TodoWrite", tool_input: { todos: [{ content: "Read the tracker", status: "completed" }, { content: "Recalculate hours", status: "in_progress" }, { content: "Update the deck", status: "pending" }] } });
    await page.evaluate(([sid, cwd]) => { window.__ap = window.panel.testHook("PermissionRequest", { session_id: sid, cwd, tool_name: "Bash", tool_input: { command: "python recalc.py --month 10", description: "recalculate October" } }); }, [sid, cwd]);
    await wait(1500); await shot(page, "w03-approval");
    ok("work: approval banner appears", (await page.$(".att [data-act=approve]")) !== null);
    await page.click(".att [data-act=approve][data-arg*='allow']");
    const ans = await page.evaluate(() => window.__ap);
    ok("work: Allow sends allow to Claude Code", /"behavior":"allow"/.test(ans || ""), ans);
    await wait(800);
    ok("work: banner clears after answering", (await page.$(".att [data-act=approve]")) === null);

    // things that need a look, each with a fix button
    await live(page, { tasks: [{ name: "Daily Brief PDF", when: new Date(Date.now() - 3600000).toISOString(), code: 1 }], disks: [{ drive: "C:", pctFree: 4, freeGB: 8, totalGB: 930 }] });
    await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(1500);
    await shot(page, "w04-needs-a-look");
    const needs = await page.evaluate(() => [...document.querySelectorAll("[data-act=attAction]")].map((b) => b.textContent));
    ok("work: failed automation and full disk each have a fix", needs.some((t) => /Task Scheduler/.test(t)) && needs.some((t) => /Free up space/.test(t)), needs.join(" | "));
    await page.click("[data-act=dismissAtt][data-arg*='disk']"); await wait(1500);
    ok("work: hiding an item for a day works", !/drive is almost full/.test(await text(page)));

    // 12:30, lunch: the panel goes calm, AI work still visible
    await live(page, { away: true }); await wait(1500);
    await shot(page, "w05-lunch-ambient");
    ok("work: calm screen while away", (await page.$(".ambient")) !== null);
    ok("work: AI work visible on the calm screen", /budget-report/.test(await text(page)));
    // the session finishes while you're away
    await hook(page, "Stop", { session_id: sid, cwd, last_assistant_message: "October budget recalculated. 3 slides updated." });
    await wait(1500);
    await live(page, { away: null }); await wait(1500);
    await page.click("body").catch(() => { });
    await wait(800); await shot(page, "w06-back-from-lunch");
    ok("work: finished work waits for you", /budget-report/.test(await text(page)) && /(Your turn|finished)/i.test(await text(page)));

    // 15:00, focus block
    await page.evaluate(() => window.panel.act("setLayout", "Focus")); await wait(1200);
    const fb = await page.$("[data-act=focus][data-arg*='start']");
    if (fb) { await fb.click(); await wait(1200); }
    await shot(page, "w07-focus");
    ok("work: focus timer runs", await page.evaluate(() => D.ui.focus.running === true));
    await page.evaluate(() => { D.ui.focus.running = false; });
    await live(page, { meeting: null, tasks: null, disks: null });
  }

  if (on("home")) {
    await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(1000);
    // 19:00, music from Spotify while a YouTube tab is paused
    const sessions = [
      { app: "Spotify.exe", name: "Spotify", title: "Nights", artist: "Frank Ocean", album: "Blonde", playing: true, canNext: true, canPrev: true, pos: 74, dur: 307, current: true, artKey: "s1" },
      { app: "chrome", name: "Chrome", title: "Lo-fi beats to study to", artist: "Lofi Girl", album: "", playing: false, canNext: false, canPrev: false, pos: 0, dur: 0, current: false, artKey: "c1" }
    ];
    await live(page, { media: { available: true, sessions: sessions.map((s, i) => Object.assign({ art: i === 0 ? cover : null }, s)) } });
    await page.evaluate(() => window.panel.act("mediaSource", null));
    await wait(1500); await shot(page, "h01-music");
    ok("home: song, artist and cover show", /Nights/.test(await text(page)) && /Frank Ocean/.test(await text(page)) && (await page.$(".w img[alt='']")) !== null);
    // switch to the other source from the chip
    await page.click(".chip"); await wait(1000);
    await shot(page, "h02-music-sheet");
    ok("home: music sheet lists both sources", /Spotify/.test(await page.textContent("#layer")) && /Chrome/.test(await page.textContent("#layer")));
    await page.click("#layer [data-act=mediaSource][data-arg*='chrome']"); await wait(1500);
    ok("home: switching source works", /Lo-fi beats/.test(await page.textContent("#layer .stage")));
    // a playlist from a pasted link, then dropped from the browser
    await page.click("[data-act=musTab][data-arg*='playlists']"); await wait(500);
    await page.fill("#plUrl", "https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i");
    await page.click("[data-act=addPlaylist]"); await wait(1200);
    await shot(page, "h03-playlist-added");
    ok("home: YouTube Music playlist added", await page.evaluate(() => D.cfg.playlists.some((p) => p.kind === "youtube" && p.kindLabel === "YouTube Music")));
    await page.click(".sheet [data-act=closeSheet]"); await wait(500);
    await page.evaluate(() => window.panel.act("mediaSource", "Spotify.exe"));

    // 21:00, a game goes full screen
    await live(page, { fg: { fullscreen: true, app: "SparkingZERO-Win64-Shipping", title: "DRAGON BALL Sparking! ZERO", path: "G:\\SteamLibrary\\steamapps\\common\\DRAGON BALL Sparking! ZERO\\SparkingZERO\\Binaries\\Win64\\SparkingZERO-Win64-Shipping.exe" } }); await wait(2500);
    await shot(page, "h04-game");
    ok("home: game switches to the Gaming layout", await page.evaluate(() => D.cfg.activeLayout === "Gaming"));
    ok("home: game stats show GPU or CPU", /CPU/.test(await page.textContent(".g6")));
    // Claude Code asks for something during the game: the banner still shows (work is blocked), no chime
    await page.evaluate(() => { window.__chimes = 0; const o = window.AudioContext; window.AudioContext = function () { window.__chimes++; return new o(); }; });
    await page.evaluate(() => { window.__ap2 = window.panel.testHook("PermissionRequest", { session_id: "home-1", cwd: "C:\\Users\\me\\mods\\wwe", tool_name: "Write", tool_input: { file_path: "C:\\mods\\wwe\\attire.json" } }); });
    await wait(1500); await shot(page, "h05-approval-in-game");
    ok("home: approval still shows in a game", (await page.$(".att [data-act=approve]")) !== null);
    ok("home: no chime during a game", await page.evaluate(() => window.__chimes === 0));
    await page.click(".att [data-act=approve][data-arg*='null']");
    ok("home: 'Answer in terminal' leaves it to the terminal", (await page.evaluate(() => window.__ap2)) === "{}");
    // the game closes
    await live(page, { fg: notGame }); await wait(2500);
    ok("home: back to Home after the game", await page.evaluate(() => D.cfg.activeLayout === "Home"), await page.evaluate(() => D.cfg.activeLayout));
    ok("home: game stats say Not playing after the game closes", /Not playing/.test(await page.evaluate(() => W.gamestats.render({ w: 3, h: 2, opts: {} }, D))));
    // a full-screen video or slideshow, GPU quiet: not a game
    await live(page, { stats: { cpu: 8, gpu: { util: 6, temp: 45, name: "RTX" } }, fg: { fullscreen: true, app: "Video.UI", title: "Movies", path: "C:\\Program Files\\WindowsApps\\Video.UI.exe" } }); await wait(2500);
    ok("home: a full-screen video doesn't switch to Gaming", await page.evaluate(() => D.cfg.activeLayout !== "Gaming"), await page.evaluate(() => D.cfg.activeLayout));
    await live(page, { stats: null, fg: notGame }); await wait(1500);
    // picking a layout by hand sticks until the situation changes
    await page.evaluate(() => window.panel.act("setLayout", "Focus")); await wait(2500);
    ok("home: a layout you pick stays", await page.evaluate(() => D.cfg.activeLayout === "Focus"));
    await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(1000);

    // 23:30, dark and quiet
    await page.evaluate(() => window.panel.act("saveSettings", { theme: "dark" })); await wait(1500);
    await shot(page, "h06-night-dark");
    await live(page, { away: true }); await wait(1500);
    await shot(page, "h07-night-ambient");
    ok("home: calm screen shows the song", /Nights/.test(await text(page)));
    await live(page, { away: null, media: null, fg: null });
    await page.evaluate(() => window.panel.act("saveSettings", { theme: "auto" }));
  }

  ok("no page errors (day)", errors.length === 0, errors.slice(0, 5).join(" | "));
  await app.close();
  console.log(log.join("\n"));
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); console.log(log.join("\n")); process.exit(1); });
