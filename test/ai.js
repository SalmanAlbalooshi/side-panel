// AI on the panel, played through the real app with the real Claude Code: a question with a follow-up,
// a one-tap action on copied text, a task that asks before writing, and a widget the AI builds and places.
// Needs Claude Code signed in. Usage: node test/ai.js [ask|action|task|widget]
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");

const SHOTS = path.join(__dirname, "shots", "ai");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const want = process.argv.slice(2);
const on = (n) => !want.length || want.includes(n);
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
async function until(page, fn, ms, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await wait(700); } return false; }
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") });

(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(path.join(os.tmpdir(), "side-panel-test")) ? fs.readdirSync(path.join(os.tmpdir(), "side-panel-test")) : [])) try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832" }), executablePath: process.env.PANEL_EXE || undefined, args: process.env.PANEL_EXE ? ["--test", "--windowed"] : [path.join(__dirname, ".."), "--test", "--windowed"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 30000 });
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  // wait until discovery has found Claude Code
  ok("Claude Code found", await until(page, () => D.providers.some((p) => p.id === "claude-code"), 60000));
  await page.evaluate(() => window.panel.act("saveSettings", { aiModel: "haiku" }));

  if (on("ask")) {
    await page.evaluate(() => openSheet("ask")); await wait(500);
    await page.fill("#askText", "What is the capital of Bahrain? One short sentence.");
    await page.click("[data-act=askSend]");
    ok("ask: answer streams into the panel", await until(page, () => /Manama/i.test((document.querySelector("#conv") || {}).textContent || ""), 90000));
    await shot(page, "a01-answer");
    ok("ask: follow-up box ready", await until(page, () => { const t = document.querySelector("#askText"); return t && /follow-up/.test(t.placeholder); }, 20000));
    await page.fill("#askText", "And its population, roughly? One sentence.");
    await page.click("[data-act=askSend]");
    ok("ask: follow-up keeps the conversation", await until(page, () => { const c = document.querySelector("#conv"); return c && c.querySelectorAll(".msg.you").length === 2 && D.ui.threadCache[D.ui.ask.thread].state !== "running" && c.querySelectorAll(".msg.ai").length >= 2; }, 90000));
    await shot(page, "a02-followup");
    await page.click("[data-act=openThread]"); await wait(800);
    ok("ask: full-screen chat shows both turns", (await page.$$eval("#conv .msg.you", (x) => x.length)) === 2);
    await shot(page, "a03-full-chat");
    await page.click(".sheet [data-act=closeSheet]"); await wait(300);
  }

  if (on("action")) {
    await app.evaluate(({ clipboard }) => clipboard.writeText("Hi team, the website launch moves to Thursday 10am. Ahmed to send test data by Wednesday. Sara to book the room."));
    await page.evaluate(() => openSheet("ask")); await page.evaluate(() => H.newChat()); await wait(400);
    await page.click("[data-act=aiAction][data-arg*='actions']");
    ok("action: action items from copied text", await until(page, () => { const t = D.ui.ask.thread && D.ui.threadCache && D.ui.threadCache[D.ui.ask.thread]; return t && t.state !== "running" && /Ahmed/i.test(document.querySelector("#conv").textContent); }, 90000));
    await shot(page, "b01-action-items");
    await page.click(".sheet [data-act=closeSheet]"); await wait(300);
  }

  if (on("task")) {
    const dir = path.join(os.tmpdir(), "side-panel-ai-task"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    await page.evaluate((d) => { D.ui.ask.dir = d; D.ui.ask.mode = "task"; D.ui.ask.taskMode = "ask"; openSheet("ask"); }, dir); await wait(400);
    await page.fill("#askText", "Create a file notes.txt in this folder with the line: panel task works. Then stop.");
    await page.click("[data-act=askSend]");
    ok("task: opens as a live chat", await until(page, () => D.ui.sheet === "chat", 10000));
    ok("task: asks before writing", await until(page, () => !!document.querySelector(".chatside [data-act=approve]"), 90000));
    await shot(page, "c01-task-asks");
    ok("task: approval also on the main screen banner", await page.evaluate(() => (D.claude.approvals || []).some((a) => a.source === "panel")));
    await page.click(".chatside [data-act=approve][data-arg*='allow']");
    ok("task: finishes after Allow", await until(page, () => D.ui.threadData && D.ui.threadData.state === "done", 90000));
    ok("task: file written", fs.existsSync(path.join(dir, "notes.txt")));
    await shot(page, "c02-task-done");
    await page.click(".sheet [data-act=closeSheet]"); await wait(300);
    await page.evaluate(() => openSheet("sessions")); await wait(600);
    ok("task: listed in AI sessions", /Create a file notes/.test(await page.textContent("#layer")));
    await shot(page, "c03-sessions");
    await page.click(".sheet [data-act=closeSheet]"); await wait(300);
  }

  if (on("widget")) {
    await page.evaluate(() => { window.panel.act("setLayout", "Home"); openSheet("build"); }); await wait(600);
    await page.fill("#buildText", "Show how many files are in my Downloads folder");
    await page.click("[data-act=buildWidget]");
    ok("widget: build runs in the panel", await until(page, () => D.ui.sheet === "chat", 10000));
    await wait(15000); await shot(page, "d01-building");
    ok("widget: build finishes", await until(page, () => D.ui.threadData && D.ui.threadData.state !== "running", 240000), await page.evaluate(() => D.ui.threadData && D.ui.threadData.state));
    ok("widget: placed on the screen by itself", await until(page, () => D.cfg.layouts.find((l) => l.name === D.cfg.activeLayout).widgets.some((w) => w.type === "custom"), 15000));
    await shot(page, "d02-built");
    await page.click(".sheet [data-act=closeSheet]"); await wait(300);
    ok("widget: shows a value without asking", await until(page, () => { const c = Object.values(D.custom || {})[0]; return c && c.approved && ((c.lines && c.lines.length) || c.data); }, 30000), await page.evaluate(() => JSON.stringify(Object.values(D.custom || {})[0] || {}).slice(0, 300)));
    await wait(1500); await shot(page, "d03-widget-live");
  }

  ok("no page errors (ai)", errors.length === 0, errors.slice(0, 5).join(" | "));
  await app.close();
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
