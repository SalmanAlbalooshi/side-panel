// Screenshots of the call screen (with an answer, a visual and the Stop button), the Chats list and a chat with a visual.
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const out = path.join(__dirname, "shots", "round11"); fs.mkdirSync(out, { recursive: true });
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }), args: [path.join(__dirname, ".."), "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);
  await page.evaluate(() => H.callStart()); await wait(800);
  await page.evaluate(() => {
    Call.lines = [{ who: "you", text: "What's the rain like this afternoon?" }, { who: "blink", text: "Dry until about 2, then showers, heaviest around 3.", screen: "```blink-card\n" + JSON.stringify({ type: "line", title: "Chance of rain", unit: "%", points: [["12pm", 10], ["1pm", 20], ["2pm", 45], ["3pm", 70], ["4pm", 55], ["5pm", 30]] }) + "\n```" }, { who: "you", text: "And how far am I in Wolverine?" }];
    Call.aiBusy = true; Call.askedAt = Date.now() - 4000; Call.setState("thinking"); Call.paint();
  });
  await wait(600); await page.screenshot({ path: path.join(out, "call-thinking.png") });
  await page.evaluate(() => { Object.defineProperty(D, "test", { value: true, writable: true, configurable: true }); Call.aiBusy = false; Call.end(true); });
  await page.evaluate(() => window.panel.act("command", "write me a haiku about tea")); await wait(2500);
  await page.evaluate(() => H.chats()); await wait(700); await page.screenshot({ path: path.join(out, "chats.png") });
  await page.evaluate(() => { const c = document.createElement("div"); c.className = "msg ai"; c.style.cssText = "position:fixed;left:40px;top:120px;width:560px;z-index:99;background:var(--plane);padding:16px;border-radius:16px"; c.innerHTML = md("You spent **6.5 hours** on apps today.\n```blink-card\n" + JSON.stringify({ type: "bar", title: "Time per app today", unit: "h", items: [["Chrome", 3.5], ["VS Code", 2], ["Spotify", 1]] }) + "\n```\n```blink-card\n" + JSON.stringify({ type: "ring", title: "Focus", value: 18, max: 25, unit: "min" }) + "\n```"); document.body.appendChild(c); }); await wait(400);
  await page.screenshot({ path: path.join(out, "visual-cards.png") });
  await app.close();
  console.log("ok");
})().catch((e) => { console.error(e); process.exit(1); });
