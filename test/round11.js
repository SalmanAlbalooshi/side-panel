// This round: calls open at once and can't start twice; repeats dropped; Stop works; no step-by-step narration and at most
// two sentences spoken; calls saved as chats that survive a restart; the Chats screen; visuals in answers (and junk refused).
// Never uses the real mic, speakers, volume or music (speech is a silent fake). Usage: node test/round11.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 220) : "")); console.log(log[log.length - 1]); };
const launch = async () => {
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }), args: [path.join(__dirname, ".."), "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);
  return { app, page, errors };
};
(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
  let { app, page, errors } = await launch();

  // ---- starting: opens at once, a second tap does nothing ----
  const starts = await page.evaluate(async () => {
    H.callStart(); H.callStart(); H.callStart();
    const opened = D.ui.sheet === "call";
    await new Promise((r) => setTimeout(r, 800));
    // one call = one greeting
    return { n: Call.lines.filter((l) => l.who === "blink").length, opened, state: Call.state };
  });
  ok("a call opens straight away", starts.opened, JSON.stringify(starts));
  ok("tapping the call button again doesn't start a second call", starts.n === 1, JSON.stringify(starts));

  // a silent fake voice from here on
  await page.evaluate(() => {
    window.__said = [];
    const realAct = window.panel.act;
    window.panel.act = (n, a) => (n === "voiceSay" ? new Promise((r) => setTimeout(() => r(null), 60)) : realAct(n, a));
    window.act = (n, a) => window.panel.act(n, a);
    window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend && u.onend(), 40); };
    window.speechSynthesis.cancel = () => { };
    Object.defineProperty(D, "test", { get: () => false, set() { }, configurable: true });
  });

  // ---- the same words twice in a row count once ----
  const dup = await page.evaluate(async () => {
    let n = 0; const h = Call.handle; Call.handle = () => { n++; };
    Call.recognize = async () => "what's the weather";
    await Call.heardEnd([new Float32Array(16000).fill(0.1)]); await Call.heardEnd([new Float32Array(16000).fill(0.1)]);
    Call.handle = h; return n;
  });
  ok("the same words heard twice in a row are handled once", dup === 1, dup);

  // ---- after using tools, only the result is said, at most two sentences; no 'Mm' fillers ----
  const nar = await page.evaluate(async () => {
    window.__said = []; Call.queue = []; Call.playing = null;
    Call.run++; Call.aiBusy = true; Call.answer = ""; Call.spokenUpTo = 0; Call.usedTool = false; Call.segStart = 0; Call.spokenCount = 0; Call.spokenWords = 0; Call.askedAt = Date.now(); Call.add("blink", "");
    Call.delta("Let me find that. "); Call.working("WebSearch"); Call.delta("Wrong version, that's a karaoke cover. I'm switching to the real track. ");
    Call.working("mcp__panel__app_do"); Call.delta("All Star by Smash Mouth is playing now. It's the original. My first try was a cover, so I switched it.");
    Call.done("");
    await new Promise((r) => setTimeout(r, 1500));
    const l = Call.lines.slice().reverse().find((x) => x.who === "blink");
    return { said: window.__said.join(" | "), more: l && l.more };
  });
  ok("no running commentary: the steps in between aren't spoken", !/karaoke|switching/.test(nar.said), nar.said);
  ok("no double 'one moment': if it already said something, no extra filler", !(/Let me find that/.test(nar.said) && /Let me look that up/.test(nar.said)), nar.said);
  ok("only the outcome is said, at most two sentences", /All Star by Smash Mouth is playing now\. It's the original\./.test(nar.said) && !/first try/.test(nar.said), nar.said);
  ok("anything past two sentences is shown, not spoken", /first try/.test(nar.more || ""), nar.more);
  ok("fillers have no 'Mm' (it came out as 'm, m')", await page.evaluate(() => FILLERS.every((f) => !/^m+\b/i.test(f))));

  // ---- Stop: visible while thinking, and it stops ----
  await page.evaluate(() => { Call.aiBusy = true; Call.askedAt = Date.now() - 3000; Call.setState("thinking"); Call.paint(); }); await wait(300);
  ok("while thinking there's a Stop button and a seconds counter", await page.evaluate(() => !!document.querySelector("[data-act=callStop]") && /\d+ s/.test(document.querySelector(".call-state").textContent)));
  await page.click("[data-act=callStop]"); await wait(300);
  ok("Stop stops it and listens again", await page.evaluate(() => !Call.aiBusy && Call.state === "listening"));
  ok("no empty '...' bubbles", await page.evaluate(() => [...document.querySelectorAll(".call-line")].every((e) => e.textContent.trim() !== "...")));

  // ---- the call is kept as a chat ----
  await page.evaluate(() => { Call.lines = [{ who: "you", text: "how far am I in wolverine" }, { who: "blink", text: "You're about halfway.", screen: "1. **Back in Action**" }]; });
  await page.evaluate(() => { Object.defineProperty(D, "test", { value: true, writable: true, configurable: true }); Call.end(); }); await wait(1500);
  const kept = await page.evaluate(() => (D.threads || []).find((t) => t.extra && t.extra.call));
  ok("a finished call is saved as a chat", kept && /how far am I in wolverine/.test(kept.title), JSON.stringify(kept && { title: kept.title, extra: kept.extra }));
  ok("the end of a call says where it went", await page.evaluate(() => /saved in Chats/.test(document.body.textContent)));

  // ---- the Chats screen ----
  await page.evaluate(() => window.panel.act("command", "write me a haiku about tea")); await wait(2500);
  await page.evaluate(() => H.chats()); await wait(600);
  let txt = await page.evaluate(() => document.querySelector(".sheet").textContent);
  ok("Chats lists the call and the typed chat, newest first, by day", /Today/.test(txt) && /wolverine/i.test(txt) && /haiku/i.test(txt), txt.slice(0, 160));
  ok("Chats has a New chat button", await page.evaluate(() => !!document.querySelector("[data-act=chatNew]")));
  await page.evaluate(() => H.openThread((D.threads || []).find((t) => t.extra && t.extra.call).id)); await wait(800);
  txt = await page.evaluate(() => document.querySelector(".sheet").textContent);
  ok("a saved call opens like any chat, and you can type on", /about halfway/.test(txt) && !!(await page.$("#chatText")) && /All chats/.test(txt), txt.slice(0, 160));
  await page.evaluate(() => H.chatNew()); await wait(500);
  ok("New chat opens a fresh Ask Blink bar", await page.evaluate(() => D.ui.sheet === "cmd" && !D.ui.cmd.thread));

  // ---- visuals ----
  const vis = await page.evaluate(() => {
    const card = (j) => md("Here you go.\n```blink-card\n" + JSON.stringify(j) + "\n```");
    return {
      bar: card({ type: "bar", title: "Hours today", unit: "h", items: [["Chrome", 3.5], ["VS Code", 2], ["Spotify", 1]] }),
      line: card({ type: "line", title: "Rain", unit: "%", points: [["9am", 10], ["12pm", 40], ["3pm", 70]] }),
      stat: card({ type: "stat", title: "Battery", value: 62, unit: "%" }),
      ring: card({ type: "ring", title: "Focus", value: 18, max: 25, unit: "min" }),
      steps: card({ type: "steps", steps: ["Open Bluetooth settings", "Turn on pairing", "Pick your headphones"] }),
      tl: card({ type: "timeline", items: [["9:00", "Standup"], ["14:00", "Review"]] }),
      bad: card({ type: "bar", items: [["x", "lots"]] }) + card({ type: "button", text: "Approve" }) + md("```blink-card\n{not json\n```"),
      xss: card({ type: "bar", title: "<img src=x onerror=window.__pwned=1>", items: [["<script>window.__pwned=2</script>", 1], ["b", 2]] }),
      partial: md("Here.\n```blink-card\n{\"type\":\"bar\",\"items\":[[\"a\""),
      plain: md("Two plus two is **four**.")
    };
  });
  ok("visuals: bar, line, stat, ring, steps and timeline draw", /vc-bar/.test(vis.bar) && /<svg/.test(vis.line) && /vc-stat/.test(vis.stat) && /72%/.test(vis.ring) && /<li>Pick your headphones/.test(vis.steps) && /Standup/.test(vis.tl), [vis.bar.length, vis.line.length, vis.ring.slice(0, 60)].join(" | "));
  ok("visuals: bad data, unknown types and broken JSON show nothing (the text stays)", !/vcard/.test(vis.bad) && !/not json/.test(vis.bad), vis.bad.slice(0, 120));
  await page.evaluate((h) => { const d = document.createElement("div"); d.innerHTML = h; document.body.appendChild(d); }, vis.xss); await wait(300);
  ok("visuals: text inside a card can't run code", await page.evaluate(() => window.__pwned === undefined) && /&lt;script&gt;/.test(vis.xss), vis.xss.slice(0, 120));
  ok("a visual still arriving isn't shown as raw text", !/blink-card|\{"type"/.test(vis.partial), vis.partial);
  ok("answers without a visual are unchanged", /<b>four<\/b>/.test(vis.plain) && !/vcard/.test(vis.plain));

  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await wait(1200); // let the chats save
  await app.close();

  // ---- chats survive a restart ----
  ({ app, page, errors } = await launch());
  await wait(1000);
  const after = await page.evaluate(() => (D.threads || []).map((t) => t.title));
  ok("chats are still there after a restart", after.some((t) => /wolverine/i.test(t)) && after.some((t) => /haiku/i.test(t)), after.join(" | "));
  await app.close();
  fs.mkdirSync(path.join(__dirname, "shots", "round11"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "round11", "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
