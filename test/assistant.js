// Blink assistant as a person uses it: the command bar, on-PC commands, replies, a routine, the brief, Mini,
// AI answers, and a PC with no AI at all. Never touches real volume or the microphone.
// Usage: node test/assistant.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const SHOTS = path.join(__dirname, "shots", "assistant");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
async function until(page, fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await wait(300); } return false; }
async function launch(extra) {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(path.join(os.tmpdir(), "side-panel-test")) ? fs.readdirSync(path.join(os.tmpdir(), "side-panel-test")) : [])) try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  const env = Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832" }, extra);
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env, executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"]), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); page.screenshot = ((o) => (opts) => o(Object.assign({ timeout: 8000 }, opts || {})).catch(() => null))(page.screenshot.bind(page));
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".top", { timeout: 30000 });
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  await wait(2500);
  return { app, page, errors };
}
const answer = (page) => page.evaluate(() => (document.querySelector(".cmd-answer") || {}).textContent || "");
async function ask(page, text) { await page.evaluate((t) => { const e = document.querySelector("#cmdText"); e.focus(); e.value = t; e.dispatchEvent(new Event("input", { bubbles: true })); }, text); await page.keyboard.press("Enter"); await wait(900); return answer(page); }
const sent = async (page) => (await page.evaluate(() => window.panel.testState())).sent;

(async () => {
  const proj = path.join(os.tmpdir(), "sp-test-budget-report"); fs.mkdirSync(proj, { recursive: true });
  let { app, page, errors } = await launch({ SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none", SP_TEST_FOLDER: proj, SP_NOTIFY_MS: "0" });
  ok("top bar has Ask Blink with Blink's face", !!(await page.$(".askblink .bk")));
  await page.click(".askblink"); await wait(600);
  ok("tapping it opens the command bar, ready to type", await page.evaluate(() => D.ui.sheet === "cmd" && document.activeElement && document.activeElement.id === "cmdText"));
  ok("the mic is off until you tap it", await page.evaluate(() => !D.ui.cmd.rec && !document.querySelector(".cmd-rec")));
  ok("suggestions show", (await page.$$(".cmd-chip")).length >= 3);
  await page.screenshot({ path: path.join(SHOTS, "a01-bar.png") });
  // on-PC commands
  ok("maths works without AI", /25\*4 = 100/.test(await ask(page, "what is 25*4")));
  ok("switching mode", /Switched to Work/.test(await ask(page, "work mode")) && await page.evaluate(() => D.cfg.activeLayout === "Work"));
  await page.evaluate(() => { D.ui.cmd.answer = null; drawSheet(); });
  ok("at work, Blink says it's staying quiet", await page.evaluate(() => { D.cfg.replyWork = "listen"; drawSheet(); return /Quiet at work/.test(document.querySelector(".cmd-reply").textContent); }));
  await page.screenshot({ path: path.join(SHOTS, "a02-work-quiet.png") });
  await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(800);
  await page.click(".cmd-reply"); await wait(500);
  ok("the speaker button switches Read and Read + listen", await page.evaluate(() => D.cfg.replyHome === "read"));
  await page.click(".cmd-reply"); await wait(300);
  ok("open a website", /Opening github.com/.test(await ask(page, "open github.com")) && (await sent(page)).includes("open https://github.com"));
  ok("web search", /Searching/.test(await ask(page, "search for weather in manama")) && (await sent(page)).some((x) => /google\.com\/search\?q=weather%20in%20manama/.test(x)));
  // a person
  await page.evaluate(() => { D.cfg.keySets.home.push({ id: "k-sara", label: "Sara", action: { type: "person", email: "sara@example.com", tap: "menu" }, glyph: "person" }); return window.panel.act("saveLayouts", { keySets: D.cfg.keySets }); }); await wait(600);
  ok("Teams chat with a person", /chat with Sara/.test(await ask(page, "Teams chat with Sara")) && (await sent(page)).some((x) => /l\/chat\/0\/0\?users=sara%40example\.com/.test(x)));
  ok("reminders", /in 10 minutes/.test(await ask(page, "remind me in 10 minutes to stretch")));
  ok("focus from a sentence", /Focus on for 15 minutes/.test(await ask(page, "focus 15 minutes")) && await page.evaluate(() => D.ui.focus.running));
  await page.evaluate(() => { D.ui.focus.running = false; D.ui.focus.left = 1500; });
  // meetings
  const start = new Date(Date.now() + 20 * 60000), end = new Date(Date.now() + 50 * 60000);
  await page.evaluate(([s, e]) => window.panel.testLive({ meeting: { available: true, meetings: [{ subject: "Quarterly plan review", start: s, end: e, join: "https://teams.microsoft.com/l/meetup-join/x" }] } }), [start.toISOString(), end.toISOString()]); await wait(1200);
  ok("next meeting, with a Join button", /Quarterly plan review/.test(await ask(page, "next meeting?")) && !!(await page.$(".cmd-answer [data-act=openUrl]")));
  // routine
  ok("a routine from one sentence", /Routine saved/.test(await ask(page, "When I start a game, open github.com and search for patch notes")) && await page.evaluate(() => (D.cfg.routines || []).length === 1));
  const before = (await sent(page)).length;
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: true, app: "Game", title: "Game", path: "D:\\SteamLibrary\\steamapps\\common\\Game\\game.exe" } }));
  await wait(3500);
  const after = (await sent(page)).slice(before);
  ok("the routine runs when a game starts", after.includes("open https://github.com") && after.some((x) => /patch%20notes/.test(x)), after.join(" | "));
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } })); await wait(1500);
  await page.evaluate(() => openSheet("layouts")); await wait(600);
  ok("routines are listed in Layouts, with on/off and remove", /When a game starts/.test(await page.textContent("#layer")) && !!(await page.$("[data-act=routineRemove]")));
  await page.evaluate(() => closeSheet());
  // an AI answer for anything else
  await page.click(".askblink"); await wait(500);
  await page.fill("#cmdText", "write me a haiku about tea"); await page.keyboard.press("Enter");
  ok("anything else goes to the AI and the answer shows in the bar", await until(page, () => /Echo: write me a haiku/.test((document.querySelector(".cmd-answer") || {}).textContent || ""), 20000));
  ok("the AI answer can open as a full chat", !!(await page.$(".cmd-answer [data-act=openThread]")));
  await page.screenshot({ path: path.join(SHOTS, "a03-ai-answer.png") });
  // carrying on in the Claude app: the panel's own run stops first, approvals move there
  await page.click("[data-act=openThread]"); await wait(1200);
  await page.click("[data-act=chatMove]"); await wait(300);
  ok("Continue in offers the Claude app first, and a terminal", !!(await page.$("[data-act=chatDesktop].go")) && !!(await page.$("[data-act=chatTerminal]")));
  await page.screenshot({ path: path.join(SHOTS, "a08-continue-in.png") });
  await page.click("[data-act=chatDesktop]");
  ok("it moves to the Claude app, with the same conversation", (await wait(1200), true) && (await sent(page)).some((x) => /^desktop \S{8,}/.test(x)), (await sent(page)).slice(-3).join(" | "));
  ok("finished panel tasks raise a Windows notification", (await sent(page)).some((x) => /^notify /.test(x)));
  await page.evaluate(() => closeSheet());
  // naming a project folder starts the work there
  await page.click(".askblink"); await wait(400);
  ok("a folder named in the words is where the AI works", /Working in sp-test-budget-report|Echo/.test(await ask(page, "in sp-test-budget-report update the readme")) && await page.evaluate(() => (D.threads || []).some((t) => /sp-test-budget-report/.test(t.cwd))));
  ok("finished panel tasks move to the Claude app by themselves", await until(page, () => (D.threads || []).some((t) => t.kind === "task" && t.movedTo), 15000));
  // questions about the panel itself are answered here, with a button that does it
  await page.evaluate(() => closeSheet()); await page.click(".askblink"); await wait(400);
  ok("help: how do I add a key, with an Add a key button", /Tap Add key/.test(await ask(page, "how do I add a key?")) && !!(await page.$(".cmd-answer [data-act=addKey]")));
  await page.click(".cmd-answer [data-act=addKey]"); await wait(600);
  ok("help: the button opens Add a key", await page.evaluate(() => D.ui.sheet === "addKey"));
  await page.evaluate(() => closeSheet()); await page.click(".askblink"); await wait(400);
  ok("help: is the mic always listening", /never listens on its own/.test(await ask(page, "is the mic always listening?")));
  ok("help: how do I move a widget opens editing", /Hold any widget/.test(await ask(page, "how can I move a widget")) && !!(await page.$(".cmd-answer [data-act=editCurrent]")));
  await page.click(".cmd-answer [data-act=editCurrent]"); await wait(800);
  ok("help: Edit this layout turns on editing", await page.evaluate(() => !!D.ui.editing));
  await page.evaluate(() => { D.ui.editing = null; render(); });
  ok("the top bar has a visible Edit button", !!(await page.$(".top [data-act=editCurrent]")));
  // talking like a person: your name, follow-ups that continue, words said the way people say them
  await page.evaluate(() => closeSheet()); await page.evaluate(() => { D.ui.forceNameAsk = true; D.cfg.userName = ""; H.cmdOpen(); }); await wait(500);
  ok("Blink asks your name once", /What should I call you/.test(await answer(page)) && !!(await page.$("#nameText")));
  await page.fill("#nameText", "Alex"); await page.keyboard.press("Enter"); await wait(800);
  ok("your name is saved and Blink says hello", /Nice to meet you, Alex/.test(await answer(page)) && await page.evaluate(() => D.cfg.userName === "Alex"));
  ok("call me changes it", /Nice to meet you, Sal/.test(await ask(page, "call me Sal")) && await until(page, () => D.cfg.userName === "Sal", 3000));
  ok("what's my name", /You're Sal/.test(await ask(page, "what's my name?")));
  ok("I'm busy is not taken as a name", await page.evaluate(() => D.cfg.userName === "Sal") && !/Nice to meet you/.test(await ask(page, "I'm busy")));
  await page.evaluate(() => closeSheet()); await page.evaluate(() => H.cmdOpen()); await wait(400);
  await page.fill("#cmdText", "write me a haiku about tea"); await page.keyboard.press("Enter");
  await until(page, () => /Echo: write me a haiku about tea/.test((document.querySelector(".cmd-answer") || {}).textContent || ""), 20000);
  const t1 = await page.evaluate(() => D.ui.cmd.thread);
  await page.fill("#cmdText", "now make it about coffee"); await page.keyboard.press("Enter");
  ok("a follow-up continues the same conversation", await until(page, () => /Echo: now make it about coffee/.test((document.querySelector(".cmd-answer") || {}).textContent || ""), 20000) && (await page.evaluate(() => D.ui.cmd.thread)) === t1, await answer(page));
  const said = await page.evaluate(() => [talkify("SetupBackupSyncRepeat failed. E: drive is almost full. MorningReport-7AM at 04:30 PM. See https://x.com/a **now**"), humanize("Switched to Work."), briefSpeech()]);
  ok("spoken words read like a person says them", /setup backup sync repeat/i.test(said[0]) && /E drive/.test(said[0]) && /morning report 7 AM/i.test(said[0]) && /4:30 PM/.test(said[0]) && /the link on screen/.test(said[0]) && !/\*\*/.test(said[0]), said[0]);
  ok("replies sound human", /Work mode/.test(said[1]) && said[1] !== "Switched to Work.", said[1]);
  ok("the brief greets you by name", /, Sal\./.test(said[2]), said[2]);
  // a voice call: tap once, then talk; PC things answer at once, questions stream back, talking over Blink stops it, "bye" hangs up
  await page.evaluate(() => closeSheet()); await page.evaluate(() => H.callStart()); await wait(800);
  ok("call: tapping the mic opens a call with the mic notice", await page.evaluate(() => D.ui.sheet === "call" && Call.on && /Microphone on, only during this call/.test(document.querySelector(".callsheet").textContent)));
  await page.screenshot({ path: path.join(SHOTS, "a09-call.png") });
  await page.evaluate(() => Call.handle("volume 30")); await wait(800);
  ok("call: PC commands answer straight away", await page.evaluate(() => /Volume/.test(Call.lines.map((l) => l.text).join(" ")) && /Volume/.test(D.ui.lastSpoken || "")), await page.evaluate(() => JSON.stringify(Call.lines)));
  await page.evaluate(() => Call.handle("tell me something interesting")); 
  ok("call: questions stream back and are spoken sentence by sentence", await until(page, () => /Echo: tell me something interesting/.test(Call.lines.map((l) => l.text).join(" ")) && /Echo/.test(D.ui.lastSpoken || ""), 8000), await page.evaluate(() => JSON.stringify(Call.lines)));
  // talking over Blink: it goes quiet at once, and stops (dropping the rest) as soon as it hears your words, not its own echo
  ok("call: talking over Blink quiets it at once, then stops it for your words", await page.evaluate(async () => { Call.queue = [{ text: "x", ready: Promise.resolve(null) }]; Call.playing = { volume: 1, pause() { } }; Call.aiBusy = true; Call.heardStart(); const quiet = Call.playing && Call.playing.volume < 1; Call.recognize = async () => "no wait, something else"; const h = Call.handle; Call.handle = () => { }; await Call.heardEnd([new Float32Array(16000).fill(0.1)]); Call.handle = h; return quiet && !Call.playing && Call.queue.length === 0 && !Call.aiBusy; }));
  await page.evaluate(() => Call.handle("bye")); await wait(2500);
  ok("call: saying bye hangs up and the mic is off", await page.evaluate(() => !Call.on && D.ui.sheet !== "call"));
  // morning brief
  await page.evaluate(() => { closeSheet(); H.cmdOpen(); }); await wait(500);
  await page.fill("#cmdText", "brief me"); await page.keyboard.press("Enter"); await wait(1200);
  ok("the morning brief shows with today's meeting", await page.evaluate(() => !!document.querySelector(".brief") && /Quarterly plan review/.test(document.querySelector(".brief").textContent)));
  await page.screenshot({ path: path.join(SHOTS, "a04-brief.png") });
  await page.evaluate(() => { D.ui.lastSpoken = ""; D.cfg.replyHome = "read"; D.cfg.replyWork = "read"; });
  await page.click("[data-act=briefRead]"); await wait(400);
  ok("Read it to me reads the brief even when answers are text only", await page.evaluate(() => /meeting|Here's your day|Good/i.test(D.ui.lastSpoken || "")), await page.evaluate(() => D.ui.lastSpoken));
  ok("no page errors after Read it to me", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.click("[data-act=briefDone]"); await wait(500);
  ok("Got it closes the brief", !(await page.$(".brief")));
  // Mini
  await page.evaluate(() => H.shrink()); await wait(1500);
  await page.click(".minip [data-act=miniAsk]"); await wait(600);
  ok("Mini has the same bar", !!(await page.$(".minip #cmdText")) && !!(await page.$(".minip .cmd-mic")));
  await page.fill("#cmdText", "what is 6*7"); await page.keyboard.press("Enter"); await wait(900);
  ok("Mini answers right there", /6\*7 = 42/.test(await page.textContent(".minip")));
  await page.screenshot({ path: path.join(SHOTS, "a05-mini.png") });
  await page.evaluate(() => H.expand()); await wait(1000);
  // Arabic, including Bahraini: talk in Arabic, Blink answers in Arabic; the screens stay English
  await page.click(".askblink"); await wait(500);
  ok("Arabic: switching mode", /حولت على Work/.test(await ask(page, "حط وضع الشغل")) && await page.evaluate(() => D.cfg.activeLayout === "Work"));
  await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(600);
  ok("Arabic: a reminder, with the reason kept", /بذكرك بعد 10 دقيقة/.test(await ask(page, "ذكرني بعد ١٠ دقايق عشان اتصل على امي")));
  ok("Arabic: Teams chat with a person by name", /سارة|Sara/.test(await ask(page, "سولف مع سارة")) && (await sent(page)).filter((x) => /users=sara%40example\.com/.test(x)).length >= 2);
  ok("Arabic: the time", /\d/.test(await ask(page, "كم الساعة")));
  ok("Arabic: the answer reads right to left", await page.evaluate(() => document.querySelector(".cmd-answer .msg").getAttribute("dir") === "auto"));
  await page.fill("#cmdText", "وش رايك في الجو اليوم"); await page.keyboard.press("Enter");
  ok("Arabic: open questions go to the AI as written", await until(page, () => /Echo: وش رايك/.test((document.querySelector(".cmd-answer") || {}).textContent || ""), 20000));
  ok("the screens stay English", await page.evaluate(() => /Ask Blink/.test(document.querySelector(".askblink").textContent)));
  await page.screenshot({ path: path.join(SHOTS, "a06-arabic.png") });
  await page.evaluate(() => closeSheet());
  // voices: Settings explains what downloads, and nothing downloads in tests
  await page.evaluate(() => openSheet("settings")); await wait(800);
  await page.click("[data-act=setMore]"); await wait(500);
  const vt = await page.textContent("#layer");
  ok("Settings explain the voices plainly", /runs on this PC only/.test(vt) && /Natural voice/.test(vt) && /Arabic voice/.test(vt) && /MB\)|Too heavy/.test(vt), vt.slice(vt.indexOf("Voices"), vt.indexOf("Voices") + 200));
  await page.screenshot({ path: path.join(SHOTS, "a07-voices.png") });
  await page.evaluate(() => closeSheet());
  ok("no page errors (assistant)", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();

  // a PC with no AI at all: Blink still does everything on the PC, and offers the browser for AI questions
  ({ app, page, errors } = await launch({ SP_CLAUDE: "none", SP_CODEX: "none" }));
  await page.click(".askblink"); await wait(500);
  ok("no AI: on-PC commands still work", /Switched to Work/.test(await ask(page, "work mode")));
  const noai = await ask(page, "summarise what I copied");
  ok("no AI: offers Claude in the browser instead", /browser/.test(noai) && !!(await page.$("[data-act=cmdWeb]")), noai);
  const noai2 = await ask(page, "write me a poem");
  ok("no AI: open questions go to the browser too", /browser/.test(noai2));
  ok("no AI: suggestions only offer what works", !(await page.evaluate(() => [...document.querySelectorAll(".cmd-chip")].some((c) => /screen|copied/.test(c.textContent)))));
  ok("no page errors (no AI)", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
