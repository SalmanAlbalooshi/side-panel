// Screenshots for the README, made from demo data only (no real sessions, chats, files or names).
// Usage: node build/screenshots.js   -> docs/screenshots/*.png
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.join(__dirname, "..");
const out = path.join(root, "docs", "screenshots"); fs.mkdirSync(out, { recursive: true });

// a clean, empty home folder (so no real Claude sessions show) and demo chats
const demoHome = path.join(os.tmpdir(), "sp-demo-home"); fs.rmSync(demoHome, { recursive: true, force: true }); fs.mkdirSync(demoHome, { recursive: true });
const data = path.join(os.tmpdir(), "side-panel-test"); for (const f of ["config.json", "ai"]) { try { fs.rmSync(path.join(data, f), { recursive: true, force: true }); } catch { } } fs.mkdirSync(path.join(data, "ai"), { recursive: true });
const now = Date.now(), ago = (m) => now - m * 60000;
const card = (j) => "\n```blink-card\n" + JSON.stringify(j) + "\n```";
const chat = (id, title, mins, you, ai, extra) => ({ id, engine: "claude", kind: "chat", provider: "Claude Code", title, cwd: demoHome, mode: "ask", sessionId: "demo-" + id, state: "done", started: ago(mins), updated: ago(mins), cost: 0, extra: Object.assign({ blink: true }, extra || {}), messages: [{ role: "you", text: you, at: ago(mins) }, { role: "ai", at: ago(mins), parts: [{ type: "text", text: ai }] }] });
fs.writeFileSync(path.join(data, "ai", "chats.json"), JSON.stringify([
  chat("d1", "How did my week go on screen time?", 3, "How did my week go on screen time?", "You were on your PC **31 hours** this week, 4 less than last week. Most of it was work apps." + card({ type: "bar", title: "Hours this week", unit: "h", items: [["VS Code", 12], ["Chrome", 9], ["Teams", 6], ["Spotify", 4]] })),
  chat("d2", "Call: Is it going to rain this afternoon?", 40, "Is it going to rain this afternoon?", "Dry until about 2, then showers, heaviest around 3." + card({ type: "line", title: "Chance of rain", unit: "%", points: [["12pm", 10], ["1pm", 20], ["2pm", 45], ["3pm", 70], ["4pm", 55], ["5pm", 30]] }), { call: true }),
  chat("d3", "Pair my headphones", 95, "How do I pair my new headphones?", "Here's the quickest way:" + card({ type: "steps", title: "Pair Bluetooth headphones", steps: ["Hold the power button until the light flashes", "Open Bluetooth settings (I can open it for you)", "Tap Add device, then Bluetooth", "Pick your headphones from the list"] })),
  chat("d4", "Plan my afternoon", 180, "What's my afternoon look like?", "Two meetings and a free hour at 3." + card({ type: "timeline", title: "This afternoon", items: [["1:00", "Team check-in"], ["2:00", "Design review"], ["3:00", "Free, good for focus"], ["4:30", "Gym"]] }))
]));

(async () => {
  const app = await electron.launch({ env: Object.assign({}, process.env, { USERPROFILE: demoHome, HOME: demoHome, SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "..", "test", "fake-claude.cmd"), SP_CODEX: "none" }), args: [root, "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion"], cwd: root });
  const page = await app.firstWindow(); await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);
  const shot = async (name) => { for (let i = 0; i < 3; i++) { await wait(700); try { await page.screenshot({ path: path.join(out, name + ".png"), timeout: 12000 }); console.log("saved", name); return; } catch { await page.evaluate(() => { document.body.style.opacity = "0.999"; }).catch(() => { }); } } console.log("FAILED", name); };
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" }, media: { available: true, sessions: [{ app: "Spotify.exe", name: "Spotify", title: "Midnight City", artist: "M83", album: "Hurry Up, We're Dreaming", playing: true, canNext: true, canPrev: true, canSeek: true, pos: 96, dur: 243, at: Date.now(), current: true }] }, meeting: { available: true, meetings: [{ subject: "Design review", start: new Date(Date.now() + 25 * 60000).toISOString(), end: new Date(Date.now() + 55 * 60000).toISOString(), join: "https://teams.microsoft.com/l/meetup-join/demo" }] } }));
  await page.evaluate(() => window.panel.act("saveSettings", { userName: "Alex" }));
  // keys: only well-known apps show (this PC's own apps stay out of public screenshots); no real disk warnings
  await page.evaluate(() => { const known = /^(Steam|Discord|Spotify|Chrome|Edge|Firefox|VS Code|WhatsApp|Explorer|Claude Code|Teams|Outlook|Screenshot|Notepad|Calculator|Settings)\b/i; setInterval(() => { for (const k of document.querySelectorAll(".keys .k")) { const l = k.textContent.trim(); if (l && !known.test(l) && !k.classList.contains("dash")) k.remove(); } }, 50); });
  await page.evaluate(() => window.panel.testLive({ disks: [] }));
  for (const a of await page.evaluate(() => (D.attention || []).map((x) => x.key))) await page.evaluate((k) => window.panel.act("dismiss", { key: k, hours: 72 }), a).catch(() => { });
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => window.panel.act("saveSettings", { theme: t }), theme); await wait(800);
    await page.evaluate(() => closeSheet && closeSheet()); await shot("home-" + theme);
    // a call with a visual
    await page.evaluate(() => H.callStart()); await wait(800);
    await page.evaluate(() => { Call.lines = [{ who: "you", text: "Is it going to rain this afternoon?" }, { who: "blink", text: "Dry until about 2, then showers, heaviest around 3.", screen: "```blink-card\n" + JSON.stringify({ type: "line", title: "Chance of rain", unit: "%", points: [["12pm", 10], ["1pm", 20], ["2pm", 45], ["3pm", 70], ["4pm", 55], ["5pm", 30]] }) + "\n```" }]; Call.setState("listening"); Call.paint(); });
    await shot("call-" + theme);
    await page.evaluate(() => { Object.defineProperty(D, "test", { value: true, writable: true, configurable: true }); Call.lines = []; Call.end(true); }); await wait(300);
    await page.evaluate(() => H.chats()); await shot("chats-" + theme);
    await page.evaluate(() => H.openThread("d1")); await shot("chat-visual-" + theme);
    await page.evaluate(() => { closeSheet(); H.cmdOpen(); }); await shot("ask-blink-" + theme);
    await page.evaluate(() => closeSheet());
  }
  await app.close();
  fs.rmSync(demoHome, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
