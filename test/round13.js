// This round: text readable in light and dark (new parts too), "remember" goes into Claude Code's memory, real work is
// handed to the person's full Claude setup (in Chats, Blink says when done), calls move to the Claude app when they end.
// Uses its own temporary memory folder; never touches your real memory, mic, speakers or apps. Usage: node test/round13.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 220) : "")); console.log(log[log.length - 1]); };
(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
  const mem = path.join(os.tmpdir(), "sp-test-memory"); fs.rmSync(mem, { recursive: true, force: true }); fs.mkdirSync(mem, { recursive: true }); fs.writeFileSync(path.join(mem, "MEMORY.md"), "# Memory Index\n- [user.md](user.md): who they are");
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none", SP_TEST_MEMORY: mem }), args: [path.join(__dirname, ".."), "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"], cwd: path.join(__dirname, "..") });
  app.process().stderr.on("data", (d) => { if (!/Debugger|inspector/.test(String(d))) console.log("[main] " + String(d).slice(0, 400)); }); app.process().on("exit", (c) => console.log("[main exited]", c));
  const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);
  const sent = async () => (await page.evaluate(() => window.panel.testState())).sent;

  // ---- readable text in both themes: every text style in calls, chats and visuals ----
  const contrast = async () => page.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const a = m[3] === undefined ? 1 : m[3]; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return { L: 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]), a }; };
    const box = document.createElement("div"); box.style.cssText = "position:fixed;left:0;top:0;width:600px;background:var(--plane);padding:10px;z-index:999";
    box.innerHTML = `<div class="call-line blink">Spoken part<div class="call-more">More words shown, not spoken</div></div><div class="chatrow"><span class="ct"><b>Title</b><span class="m">Preview</span></span><span class="cw m">9:40 PM</span></div><div class="chatday">Today</div>` + md("x\n```blink-card\n" + JSON.stringify({ type: "stat", title: "Battery", value: 62, unit: "%", note: "About 3 hours left" }) + "\n```") + `<div class="call-state">Thinking<span class="call-secs">4 s</span></div>`;
    document.body.appendChild(box);
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; } return getComputedStyle(document.body).backgroundColor; };
    const out = [];
    for (const sel of [".call-more", ".chatrow .ct b", ".chatrow .m", ".chatday", ".vc-t", ".vc-stat b", ".vc-stat span", ".vc-n", ".call-secs"]) {
      const el = box.querySelector(sel); if (!el) { out.push(sel + " missing"); continue; }
      const fg = lum(getComputedStyle(el).color), bg = lum(bgOf(el));
      const r = (Math.max(fg.L, bg.L) + 0.05) / (Math.min(fg.L, bg.L) + 0.05);
      if (r < 3 || fg.a < 0.6) out.push(sel + " " + r.toFixed(2));
    }
    box.remove(); return out;
  });
  await page.evaluate(() => { document.documentElement.classList.remove("dark"); }); await wait(200);
  let bad = await contrast(); ok("light theme: all new text is readable (contrast 3:1 or better)", !bad.length, bad.join(", "));
  await page.evaluate(() => { document.documentElement.classList.add("dark"); }); await wait(200);
  bad = await contrast(); ok("dark theme: all new text is readable (the faded call text was black on dark before)", !bad.length, bad.join(", "));

  // ---- remember: into Claude Code's memory (a test folder here) ----
  const rem = await page.evaluate(() => window.panel.testTool ? null : null);
  void rem;
  const r1 = await page.evaluate(() => window.panel.act("testTool", { name: "remember", args: { fact: "I prefer metric units and 24-hour time", kind: "user" } }));
  const files = fs.readdirSync(mem).filter((f) => /^blink-/.test(f));
  const idx = fs.readFileSync(path.join(mem, "MEMORY.md"), "utf8");
  ok("'remember' saves a memory file Claude Code reads, and adds it to the index", r1 && /remember/i.test(r1.say || "") && files.length === 1 && /metric units/.test(fs.readFileSync(path.join(mem, files[0]), "utf8")) && idx.includes(files[0]) && idx.startsWith("# Memory Index"), JSON.stringify(r1) + " | " + files.join(","));

  // ---- real work: handed to the full setup, shows in Chats ----
  const h = await page.evaluate(() => window.panel.act("testTool", { name: "claude_task", args: { task: "Write a one-page summary of my week", title: "Weekly summary" } }));
  ok("real work is handed to your full Claude setup and Blink says so", /Handed to your Claude setup/.test(h.say || ""), JSON.stringify(h));
  await wait(3000);
  const th = await page.evaluate(() => (D.threads || []).find((t) => t.title === "Weekly summary"));
  ok("the handed-over task shows in Chats", !!th && th.kind === "task", JSON.stringify(th && { kind: th.kind, state: th.state }));
  const args = await page.evaluate((id) => window.panel.act("testArgs", id), th && th.id);
  ok("it runs with your settings, skills and your own tools (not the lean Blink setup)", args && !args.includes("--setting-sources") && !args.includes("--strict-mcp-config") && args.includes("--append-system-prompt-file"), JSON.stringify(args).slice(0, 200));
  ok("when it's done it moves to the Claude app", (await sent()).some((x) => /^desktop /.test(x)), (await sent()).slice(-4).join(" | "));

  // ---- a call: a task handed over during it is announced; the call moves to the Claude app when it ends ----
  await page.evaluate(() => H.callStart()); await wait(700);
  const h2 = await page.evaluate(() => window.panel.act("testTool", { name: "claude_task", args: { task: "Draft a reply to the landlord", title: "Landlord reply" }, call: true }));
  await wait(3500);
  ok("in a call, Blink says when the handed-over work is done", await page.evaluate(() => Call.lines.some((l) => /finished Landlord reply/.test(l.text || "")) || /finished Landlord reply/.test(D.ui.lastSpoken || "")), JSON.stringify(h2));
  const before = (await sent()).filter((x) => /^desktop /.test(x)).length;
  await page.evaluate(() => { Call.lines = [{ who: "you", text: "what's on today" }, { who: "blink", text: "Two meetings." }, { who: "you", text: "and tomorrow" }, { who: "blink", text: "One." }]; Call.end(); }); await wait(1500);
  ok("a real call (two or more things you said) moves to the Claude app when it ends", (await sent()).filter((x) => /^desktop /.test(x)).length > before, (await sent()).slice(-3).join(" | "));
  await page.evaluate(() => H.callStart()); await wait(700);
  const before2 = (await sent()).filter((x) => /^desktop /.test(x)).length;
  await page.evaluate(() => { Call.lines = [{ who: "you", text: "volume 30" }, { who: "blink", text: "Volume 30." }]; Call.end(); }); await wait(1500);
  ok("a one-line call (like 'volume 30') stays out of the Claude app", (await sent()).filter((x) => /^desktop /.test(x)).length === before2);
  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.rmSync(mem, { recursive: true, force: true });
  fs.mkdirSync(path.join(__dirname, "shots", "round13"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "round13", "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
