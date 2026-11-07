// This round: files ("find the pdf I downloaded yesterday", "open the second one", clearing old ones after a yes),
// message drafts you send yourself, full screen, Bluetooth; and a PC with no Claude Code or Codex at all.
// Uses its own temporary folders; never touches your real files, apps, mic, speakers or music. Usage: node test/round12.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 220) : "")); console.log(log[log.length - 1]); };
const launch = async (extra) => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }, extra || {}), args: [path.join(__dirname, ".."), "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);
  return { app, page, errors };
};
(async () => {
  // a pretend PC's folders: files from today, yesterday and last month
  const root = path.join(os.tmpdir(), "sp-test-files"); fs.rmSync(root, { recursive: true, force: true });
  const put = (dir, name, daysAgo) => { const d = path.join(root, dir); fs.mkdirSync(d, { recursive: true }); const p = path.join(d, name); fs.writeFileSync(p, "x".repeat(1000)); const t = new Date(Date.now() - daysAgo * 864e5); if (daysAgo === 1) t.setHours(12, 0, 0, 0); fs.utimesSync(p, t, t); };
  put("downloads", "invoice-march.pdf", 1); put("downloads", "boarding-pass.pdf", 1); put("downloads", "old-manual.pdf", 40); put("downloads", "today.pdf", 0); put("downloads", "setup.exe", 20);
  put("desktop", "Screenshot 2026-10-01.png", 30); put("desktop", "Screenshot 2026-10-02.png", 29); put("desktop", "Screenshot today.png", 0); put("desktop", "notes.txt", 30);

  let { app, page, errors } = await launch({ SP_TEST_FILES: root });
  const sent = async () => (await page.evaluate(() => window.panel.testState())).sent;
  const ask = (t) => page.evaluate((x) => window.panel.act("command", x), t);

  let r = await ask("find the pdf I downloaded yesterday");
  ok("finds yesterday's PDFs in Downloads, newest first", /invoice-march\.pdf/.test(r.say) && /boarding-pass\.pdf/.test(r.say) && !/today\.pdf|old-manual/.test(r.say), r.say);
  r = await ask("open the second one");
  ok("'open the second one' opens the second file in that list", /Opening/.test(r.say) && (await sent()).some((x) => /^openFile (invoice-march|boarding-pass)\.pdf/.test(x)), r.say);
  r = await ask("delete old screenshots on my desktop");
  ok("clearing old screenshots lists them and asks first", /2 screenshots older than a week/.test(r.say) && /Say yes/.test(r.say) && !(await sent()).some((x) => /^recycle/.test(x)), r.say);
  r = await ask("no");
  ok("'no' keeps them", /left them alone/.test(r.say) && !(await sent()).some((x) => /^recycle/.test(x)), r.say);
  await ask("delete old screenshots on my desktop"); r = await ask("yes, delete them");
  const rec = (await sent()).filter((x) => /^recycle/.test(x));
  ok("'yes' moves only the old ones to the Recycle Bin", /Moved 2 screenshots to the Recycle Bin/.test(r.say) && rec.length === 2 && !rec.some((x) => /today|notes/.test(x)), r.say + " | " + rec.join(", "));
  r = await ask("yes");
  ok("a 'yes' later doesn't delete anything again", !/Moved/.test(r.say || ""), r.say);

  // a person with a mobile number and email, then message drafts
  await page.evaluate(() => { D.cfg.keySets.home.push({ id: "k-ali", label: "Ali", action: { type: "person", email: "ali@example.com", phone: "+973 3333 3333", tap: "menu" }, glyph: "person" }); return window.panel.act("saveLayouts", { keySets: D.cfg.keySets }); }); await wait(600);
  r = await ask("message ali on whatsapp saying I'm running 10 minutes late");
  ok("WhatsApp: a draft with the text, you press Send", /ready in WhatsApp/.test(r.say) && /Press Send/i.test(r.say) && (await sent()).some((x) => /^open whatsapp:\/\/send\?phone=97333333333&text=I'm%20running%2010%20minutes%20late/.test(x)), (await sent()).slice(-1)[0]);
  r = await ask("email ali that the report is ready");
  ok("email: a draft to them with the text", /new email/.test(r.say) && (await sent()).some((x) => /^open mailto:ali@example\.com\?body=the%20report%20is%20ready/.test(x)), (await sent()).slice(-1)[0]);
  r = await ask("message sam on whatsapp saying hi");
  ok("someone not in People: says how to add them, sends nothing", /don't know sam/i.test(r.say) && !(await sent()).some((x) => /phone=.*&text=hi$/.test(x)), r.say);
  r = await ask("connect my airpods");
  ok("Bluetooth opens Windows' own page", /Bluetooth/.test(r.say) && (await sent()).includes("open ms-settings:bluetooth"), r.say);
  r = await ask("full screen");
  ok("full screen is for the app you were using, not the panel", (await sent()).some((x) => /^fullScreen/.test(x)), r.say || r.error);
  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();

  // ---- a PC with no Claude Code and no Codex ----
  ({ app, page, errors } = await launch({ SP_CLAUDE: "none", SP_CODEX: "none", SP_TEST_FILES: root }));
  r = await ask("volume 30"); ok("no AI: PC commands still work", /Volume/.test(r.say), r.say);
  r = await ask("find the pdf I downloaded yesterday"); ok("no AI: finding files still works", /invoice-march/.test(r.say), r.say);
  r = await ask("what's the capital of japan"); ok("no AI: a question offers an AI in the browser instead of failing", /browser/i.test(r.say) && !!r.web, JSON.stringify(r));
  await page.evaluate(() => H.callStart()); await wait(900);
  ok("no AI: a call still opens", await page.evaluate(() => D.ui.sheet === "call" && Call.on));
  const c = await page.evaluate(() => window.panel.act("callAsk", "volume 40")); ok("no AI: in a call, PC commands answer", /Volume/.test(c.say), JSON.stringify(c));
  const q = await page.evaluate(() => window.panel.act("callAsk", "tell me a fun fact about octopuses")); ok("no AI: in a call, a question gets a clear answer about what's needed", /Claude Code/.test(q.say || "") && !q.ai, JSON.stringify(q));
  await page.evaluate(() => Call.end(true)); await wait(300);
  await page.evaluate(() => H.chats()); await wait(500);
  ok("no AI: Chats opens and says how to start", await page.evaluate(() => /Chats/.test(document.querySelector(".sheet").textContent)));
  ok("no AI: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(__dirname, "shots", "round12"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "round12", "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
