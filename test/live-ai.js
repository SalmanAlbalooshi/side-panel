// Deep live test of Blink's conversation with the REAL Claude Code on this PC: casual talk, questions, tasks, PC actions,
// follow-ups that depend on context ("play it"), memory, hand-overs, Arabic, and the call's spoken/screen split.
// The app runs in test mode, so every PC action (music, apps, links, files, memory, hand-overs) is only RECORDED, never done.
// Usage: node test/live-ai.js   (takes a few minutes; uses your Claude Code)
const { _electron: electron } = require("playwright-core");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [], transcript = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).replace(/\s+/g, " ").slice(0, 260) : "")); console.log(log[log.length - 1]); };
const claude = execSync("where claude", { encoding: "utf8" }).split(/\r?\n/).find((l) => /\.(exe|cmd)$/i.test(l.trim())).trim();

(async () => {
  for (const f of ["config.json", "ai"]) { try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: claude, SP_CODEX: "none", SP_REAL_AI: "1" }), args: [path.join(__dirname, ".."), "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(2000);
  await page.evaluate(() => window.panel.act("saveSettings", { userName: "Alex", aiModel: "sonnet" }));
  const sent = async () => (await page.evaluate(() => window.panel.testState())).sent;
  // any "Let Blink use <app>?" card is allowed, as the person would
  setInterval(() => page.evaluate(() => { const a = ((D.claude && D.claude.approvals) || []).find((x) => x.source === "app"); if (a) window.panel.act("approve", { id: a.id, decision: "allow" }); }).catch(() => { }), 500);

  // ---- a voice call: one conversation, so follow-ups have context ----
  await page.evaluate(() => { window.__msgs = []; window.panel.onCall((m) => window.__msgs.push(m)); });
  const start = await page.evaluate(() => window.panel.act("callStart"));
  ok("call starts with the real AI", start && start.brain, JSON.stringify(start));
  // one turn: what Blink says (fast path or AI), what it did on the PC, how long
  const turn = async (text) => {
    const before = (await sent()).length, t0 = Date.now();
    await page.evaluate(() => { window.__msgs = []; });
    const r = await page.evaluate((x) => window.panel.act("callAsk", x), text);
    let reply = r.say || "", first = 0, tools = [];
    if (r.ai) {
      for (let i = 0; i < 180; i++) {
        await wait(500);
        const m = await page.evaluate(() => window.__msgs.splice(0));
        for (const x of m) { if (x.type === "delta" && !first) first = Date.now() - t0; if (x.type === "tool") tools.push(x.name); if (x.type === "done") { reply = x.text; i = 999; } if (x.type === "error") { reply = "ERROR " + x.text; i = 999; } }
      }
    }
    const did = (await sent()).slice(before);
    const spoken = reply.split("[screen]")[0].trim(), screen = reply.includes("[screen]") ? reply.split("[screen]")[1].trim() : "";
    transcript.push({ you: text, blink: reply, did, tools, ms: Date.now() - t0, firstMs: first });
    console.log("\n> " + text + "\n< " + reply.replace(/\s+/g, " ").slice(0, 400) + "\n  did: " + did.join(" | ").slice(0, 300) + (tools.length ? "\n  tools: " + tools.join(", ") : "") + "\n  " + (Date.now() - t0) + " ms" + (first ? ", first words " + first + " ms" : ""));
    return { reply, spoken, screen, did, tools, ai: !!r.ai };
  };
  const sentences = (t) => (t.match(/[^.!?]+[.!?]+/g) || [t]).length;

  let t = await turn("Hey Blink, how's it going?");
  ok("casual: a short, friendly reply, no tools", t.ai && sentences(t.spoken) <= 3 && !t.tools.length && !/\[screen\]/.test(t.spoken), t.reply);
  ok("casual: doesn't say it's a separate assistant", !/separate (entity|assistant|session)/i.test(t.reply), t.reply);

  t = await turn("Give me one great upbeat song to get me going. Just one, title and artist.");
  const song = t.reply; ok("question: suggests one song", t.ai && /\bby\b/i.test(t.reply), t.reply);
  t = await turn("Play it");
  const music = t.did.filter((x) => /^music |^open spotify|^pressPlay|^open https:\/\/music/.test(x)).join(" | ");
  const title = (song.match(/["“']?([A-Z][^"”'.,]{2,40})["”']?\s+by\s+([A-Z][\w .&'-]{2,40})/) || [])[1] || "";
  ok("context: 'play it' plays the song just suggested, not the words 'it'", !!music && !/music \w+ it$|search:it\b/i.test(music) && (!title || music.toLowerCase().includes(title.toLowerCase().split(" ")[0])), "song: " + song.slice(0, 90) + " | did: " + music);

  t = await turn("Play the music");
  const music2 = t.did.join(" | ");
  const songWord = (title.toLowerCase().match(/[a-z]{4,}/) || [""])[0];
  ok("context: 'play the music' right after still means that song (not a random first result, not 'or pause')", (/media play/.test(music2) || /already playing|is playing|playing now/i.test(t.reply) || (songWord && music2.toLowerCase().includes(songWord))) && !/search:(the%20music|or%20pause|pause)|music \w+ (the music|or pause)/i.test(music2), music2);

  t = await turn("What's 15 percent of 240?");
  ok("quick maths: right answer", /\b36\b/.test(t.reply), t.reply);

  t = await turn("What's the weather in London tomorrow?");
  ok("live facts: searches the web and answers (no 'I can't check')", t.tools.some((x) => /search/i.test(x)) && !/can't (check|access|browse)|don't have (access|real-time)/i.test(t.reply), t.tools.join(",") + " | " + t.reply);
  ok("after a search: the spoken part stays short (no step-by-step narration)", sentences(t.spoken) <= 3 && !/(let me|i'll|i will|now i'm|searching)/i.test(t.spoken.split(/[.!?]/).slice(-2).join(".")), t.spoken);

  t = await turn("Remind me in 20 minutes to stretch");
  ok("everyday command: instant, no AI", !t.ai && /20 minutes/.test(t.reply), t.reply);

  t = await turn("Remember that I prefer answers in metric units.");
  ok("memory: 'remember ...' is saved to Claude Code's memory", t.did.some((x) => /^remember /.test(x) && /metric/i.test(x)), t.did.join(" | "));

  t = await turn("Write me a detailed two-page project plan for launching a podcast, with milestones and a budget.");
  ok("real work: handed to the full Claude setup, not crammed into a voice answer", t.did.some((x) => /^handTask /.test(x)), t.did.join(" | ") + " | " + t.reply);
  ok("real work: Blink says it's handed over, briefly", sentences(t.spoken) <= 3, t.spoken);

  t = await turn("Open my downloads");
  ok("PC action by voice: instant", !t.ai && t.did.some((x) => /^folder downloads/.test(x)), t.did.join(" | "));

  t = await turn("How do I change my desktop wallpaper? Give me the steps.");
  ok("how-to: short spoken answer, the steps on screen", sentences(t.spoken) <= 3 && /\d\.|\n-|blink-card|steps/i.test(t.screen), t.reply);

  t = await turn("Tell me a quick joke.");
  ok("chat: a joke, short, no tools", t.ai && sentences(t.spoken) <= 4 && !t.tools.length, t.reply);

  t = await turn("كيف حالك اليوم؟");
  ok("Arabic: answers in Arabic", /[؀-ۿ]{3}/.test(t.reply), t.reply);

  t = await turn("Who is the current UN Secretary-General?");
  ok("facts that can change: checked, then answered", /Guterres|search/i.test(t.reply + t.tools.join(",")), t.tools.join(",") + " | " + t.reply);

  t = await turn("Note: send the budget to Sam by Thursday");
  ok("note by voice: added, instant", !t.ai && /Noted, by Thursday/.test(t.reply), t.reply);
  t = await turn("What's on my list?");
  ok("list by voice: read out", /budget to Sam/i.test(t.reply), t.reply);

  t = await turn("Open that");
  ok("vague follow-up 'open that' goes to the AI (it has the context), no crash", t.ai || /open/i.test(t.reply), t.reply);

  // ---- typed: the same brain rules in the Ask Blink bar ----
  const typed = await page.evaluate(() => window.panel.act("command", "In one sentence: what's the difference between RAM and storage?"));
  ok("typed question goes to the AI", !!typed.thread, JSON.stringify(typed));
  let ans = "";
  for (let i = 0; i < 90 && !ans; i++) { await wait(1000); ans = await page.evaluate((id) => { const t = (D.threads || []).find((x) => x.id === id); return t && t.state !== "running" ? t.summary || "(empty)" : ""; }, typed.thread); }
  console.log("\n> (typed) RAM vs storage\n< " + ans);
  ok("typed answer: correct and short", /memory|temporary|short-term|working/i.test(ans) && /storage|long-term|permanent|disk/i.test(ans), ans);

  ok("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.evaluate(() => window.panel.act("callEnd", { lines: [] })).catch(() => { });
  await app.close();
  fs.mkdirSync(path.join(__dirname, "shots", "live-ai"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "live-ai", "results.txt"), log.join("\n"));
  fs.writeFileSync(path.join(__dirname, "shots", "live-ai", "transcript.json"), JSON.stringify(transcript, null, 2));
  process.exit(0);
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
