// This round: Blink asks once before using an app (card on the panel, or "yes" in a call), remembers it, Settings takes it back;
// "play ..." goes to the person's music source without any sign-in.
// Never uses the real mic, speakers, volume or music. Usage: node test/round8.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }), executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"]), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);
  const sent = async () => (await page.evaluate(() => window.panel.testState())).sent;
  const ask = (t) => page.evaluate((x) => window.panel.act("command", x), t);
  const appAsk = () => page.evaluate(() => ((D.claude && D.claude.approvals) || []).find((x) => x.source === "app") || null);
  const waitAsk = async () => { for (let i = 0; i < 20; i++) { const a = await appAsk(); if (a) return a; await wait(250); } return null; };

  // a music service without an app: no sign-in, no card
  let r = await ask("play bohemian rhapsody on youtube music");
  ok("play on YouTube Music: opens it, no sign-in or card", /YouTube Music/.test(r.say) && (await sent()).some((x) => /^music ytmusic bohemian rhapsody/.test(x)) && !(await appAsk()), r.say);

  // Spotify: the first time, the panel asks; Allow is remembered
  const pending = ask("play blinding lights on spotify");
  const card = await waitAsk();
  ok("first use of an app shows 'Let Blink use ...?'", card && /Let Blink use Spotify\?/.test(card.what), card && card.what);
  await wait(400);
  ok("the card shows Allow and Not now", await page.evaluate(() => /Allow/.test(document.body.textContent) && /Not now/.test(document.body.textContent)));
  await page.click("[data-act=approve] >> text=Allow").catch(async () => { await page.evaluate((id) => window.panel.act("approve", { id, decision: "allow" }), card.id); });
  r = await pending;
  ok("after Allow, Blink plays it", /Playing blinding lights/.test(r.say) && (await sent()).some((x) => /^pressPlay spotify blinding lights/.test(x)), r.say);
  ok("Allow is remembered", await page.evaluate(() => D.cfg.appAllow && D.cfg.appAllow.spotify === true));
  r = await ask("play levitating on spotify");
  ok("second time: no card, just plays", /Playing levitating/.test(r.say) && !(await appAsk()), r.say);

  // Not now: nothing happens, nothing is remembered, Blink says so plainly
  const p2 = ask("play hello on spotify");
  await page.evaluate(() => window.panel.act("appForget", "spotify")); // take it back first (as Settings does)
  const p3 = ask("play hello again on spotify");
  const c2 = await waitAsk();
  if (c2) await page.evaluate((id) => window.panel.act("approve", { id, decision: "deny" }), c2.id);
  r = await p3; await p2;
  ok("Not now: shows the search, doesn't play, not remembered", /Here's hello again on Spotify/.test(r.say) && !(await page.evaluate(() => D.cfg.appAllow && D.cfg.appAllow.spotify)), r.say);

  // in a call, Blink asks out loud and "yes" answers
  await page.evaluate(() => H.callStart()); await wait(600);
  const p4 = ask("play halo on spotify");
  const c3 = await waitAsk(); await wait(500);
  ok("call: the card is in the call screen and Blink asks", c3 && await page.evaluate(() => /Let Blink use Spotify\?/.test(document.querySelector(".callsheet").textContent) && Call.lines.some((l) => /Can I use Spotify/.test(l.text) || l.who === "blink")));
  await page.evaluate(() => Call.handle("yes")); r = await p4;
  ok("call: saying yes allows it", /Playing halo/.test(r.say) && await page.evaluate(() => D.cfg.appAllow.spotify === true), r.say);
  await page.evaluate(() => Call.end(true)); await wait(400);

  // Settings: pick the music source; the apps Blink can use, tap to take back
  await page.evaluate(() => { D.ui.setMore = true; H.sheet ? H.sheet("settings") : (D.ui.sheet = "settings"); drawSheet(); }); await wait(500);
  const txt = await page.evaluate(() => (document.querySelector(".sheet") || document.body).textContent);
  ok("Settings: Music source choice is there", /Music/.test(txt) && /YouTube Music/.test(txt) && /Apple Music/.test(txt));
  ok("Settings: allowed apps are listed", /Apps Blink can use/.test(txt) && /spotify/i.test(txt));
  await page.evaluate(() => H.appForget("spotify")); await wait(300);
  ok("Settings: tapping an app takes it back", await page.evaluate(() => !D.cfg.appAllow.spotify));
  await page.evaluate(() => window.panel.act("saveSettings", { musicSource: "apple" })); await wait(300);
  r = await ask("play yellow");
  ok("Music set to Apple Music: 'play yellow' goes there", /Apple Music/.test(r.say) && (await sent()).some((x) => /^music apple yellow/.test(x)), r.say);
  r = await ask("start the game");
  ok("'start ...' isn't treated as music", !(r && /Apple Music|Spotify|YouTube/.test(r.say || "")), r && r.say);

  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.mkdirSync(path.join(__dirname, "shots", "round8"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "round8", "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
