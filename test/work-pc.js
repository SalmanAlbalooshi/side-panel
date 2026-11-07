// A work PC with no Claude Code or Codex, only web AI (Claude, ChatGPT, Copilot, Gemini in the browser).
// Then Claude Code gets installed while the panel is running: it must show up by itself, no restart.
// Usage: node test/work-pc.js   (PANEL_EXE=<path> tests the packaged app)
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const SHOTS = path.join(__dirname, "shots", "work-pc");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
async function until(page, fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; }
const LATER = path.join(__dirname, "claude-later.cmd"); // "installed" halfway through
const answer = (page) => page.evaluate(() => (document.querySelector(".cmd-answer") || {}).textContent || "");
async function ask(page, text) { await page.evaluate((t) => { const e = document.querySelector("#cmdText"); e.focus(); e.value = t; e.dispatchEvent(new Event("input", { bubbles: true })); }, text); await page.keyboard.press("Enter"); for (let i = 0; i < 24; i++) { await wait(250); const a = await answer(page); if (/\S/.test(a) && !/^Thinking/.test(a)) return a; } return answer(page); }
const sent = async (page) => (await page.evaluate(() => window.panel.testState())).sent;
const layer = (page) => page.textContent("#layer").catch(() => "");

(async () => {
  try { fs.rmSync(LATER, { force: true }); } catch { }
  const dataDir = path.join(os.tmpdir(), "side-panel-test");
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : [])) try { fs.rmSync(path.join(dataDir, f), { recursive: true, force: true }); } catch { } }
  const env = Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: LATER, SP_CODEX: "none", SP_AI_POLL_MS: "3000", CLAUDE_CONFIG_DIR: path.join(os.tmpdir(), "sp-test-no-claude") }); // a PC that never had Claude Code
  fs.mkdirSync(path.join(os.tmpdir(), "sp-test-no-claude", "projects"), { recursive: true });
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env, executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"]), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); page.screenshot = ((o) => (opts) => o(Object.assign({ timeout: 8000 }, opts || {})).catch(() => null))(page.screenshot.bind(page)); page.click = ((orig) => async (sel, o) => { try { await orig(sel, Object.assign({ timeout: 5000 }, o || {})); } catch { await page.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("no " + s); if (e.focus) e.focus(); e.click(); }, sel); } })(page.click.bind(page));
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".top", { timeout: 30000 });
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  await until(page, () => D.discReady, 30000); await wait(1500);

  // what this PC has
  ok("no AI tools found, web AIs listed (incl. Copilot)", await page.evaluate(() => !D.providers.some((p) => p.kind === "cli") && ["claude-web", "chatgpt-web", "copilot-web", "gemini-web"].every((id) => D.providers.some((p) => p.id === id))));
  // Settings only shows what works here
  await page.evaluate(() => openSheet("settings")); await wait(700);
  let t = await layer(page);
  ok("Settings: no Claude Code rows on a PC without it", !/Claude Code/.test(t) && !/Open finished tasks/.test(t) && !/AI on the panel/.test(t), t.slice(0, 200));
  ok("Settings: the basics are short", (await page.$$("#layer .setrow")).length <= 8, (await page.$$("#layer .setrow")).length + " rows");
  await page.screenshot({ path: path.join(SHOTS, "w01-settings.png") });
  await page.click("[data-act=setMore]"); await wait(500);
  t = await layer(page);
  ok("More settings: lists the web AIs, Copilot included", /Copilot \(web\)/.test(t) && /Claude \(web\)/.test(t));
  await page.evaluate(() => closeSheet());
  // AI sessions explain what works today
  await page.evaluate(() => openSheet("sessions")); await wait(700);
  t = await layer(page);
  ok("AI sessions: says there are no AI tools yet and what to do", /No AI tools on this PC yet/.test(t) && /show up here by themselves/.test(t) && /Ask Blink/.test(t));
  await page.screenshot({ path: path.join(SHOTS, "w02-sessions.png") });
  await page.evaluate(() => closeSheet());

  // Blink: PC things work; AI questions go to the web AI you pick, and it remembers
  await page.click(".askblink"); await wait(500);
  ok("Blink: on-PC commands work with no AI", /Switched to Work/.test(await ask(page, "work mode")));
  await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(500);
  const a1 = await ask(page, "write me a short poem about the sea");
  ok("Blink: an AI question offers web AIs by name", /in your browser/.test(a1) && /Ask Claude/.test(a1) && /Copilot/.test(a1) && /ChatGPT/.test(a1), a1);
  await page.screenshot({ path: path.join(SHOTS, "w03-pick-ai.png") });
  await page.click(".cmd-answer [data-act=cmdWeb]:not(.go) >> text=Copilot"); await wait(700);
  ok("Blink: tapping Copilot opens Copilot", (await sent(page)).includes("web copilot-web"));
  const a2 = await ask(page, "summarise the history of pearl diving");
  ok("Blink: Copilot is now the first choice", /Ask Copilot/.test(a2), a2);
  ok("Blink: suggestions only offer what works here", !(await page.evaluate(() => [...document.querySelectorAll(".cmd-chip")].some((c) => /screen|copied/i.test(c.textContent)))));
  const a3 = await ask(page, "اكتب لي قصيدة عن البحر");
  ok("Arabic on a web-only PC: answers in Arabic with the AI buttons", /ذكاء اصطناعي/.test(a3) && /Ask Copilot/.test(a3), a3);
  await page.evaluate(() => closeSheet());

  // later: Claude Code gets installed while the panel runs
  fs.copyFileSync(path.join(__dirname, "fake-claude.cmd"), LATER);
  const found = await until(page, () => D.providers.some((p) => p.id === "claude-code"), 20000);
  ok("installed later: Claude Code shows up by itself, no restart", found);
  ok("installed later: Blink says so", await until(page, () => /Claude Code is now on this PC/.test(D.ui.lastSpoken || "") || /Claude Code is now on this PC/.test((document.querySelector(".bk-bubble") || {}).textContent || ""), 5000));
  await page.evaluate(() => openSheet("sessions")); await wait(600);
  ok("installed later: AI sessions now offer New task", /New task/.test(await layer(page)) && !/No AI tools on this PC yet/.test(await layer(page)));
  await page.evaluate(() => closeSheet());
  await page.click(".askblink"); await wait(400);
  await page.evaluate(() => { const e = document.querySelector("#cmdText"); e.focus(); e.value = "write me a short poem about the sea"; e.dispatchEvent(new Event("input", { bubbles: true })); }); await page.keyboard.press("Enter");
  ok("installed later: questions now go to Claude Code on the PC", await until(page, () => /Echo: write me a short poem/.test((document.querySelector(".cmd-answer") || {}).textContent || ""), 20000), await answer(page));
  await page.screenshot({ path: path.join(SHOTS, "w04-claude-installed.png") });
  await page.evaluate(() => closeSheet());
  await page.evaluate(() => openSheet("settings")); await wait(600);
  ok("installed later: Settings now show Claude Code", /Claude Code/.test(await layer(page)) && /Open finished tasks in the Claude app/.test(await layer(page)));
  await page.evaluate(() => closeSheet());

  // and removed again: back to web AI
  fs.rmSync(LATER, { force: true });
  ok("uninstalled: the panel notices and goes back to web AI", await until(page, () => !D.providers.some((p) => p.id === "claude-code"), 20000));
  ok("no page errors (work PC)", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  try { fs.rmSync(LATER, { force: true }); } catch { }
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { try { fs.rmSync(LATER, { force: true }); } catch { } console.error("TEST CRASH", e); process.exit(1); });
