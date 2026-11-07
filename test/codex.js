// Codex on the panel, against a stand-in "codex app-server" that speaks Codex's documented protocol.
// Usage: node test/codex.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const SHOTS = path.join(__dirname, "shots", "codex");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
async function until(page, fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; }
async function launch(codexCmd) {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(path.join(os.tmpdir(), "side-panel-test")) ? fs.readdirSync(path.join(os.tmpdir(), "side-panel-test")) : [])) try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  const env = Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: path.join(__dirname, codexCmd) });
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env, executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed"]), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".top", { timeout: 30000 });
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  return { app, page, errors };
}
const conv = (page) => page.evaluate(() => (document.querySelector("#conv") || {}).textContent || "");

(async () => {
  let { app, page, errors } = await launch("fake-codex.cmd");
  ok("Codex is found and fully supported", await until(page, () => (D.providers.find((p) => p.id === "codex") || {}).level === "Full", 30000));
  // a question to Codex, then a follow-up
  await page.evaluate(() => { D.ui.ask.thread = null; D.ui.ask.mode = "quick"; D.ui.ask.provider = "codex"; openSheet("ask"); }); await wait(400);
  ok("Ask offers Codex", !!(await page.$("[data-act=askProvider][data-arg*='codex']")));
  await page.fill("#askText", "hello codex"); await page.click("[data-act=askSend]");
  ok("Codex answers in the panel", await until(page, () => /Codex echo: hello codex/.test((document.querySelector("#conv") || {}).textContent || ""), 20000), await conv(page));
  await until(page, () => { const t = D.ui.ask.thread && (D.ui.threadCache || {})[D.ui.ask.thread]; return t && t.state === "done"; }, 10000);
  await page.fill("#askText", "and again"); await page.click("[data-act=askSend]");
  ok("follow-up continues the same Codex chat", await until(page, () => /Codex echo: and again/.test((document.querySelector("#conv") || {}).textContent || "") && document.querySelectorAll("#conv .msg.you").length === 2, 20000));
  await page.screenshot({ path: path.join(SHOTS, "c01-ask.png") });
  // a task that wants to run a command: the approval comes to the panel
  const r = await page.evaluate(() => window.panel.act("task", { provider: "codex", prompt: "RUN the tests", mode: "ask" }));
  await page.evaluate((id) => H.openThread(id), r.thread);
  ok("Codex asks on the panel before running a command", await until(page, () => !!document.querySelector(".chatside [data-act=approve]") && /npm test/.test(document.querySelector(".chatside").textContent), 20000));
  ok("the approval card shows the real command", /Run: npm test/.test(await page.textContent(".chatside")));
  await page.screenshot({ path: path.join(SHOTS, "c02-approval.png") });
  await page.click(".chatside [data-act=approve][data-arg*='allow']");
  ok("Allow lets Codex run it and finish", await until(page, () => /Tests pass/.test((document.querySelector("#conv") || {}).textContent || "") && D.ui.threadData.state === "done", 20000));
  ok("the command shows as a step", /Ran npm test/.test(await conv(page)));
  // deny
  const r2 = await page.evaluate(() => window.panel.act("task", { provider: "codex", prompt: "RUN them again", mode: "ask" }));
  await page.evaluate((id) => H.openThread(id), r2.thread);
  await until(page, () => !!document.querySelector(".chatside [data-act=approve]"), 20000);
  await page.click(".chatside [data-act=approve][data-arg*='deny']");
  ok("Say no stops the command", await until(page, () => /won't run them/.test((document.querySelector("#conv") || {}).textContent || ""), 20000));
  // a failure, and Stop
  const r3 = await page.evaluate(() => window.panel.act("task", { provider: "codex", prompt: "FAIL please" }));
  await page.evaluate((id) => H.openThread(id), r3.thread);
  ok("a failed turn says what happened", await until(page, () => D.ui.threadData && D.ui.threadData.state === "error" && /overloaded/.test(document.querySelector("#conv").textContent), 15000));
  const r4 = await page.evaluate(() => window.panel.act("task", { provider: "codex", prompt: "SLOW please" }));
  await page.evaluate((id) => H.openThread(id), r4.thread);
  await until(page, () => /Thinking about/.test((document.querySelector("#conv") || {}).textContent || ""), 15000);
  await page.click("[data-act=chatStop]");
  ok("Stop interrupts Codex", await until(page, () => D.ui.threadData && D.ui.threadData.state === "stopped", 15000), await page.evaluate(() => D.ui.threadData && D.ui.threadData.state));
  await page.screenshot({ path: path.join(SHOTS, "c03-stopped.png") });
  ok("Codex usage limit reaches the panel", await page.evaluate(() => { const l = D.live.limits || {}; return !!Object.values(l).find((x) => x && x.unifiedWindows); }));
  ok("Claude Code still works next to Codex", (await page.evaluate(() => window.panel.act("ask", { provider: "claude-code", question: "hi claude" }))).thread !== undefined);
  // carrying on elsewhere: the panel stops its own run first, and says where approvals go now
  const r6 = await page.evaluate(() => window.panel.act("task", { provider: "codex", prompt: "SLOW again" }));
  await page.evaluate((id) => H.openThread(id), r6.thread);
  await until(page, () => /Thinking about/.test((document.querySelector("#conv") || {}).textContent || ""), 15000);
  await page.click("[data-act=chatMove]"); await wait(300);
  ok("Continue in: warns it stops the run here first", /Stops it here/.test(await page.textContent(".sheet")) && !(await page.$("[data-act=chatDesktop]")));
  await page.screenshot({ path: path.join(SHOTS, "c04-continue-in.png") });
  const moved = await page.evaluate(() => window.panel.act("threadTerminal", D.ui.threadId));
  ok("hand-off stops the panel's run and says approvals move", /Approvals now happen there/.test(moved.toast || "") && await until(page, () => D.ui.threadData && D.ui.threadData.state === "stopped", 10000), JSON.stringify(moved));
  await page.evaluate(() => closeSheet());
  // Codex conversations started in the Codex app or a terminal
  await page.evaluate(() => openSheet("sessions"));
  await until(page, () => !!document.querySelector("[data-act=ssOlder]"), 15000);
  ok("Sessions offer one button for older chats and Codex conversations", /Codex conversations/.test(await page.textContent("[data-act=ssOlder]")));
  await page.click("[data-act=ssOlder]"); await wait(400);
  ok("Sessions list Codex conversations from elsewhere", await until(page, () => /Codex, started elsewhere/.test(document.querySelector("#layer").textContent) && /Fix the login page tests/.test(document.querySelector("#layer").textContent), 15000));
  await page.click("[data-act=cxPick]"); await wait(400);
  await page.fill("#cxText", "carry on please");
  await page.click("[data-act=cxGo]");
  ok("one can continue here, in the panel", await until(page, () => D.ui.sheet === "chat" && /Codex echo: carry on please/.test((document.querySelector("#conv") || {}).textContent || ""), 20000), await conv(page));
  await page.screenshot({ path: path.join(SHOTS, "c05-codex-elsewhere.png") });
  await page.evaluate(() => closeSheet());
  ok("no page errors (codex)", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  // signed out
  ({ app, page, errors } = await launch("fake-codex-out.cmd"));
  await until(page, () => D.providers.some((p) => p.id === "codex"), 30000);
  const r5 = await page.evaluate(() => window.panel.act("ask", { provider: "codex", question: "hi" }));
  await page.evaluate((id) => H.openThread(id), r5.thread);
  ok("signed out: says how to sign in", await until(page, () => /sign in/i.test((document.querySelector("#conv") || {}).textContent || ""), 15000), await conv(page));
  await app.close();
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
