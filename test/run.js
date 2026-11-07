// Drives the real app like a user: launches it, taps through screens, fakes Claude Code events, saves screenshots.
// Usage: node test/run.js [scenario...]   Screenshots go to test/shots.
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");

const SHOTS = path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const want = process.argv.slice(2);
const on = (n) => !want.length || want.includes(n);
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + note : "")); console.log(log[log.length - 1]); };

const env = Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832" });
async function launch(extra) {
  const exe = process.env.PANEL_EXE;
  const app = exe
    ? await electron.launch({ env, executablePath: exe, args: ["--test", "--windowed"].concat(extra || []) })
    : await electron.launch({ env, args: [path.join(__dirname, ".."), "--test", "--windowed"].concat(extra || []), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top, .sheet", { timeout: 20000 });
  // whatever is full screen on this PC right now must not switch layouts mid-test
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } })).catch(() => { });
  await wait(2500);
  return { app, page, errors };
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
const tap = (page, sel) => page.click(sel, { timeout: 5000 });
const hook = (page, ev, body) => page.evaluate(([e, b]) => { window.__last = window.panel.testHook(e, b); return true; }, [ev, body]);

(async () => {
  const fresh = path.join(require("os").tmpdir(), "side-panel-test");
  (() => { const d = fresh; try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(d) ? fs.readdirSync(d) : [])) try { fs.rmSync(require("path").join(d, f), { recursive: true, force: true }); } catch { } } })();

  if (on("setup")) {
    const { app, page, errors } = await launch(["--setup"]);
    await shot(page, "01-setup-1");
    ok("setup shows", await page.$(".sheet h2") !== null);
    for (let i = 0; i < 60 && !(await page.$("[data-act=setupApp]")); i++) await wait(1000);
    const picked = await page.$$eval("[data-act=setupApp].sel", (x) => x.length);
    ok("setup: suggests your most-used apps, already picked", picked > 0, picked + " picked");
    await shot(page, "01b-setup-apps");
    await tap(page, "[data-act=setupNext]"); await wait(800); await shot(page, "02-setup-2");
    ok("setup: suggests layouts from templates", (await page.$$("[data-act=setupTpl]")).length >= 5 && (await page.$$("[data-act=setupTpl].sel")).length >= 1);
    await tap(page, "[data-act=setupNext]"); await wait(800); await shot(page, "03-setup-3");
    ok("setup: suggests Mini on a PC without a touch screen", await page.evaluate(() => D.ui.setup.screen === "mini"));
    await tap(page, "[data-act=setupScreen][data-arg*='window']"); await wait(300);
    await tap(page, "[data-act=setupNext]"); await wait(1500); await shot(page, "04-after-setup");
    ok("setup: your picked apps became keys", await page.evaluate((n) => D.cfg.keySets.home.filter((k) => k.action.type === "app").length >= n, picked));
    ok("setup closes to a layout", (await page.$(".g6 .w")) !== null);
    ok("no page errors (setup)", errors.length === 0, errors.slice(0, 3).join(" | "));
    await app.close();
    (() => { const d = fresh; try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(d) ? fs.readdirSync(d) : [])) try { fs.rmSync(require("path").join(d, f), { recursive: true, force: true }); } catch { } } })();
  }

  const { app, page, errors } = await launch();
  if (on("home")) {
    await shot(page, "10-home-light");
    ok("home has widgets", (await page.$$(".g6 .w")).length >= 4);
    await page.evaluate(() => H.themeFlip()); await wait(600); await shot(page, "11-home-dark"); await page.evaluate(() => H.themeFlip()); await wait(400);
  }
  if (on("claude")) {
    const sid = "test-session-1";
    await hook(page, "UserPromptSubmit", { session_id: sid, cwd: "C:\\Users\\me\\projects\\salflix-web", prompt: "Fix the subtitle delay on the TV app" });
    await hook(page, "PostToolUse", { session_id: sid, cwd: "C:\\Users\\me\\projects\\salflix-web", tool_name: "TodoWrite", tool_input: { todos: [{ content: "Find the cause", status: "completed" }, { content: "Fix player.js", status: "completed" }, { content: "Run the tests", status: "in_progress" }, { content: "Check the TV app", status: "pending" }, { content: "Write a summary", status: "pending" }] } });
    await hook(page, "PostToolUse", { session_id: sid, cwd: "C:\\Users\\me\\projects\\salflix-web", tool_name: "Edit", tool_input: { file_path: "C:\\x\\player.js" } });
    await hook(page, "PreToolUse", { session_id: sid, cwd: "C:\\Users\\me\\projects\\salflix-web", tool_name: "Bash", tool_input: { command: "npm test", description: "the tests" } });
    await hook(page, "UserPromptSubmit", { session_id: "s2", cwd: "C:\\Users\\me\\projects\\wwe-mod-index", prompt: "Add the new mods" });
    await hook(page, "Stop", { session_id: "s2", cwd: "C:\\Users\\me\\projects\\wwe-mod-index", last_assistant_message: "Added 41 new mods to the index and rebuilt the search page. All checks pass." });
    await wait(1500);
    await shot(page, "20-ai-widget");
    const data = await page.evaluate(() => (D.claude.sessions || []).map((s) => s.project + ":" + s.done + "/" + s.total));
    ok("AI sessions include hook sessions", data.some((x) => x.startsWith("salflix-web")) && data.some((x) => x.startsWith("wwe-mod-index")), data.slice(0, 6).join(" "));
    ok("plan progress tracked", data.includes("salflix-web:2/5"));
    // approval
    await hook(page, "PermissionRequest", { session_id: "s3", cwd: "C:\\Users\\me\\projects\\daily-brief", tool_name: "Bash", tool_input: { command: "node send-brief.js --evening --to discord", description: "send the evening brief" } });
    await wait(1500);
    await shot(page, "21-approval-card");
    ok("approval card shows", (await page.$(".att")) !== null);
    await tap(page, ".att [data-act=approve]");
    await wait(300);
    const reply = await page.evaluate(() => window.__last);
    ok("allow returns the right hook answer", /"behavior":"allow"/.test(reply || ""), String(reply).slice(0, 120));
    await wait(1200);
    await page.evaluate(() => openSheet("sessions"));
    await wait(800);
    await shot(page, "22-sessions-sheet");
    await tap(page, ".sheet [data-act=closeSheet]"); await wait(400);
  }
  if (on("http")) {
    // Exactly what Claude Code does: POST the hook JSON to the panel and wait for the answer.
    const http = require("http");
    const post = (ev, body) => new Promise((res) => {
      const data = JSON.stringify(body);
      const req = http.request({ host: "127.0.0.1", port: 47831, path: "/hook/" + ev, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "X-Side-Panel-Token": fs.readFileSync(path.join(require("os").tmpdir(), "side-panel-test", "hook-token"), "utf8").trim() } }, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res({ status: r.statusCode, body: b })); });
      req.on("error", (e) => res({ status: 0, body: e.message }));
      req.end(data);
    });
    const r1 = await post("UserPromptSubmit", { session_id: "http-1", cwd: "C:\\work\\real-http-test", hook_event_name: "UserPromptSubmit", prompt: "Delete the temp files" });
    ok("http hook accepted", r1.status === 200, r1.body);
    const bad = await new Promise((res) => { const q = http.request({ host: "127.0.0.1", port: 47831, path: "/hook/UserPromptSubmit", method: "POST", headers: { "Content-Type": "application/json" } }, (r) => res(r.statusCode)); q.on("error", () => res(0)); q.end("{}"); });
    ok("hook without the secret is refused", bad === 403, String(bad));
    const pending = post("PermissionRequest", { session_id: "http-1", cwd: "C:\\work\\real-http-test", hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "rm -rf ./tmp", description: "delete the temp folder" } });
    await page.waitForSelector(".att", { timeout: 5000 }).catch(() => {});
    await wait(800);
    await shot(page, "25-http-approval");
    // the banner's countdown redraws it every second, so click by selector (re-found on each try), like a finger would
    await page.click(".att [data-act=approve][data-arg*='deny']", { timeout: 8000 }).catch(() => { });
    const r2 = await pending;
    ok("real http approval answered with deny", /"behavior":"deny"/.test(r2.body), r2.body.slice(0, 140));
  }
  if (on("custom")) {
    const wdir = path.join(require("os").tmpdir(), "side-panel-test", "widgets", "answer");
    fs.mkdirSync(wdir, { recursive: true });
    fs.writeFileSync(path.join(wdir, "widget.json"), JSON.stringify({ title: "Test widget", command: "cmd /c echo 42& echo lines from a script", interval: 10 }));
    await wait(6000);
    // like a user: hold to edit, remove a widget, add the custom one from the library, tap Done
    await page.evaluate(() => { D.ui.editing = D.cfg.activeLayout; render(); });
    await wait(300);
    await page.evaluate(() => { const L = D.cfg.layouts.find((l) => l.name === D.cfg.activeLayout); const v = L.widgets.find((w) => w.x >= 5 && w.y >= 3); if (v) H.removeWidget(v.id); });
    await wait(1500);
    await tap(page, "[data-act=sheet][data-arg='\"library\"']"); await wait(600);
    await shot(page, "43-library-with-custom");
    await tap(page, "[data-act=addWidget][data-arg='\"custom:answer\"']"); await wait(1500);
    await tap(page, "[data-act=editDone]"); await wait(2500);
    await wait(1500);
    const before = await page.textContent("#app");
    ok("custom widget waits for approval", before.includes("Allow it to run"), JSON.stringify(await page.evaluate(() => ({ custom: D.custom, layout: D.cfg.activeLayout, types: (D.cfg.layouts.find((l) => l.name === D.cfg.activeLayout).widgets || []).map((w) => w.type + ":" + w.x + "," + w.y) }))).slice(0, 400));
    await shot(page, "44-custom-before");
    await tap(page, "[data-act=approveWidget]");
    await wait(4000);
    await shot(page, "45-custom-widget");
    const after = await page.textContent("#app");
    ok("custom widget runs after approval", after.includes("42") && after.includes("lines from a script"));
  }
  if (on("drag")) {
    await page.evaluate(() => window.panel.act("setLayout", "Focus"));
    await wait(1500);
    await page.evaluate(() => { D.ui.editing = D.cfg.activeLayout; render(); });
    await wait(400);
    // Focus layout: focus(1,1,3,2) clock(4,1,3,2) keys(1,3,6,2). Remove clock, drag focus to the right half.
    await page.evaluate(() => { const L = D.cfg.layouts.find((l) => l.name === "Focus"); const c = L.widgets.find((w) => w.type === "clock"); H.removeWidget(c.id); });
    await wait(400);
    const box = await (await page.$(".w")).boundingBox();
    await page.mouse.move(box.x + 120, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(box.x + 420, box.y + 130, { steps: 8 });
    await page.mouse.move(box.x + 760, box.y + 130, { steps: 8 });
    await page.mouse.up();
    await wait(600);
    await shot(page, "55-after-drag");
    await tap(page, "[data-act=editDone]"); await wait(2500);
    const pos = await page.evaluate(() => { const w = D.cfg.layouts.find((l) => l.name === "Focus").widgets.find((x) => x.type === "focus"); return w.x + "," + w.y; });
    ok("dragged widget stays where you put it", pos === "4,1", pos);
  }
  if (on("homeshot")) {
    await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(2500);
    await page.evaluate(() => { D.cfg.theme = "dark"; render(); }); await wait(300); await shot(page, "12-home-real-dark");
    await page.evaluate(() => { D.cfg.theme = "light"; render(); }); await wait(300); await shot(page, "13-home-real-light");
    await page.evaluate(() => { D.cfg.theme = "auto"; render(); });
  }
  if (on("ambient")) {
    await page.evaluate(() => { D.ui.wakeUntil = 0; window.panel.testLive({ away: true }); });
    await wait(1500);
    const why = await page.evaluate(() => JSON.stringify({ sheet: D.ui.sheet, editing: D.ui.editing, urgent: (D.attention || []).filter((x) => x.urgent).map((x) => x.kind), away: D.live.away }));
    await shot(page, "80-ambient");
    ok("ambient screen shows", (await page.$(".ambient")) !== null, why);
    await page.evaluate(() => window.panel.testLive({ away: null }));
    await page.click(".ambient", { timeout: 3000 }).catch(() => { }); await wait(1500);
    ok("tap wakes the panel", (await page.$(".ambient")) === null);
  }
  if (on("logs")) {
    await page.evaluate(() => openSheet("sessions")); await wait(5000);
    await shot(page, "26-sessions-from-logs");
    const t = await page.textContent("#layer");
    ok("sessions from Claude Code logs show up", /Claude Code/.test(t) && /side-panel|Projects|stremio/i.test(t));
    await tap(page, ".sheet [data-act=closeSheet]"); await wait(300);
  }
  if (on("ask")) {
    await tap(page, ".top .askblink"); await wait(800);
    await page.fill("#cmdText", "Which is bigger, the sun or the moon? Answer with one word.");
    await shot(page, "30-ask");
    await page.keyboard.press("Enter");
    let ans = "";
    for (let i = 0; i < 120; i++) { ans = await page.evaluate(() => (document.querySelector(".cmd-answer") || {}).textContent || ""); if (/sun|sign in/i.test(ans) && !/Thinking/.test(ans)) break; await wait(1000); }
    await shot(page, "31-ask-answer");
    ok("quick question answered or explained", /sun|sign in again/i.test(ans || "") && !/Opening/.test(ans || ""), (ans || "").slice(0, 120));
    await page.evaluate(() => closeSheet()); await wait(400);
  }
  if (on("sheets")) {
    for (const s of ["settings", "layouts"]) {
      await page.evaluate((n) => { const b = document.createElement("button"); b.dataset.act = "sheet"; b.dataset.arg = JSON.stringify(n); document.body.appendChild(b); b.click(); b.remove(); }, s);
      await wait(800); await shot(page, "40-" + s);
      await tap(page, ".sheet [data-act=closeSheet]"); await wait(400);
    }
  }
  if (on("edit")) {
    await page.evaluate(() => { D.ui.editing = D.cfg.activeLayout; render(); });
    await wait(500); await shot(page, "50-edit");
    await tap(page, "[data-act=sheet][data-arg='\"library\"']"); await wait(600); await shot(page, "51-library");
    await tap(page, ".sheet [data-act=closeSheet]"); await wait(300);
    // add a key flow
    const addBtn = await page.$("[data-act=addKey]");
    if (addBtn) { await addBtn.click(); await page.waitForTimeout(4000); await shot(page, "52-addkey"); ok("add a key opens with a Close button", !!(await page.$(".sheet [data-act=closeSheet]"))); await page.evaluate(() => closeSheet()); }
    await page.evaluate(() => { D.ui.editing = null; render(); });
  }
  if (on("game")) {
    await page.evaluate(() => openSheet("game")); await wait(800);
    await page.mouse.click(640, 500); await wait(700); await page.mouse.click(640, 500); await wait(600);
    await shot(page, "60-game");
    await tap(page, ".sheet [data-act=closeSheet]");
  }
  if (on("layouts")) {
    await page.evaluate(() => { D.ui.layoutSel = "Work"; openSheet("layouts"); }); await wait(600);
    await tap(page, "[data-act=ruleAdd][data-arg*='time']"); await wait(800);
    await tap(page, "[data-act=ruleTime][data-arg*='\"from\"'][data-arg*='\"delta\":30']"); await wait(300);
    await tap(page, "[data-act=ruleTime][data-arg*='\"from\"'][data-arg*='\"delta\":30']"); await wait(300);
    await tap(page, "[data-act=ruleTime][data-arg*='\"to\"'][data-arg*='\"delta\":-30']"); await wait(1200);
    await shot(page, "71-time-rule");
    const tr = await page.evaluate(() => { const r = D.cfg.layouts.find((l) => l.name === "Work").rules.find((x) => x.type === "time"); return r && r.from + "-" + r.to; });
    ok("time rule hours can be changed", tr === "10:00-16:30", tr);
    const nBefore = await page.evaluate(() => D.cfg.layouts.length);
    await tap(page, "[data-act=layoutDelete]"); await wait(600);
    ok("delete needs a second tap", (await page.evaluate(() => D.cfg.layouts.length)) === nBefore);
    await wait(4500);
    ok("delete un-arms after a few seconds", (await page.evaluate(() => D.ui.armed)) === null);
    await tap(page, ".sheet [data-act=closeSheet]"); await wait(300);
    for (const t of ["Gaming", "Work", "Focus"]) {
      await page.evaluate((n) => window.panel.act("setLayout", n), t); await wait(1500); await shot(page, "70-layout-" + t);
    }
  }
  if (on("music")) {
    await page.evaluate(() => { closeSheet(); window.panel.act("setLayout", "Home"); }); await wait(1200);
    // a real app playing music, announced to Windows exactly like Spotify or a browser
    const { spawn } = require("child_process");
    const electronExe = require("electron");
    const src = spawn(electronExe, [path.join(__dirname, "media-source.js"), "Cold Heart - PNAU Remix", "Elton John"], { stdio: "ignore" });
    let cur = null;
    for (let i = 0; i < 20 && !(cur && cur.art); i++) { await wait(1500); cur = await page.evaluate(() => { const ss = (D.live.media && D.live.media.sessions) || []; const c = ss.find((x) => x.title === "Cold Heart - PNAU Remix" && /electron/i.test(x.app)); /* never the real Spotify */ return c ? { app: c.app, playing: c.playing, art: !!c.art, title: c.title } : null; }); }
    ok("music: playing track shows", !!cur, JSON.stringify(cur));
    ok("music: album cover shows", !!(cur && cur.art));
    if (cur) await page.evaluate((a) => window.panel.act("mediaSource", a), cur.app);
    await wait(2500);
    await shot(page, "90-music-widget");
    const look = await page.evaluate(() => { const m = document.querySelector(".mus"); return m ? { art: m.classList.contains("art"), bg: !!m.querySelector(".mbg"), mc: getComputedStyle(m).getPropertyValue("--mc").trim() } : null; });
    ok("music: cover fills the widget behind the song", !!(look && look.art && look.bg), JSON.stringify(look));
    ok("music: accent colour taken from the cover", !!(look && look.mc && look.mc !== "134,168,255"), look && look.mc);
    if (cur) {
      await page.evaluate((a) => window.panel.act("mediaSource", a), cur.app);
      await page.evaluate((a) => window.panel.act("media", { action: "pause", app: a }), cur.app); await wait(2500);
      const paused = await page.evaluate((a) => { const c = (D.live.media.sessions || []).find((x) => x.app === a); return c && c.playing; }, cur.app);
      ok("music: pause works", paused === false);
      await page.evaluate((a) => window.panel.act("media", { action: "play", app: a }), cur.app); await wait(2500);
      const playing = await page.evaluate((a) => { const c = (D.live.media.sessions || []).find((x) => x.app === a); return c && c.playing; }, cur.app);
      ok("music: play works after the cover was read", playing === true);
    const w1 = await page.evaluate(() => parseFloat((document.querySelector(".mus [data-prog]") || {}).style.width || "0"));
    await wait(2000);
    const w2 = await page.evaluate(() => parseFloat((document.querySelector(".mus [data-prog]") || {}).style.width || "0"));
    ok("music: progress moves smoothly between updates", w2 > w1, w1 + " -> " + w2);
    ok("music: sound level reaches the panel", await page.evaluate(() => typeof Music.level === "number" && Music.levelsSeen > 5));
    }
    // back to the song with lyrics, then the big player
    await page.evaluate(() => openSheet("music"));
    for (let i = 0; i < 15 && !(await page.evaluate(() => !!(D.live.lyrics && D.live.lyrics.synced && D.live.lyrics.synced.length))); i++) await wait(1000);
    await wait(800);
    ok("music sheet: synced lyrics show", await page.evaluate(() => document.querySelectorAll("#lyr [data-l]").length > 10), await page.evaluate(() => JSON.stringify(D.live.lyrics || {}).slice(0, 120)));
    ok("music sheet: current lyric line is lit", await page.evaluate(() => !!document.querySelector("#lyr .on")) || await page.evaluate(() => (D.live.media.sessions.find((x) => x.app === D.mediaApp) || {}).pos < 10));
    await shot(page, "91-music-sheet");
    // tap the middle of the progress bar: the song jumps there
    const bar = await page.$(".stage [data-seek]");
    if (bar && cur) {
      const b = await bar.boundingBox();
      await page.mouse.click(b.x + b.width * 0.5, b.y + b.height / 2); await wait(2500);
      const pos = await page.evaluate((a) => (D.live.media.sessions.find((x) => x.app === a) || {}).pos, cur.app);
      ok("music: tapping the bar jumps in the song", pos > 85 && pos < 120, "pos " + pos);
    } else ok("music: tapping the bar jumps in the song", false, "no seek bar");
    if (cur) {
      await page.evaluate((a) => window.panel.act("media", { action: "next", app: a }), cur.app); await wait(2500);
      const nt = await page.evaluate((a) => ((D.live.media.sessions || []).find((x) => x.app === a) || {}).title, cur.app);
      ok("music: next track works", nt === "Next Song", nt);
    }
    await page.click("[data-act=musTab][data-arg*='sources']"); await wait(600);
    ok("music sheet shows sources", /Next Song|Cold Heart/.test(await page.textContent(".mpane")));
    await shot(page, "91b-music-sources");
    await page.click("[data-act=musTab][data-arg*='playlists']"); await wait(600);
    // playlists: paste a link, it becomes one tap, it survives a reload
    await page.fill("#plUrl", "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
    await page.fill("#plName", "Today's Top Hits");
    await tap(page, "[data-act=addPlaylist]"); await wait(1200);
    await page.fill("#plUrl", "javascript:alert(1)"); await tap(page, "[data-act=addPlaylist]"); await wait(800);
    const pls = await page.evaluate(() => D.cfg.playlists.map((p) => p.label + "|" + p.kind));
    ok("playlist added from a pasted link", pls.includes("Today's Top Hits|spotify"), pls.join(","));
    ok("unsafe link refused as a playlist", pls.length === 1);
    await shot(page, "92-music-playlists");
    await tap(page, ".sheet [data-act=closeSheet]"); await wait(300);
    try { require("child_process").execFileSync("taskkill", ["/PID", String(src.pid), "/T", "/F"], { stdio: "ignore" }); } catch { }
  }
  if (on("security")) {
    const r = await page.evaluate(async () => ({
      js: await window.panel.act("openUrl", "javascript:alert(1)"),
      file: await window.panel.act("openUrl", "file:///C:/Windows/System32/calc.exe"),
      keyObj: await window.panel.act("key", { action: { type: "open", target: "C:\\Windows\\System32\\calc.exe" } }),
      keyMissing: await window.panel.act("key", "no-such-key"),
      unknown: await window.panel.act("constructor"),
      proto: await window.panel.act("__proto__"),
      settings: await window.panel.act("saveSettings", { theme: "neon", ambientAfterMin: 9999, customWidgets: { evil: { command: "calc", hash: "x" } }, quotes: false }),
      layoutBad: await window.panel.act("setLayout", "<img src=x onerror=alert(1)>"),
      approveFake: await window.panel.act("approveWidget", { name: "..\\..\\evil", command: "calc" }),
      moveBad: await window.panel.act("moveToDisplay", "123456789")
    }));
    await wait(1500);
    ok("javascript: links refused", !!r.js.error, JSON.stringify(r.js));
    ok("file: links refused", !!r.file.error);
    ok("page can't launch arbitrary programs through a key", !!r.keyObj.error, JSON.stringify(r.keyObj));
    ok("unknown key refused", !!r.keyMissing.error);
    ok("inherited names aren't actions", !!r.unknown.error && !!r.proto.error);
    const cfgNow = await page.evaluate(() => ({ theme: D.cfg.theme, quotes: D.cfg.quotes, cw: D.cfg.customWidgets }));
    ok("bad settings values ignored, good ones kept", cfgNow.theme !== "neon" && cfgNow.quotes === false && cfgNow.cw === undefined, JSON.stringify(cfgNow));
    ok("unknown layout refused", !!r.layoutBad.error);
    ok("fake widget approval refused", !!r.approveFake.error);
    ok("unknown screen refused", !!r.moveBad.error);
    await page.evaluate(() => window.panel.act("saveSettings", { quotes: true }));
  }
  if (on("web")) {
    const http = require("http");
    const post = (p, headers, body) => new Promise((res) => {
      const q = http.request({ host: "127.0.0.1", port: 47832, path: p, method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers) }, (r) => { let d = ""; r.on("data", (c) => d += c); r.on("end", () => res({ code: r.statusCode, body: d })); });
      q.on("error", (e) => res({ code: 0, body: e.message })); q.end(JSON.stringify(body || {}));
    });
    const ext = { Origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop" };
    const evil = await post("/web/pair", { Origin: "https://evil.example" });
    ok("web pages can't pair with the panel", evil.code === 403, String(evil.code));
    const pairing = post("/web/pair", ext);
    await wait(2500);
    await shot(page, "95-browser-pair-ask");
    ok("pairing asks on the panel", (await page.$("[data-act=pairWeb]")) !== null);
    await tap(page, "[data-act=pairWeb][data-arg='true']");
    const pr = await pairing; let token = ""; try { token = JSON.parse(pr.body).token; } catch { }
    ok("allowing gives the extension a key", pr.code === 200 && !!token, pr.code + " " + pr.body.slice(0, 40));
    const noKey = await post("/web/status", ext, { site: "claude", state: "generating", title: "x", tab: 1 });
    ok("updates without the key refused", noKey.code === 401);
    const H = Object.assign({ "X-Side-Panel-Web": token }, ext);
    await post("/web/status", H, { site: "claude", state: "generating", title: "Trip plan for Istanbul - Claude", tab: 7 });
    await post("/web/status", H, { site: "chatgpt", state: "done", title: "ChatGPT", tab: 8 });
    await wait(1500);
    const s1 = await page.evaluate(() => (D.claude.sessions || []).filter((s) => s.source === "web").map((s) => s.project + ":" + s.state));
    ok("browser tab writing shows as working", s1.includes("Trip plan for Istanbul:working"), s1.join(","));
    ok("a tab that was never writing isn't 'your turn'", !s1.some((x) => /ChatGPT:yourturn/.test(x)));
    await post("/web/status", H, { site: "claude", state: "done", title: "Trip plan for Istanbul - Claude", tab: 7 });
    await wait(1500);
    const s2 = await page.evaluate(() => (D.claude.sessions || []).filter((s) => s.source === "web").map((s) => s.project + ":" + s.state));
    ok("finished reply shows as your turn", s2.includes("Trip plan for Istanbul:yourturn"), s2.join(","));
    await page.evaluate(() => openSheet("sessions")); await wait(800); await shot(page, "96-sessions-with-web");
    await tap(page, ".sheet [data-act=closeSheet]"); await wait(300);
    await post("/web/status", H, { state: "closed", tab: 7 }); await wait(1200);
    const s3 = await page.evaluate(() => (D.claude.sessions || []).filter((s) => s.source === "web").map((s) => s.project));
    ok("closing the tab removes it", !s3.includes("Trip plan for Istanbul"), s3.join(","));
    await page.evaluate(() => openSheet("browser")); await wait(600); await shot(page, "97-browser-setup"); await tap(page, ".sheet [data-act=closeSheet]");
  }
  ok("no page errors (main)", errors.length === 0, errors.slice(0, 5).join(" | "));
  await app.close();
  if (on("recover")) {
    // a broken config file must not stop the panel; it's kept as a backup
    fs.writeFileSync(path.join(fresh, "config.json"), "{ this is not json");
    const L = await launch();
    ok("broken config: panel still opens", (await L.page.$$(".g6 .w")).length >= 3);
    ok("broken config kept as a backup", fs.readdirSync(fresh).some((f) => f.startsWith("config.json.broken-")));
    await L.app.close();
  }
  console.log(log.join("\n"));
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
