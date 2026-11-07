// This round: what this PC's apps and Windows can do, by voice or typing, keys and routines, with no AI.
// Never touches real apps, windows, volume, power or music (test mode records what would happen). Usage: node test/round10.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
(async () => {
  // ---- the parser, with a typical PC's apps ----
  const c = require("../src/commands");
  const ctx = { keys: [], people: [{ label: "Sara", action: { type: "person", email: "sara@example.com" } }], playlists: [], layouts: ["Home", "Work"], apps: ["Spotify", "Discord", "Microsoft Teams", "Google Chrome", "Microsoft Word", "Steam", "Zoom Workplace"].map((name) => ({ name })), games: [{ id: "1245620", name: "Elden Ring", url: "steam://rungameid/1245620" }], hasAI: true, meeting: null, name: "" };
  const P = (t) => c.parse(t, ctx) || {};
  const conn = (t) => { const r = P(t); return r.act === "connector" ? r.arg.cid + "." + r.arg.aid : r.act || (r.ai ? "ai" : "?"); };
  const cases = [
    ["mute me on teams", "teams.mute"], ["raise my hand", "teams.hand"], ["leave the meeting", "teams.leave"],
    ["mute me on discord", "discord.mute"], ["deafen me", "discord.deafen"],
    ["open steam downloads", "steam.downloads"], ["show my steam friends", "steam.friends"],
    ["join zoom meeting 812 3456 7890", "zoom.join"],
    ["bluetooth settings", "windows.settings"], ["switch to word", "windows.switch"], ["close chrome", "windows.close"],
    ["put spotify on the left and chrome on the right", "windows.snap"], ["set brightness to 40", "windows.bright"],
    ["shut down the pc", "windows.shutdown"], ["cancel shutdown", "windows.cancelpower"], ["record the last 30 seconds", "windows.clip"],
    ["turn off wifi", "windows.wifi"],
    ["chat with sara", "personDo"], ["sara on teams", "personDo"],
    ["go to sleep", "ai"], ["close the door", "ai"], ["start a timer", "ai"], ["what's the capital of japan", "ai"]
  ];
  const bad = cases.filter(([t, want]) => conn(t) !== want).map(([t, want]) => t + " -> " + conn(t) + " (want " + want + ")");
  ok("everyday phrases go to the right app action, and the rest to the AI (" + cases.length + " phrases)", !bad.length, bad.join("; "));
  const snap = P("put spotify on the left and chrome on the right");
  ok("both apps are kept when snapping two", snap.arg && snap.arg.params.left === "spotify" && snap.arg.params.right === "chrome", JSON.stringify(snap.arg));
  const dnd = P("do not disturb for 2 hours");
  ok("do not disturb uses the panel's Focus for the time you said", dnd.act === "focusFor" && dnd.arg === 120, JSON.stringify(dnd));
  const noTeams = c.parse("mute me on teams", Object.assign({}, ctx, { apps: [{ name: "Spotify" }] })) || {};
  ok("app actions only exist for apps this PC has", noTeams.act !== "connector", JSON.stringify(noTeams));

  // ---- the app ----
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }), args: [path.join(__dirname, ".."), "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);
  const sent = async () => (await page.evaluate(() => window.panel.testState())).sent;
  const ask = (t) => page.evaluate((x) => window.panel.act("command", x), t);
  let r = await ask("shut down the pc");
  ok("shutdown says you have a minute and how to cancel", /one minute/.test(r.say) && /cancel shutdown/.test(r.say) && (await sent()).includes("power shutdown"), r.say);
  r = await ask("cancel shutdown");
  ok("cancel shutdown cancels", /Cancelled/.test(r.say) && (await sent()).includes("power cancel"), r.say);
  r = await ask("set brightness to 40");
  ok("brightness", /Brightness 40/.test(r.say) && (await sent()).includes("brightness 40"), r.say);
  r = await ask("turn off wifi");
  ok("Wi-Fi: opens its settings and says why it won't switch itself off", /Wi-Fi settings/.test(r.say) && (await sent()).includes("open ms-settings:network-wifi"), r.say);
  r = await ask("do not disturb for an hour");
  ok("do not disturb starts Focus", /Do not disturb for 1 hour/.test(r.say), r.say);
  r = await ask("close side panel");
  ok("it doesn't close itself", !/Closed/.test(r.say || ""), r.say);

  // apps this test PC really has decide what shows; add a key from "In apps"
  const list = await page.evaluate(() => window.panel.act("connectorList"));
  ok("the app actions list has Windows actions on any PC", list && list.list && list.list.some((x) => x.id === "windows" && x.actions.some((a) => a.id === "shutdown")), JSON.stringify((list.list || []).map((x) => x.id)));
  await page.evaluate(() => { H.addKey("home"); }); await wait(500);
  await page.evaluate(() => H.addKeyTab("inapps")); await wait(1200);
  const tabTxt = await page.evaluate(() => (document.querySelector(".sheet") || document.body).textContent);
  ok("Add a key has an 'In apps' tab listing actions", /In apps/.test(tabTxt) && /Shut down/.test(tabTxt) && /Screen brightness/.test(tabTxt), tabTxt.slice(0, 120));
  // a key that needs a detail: brightness 30
  await page.fill("#ap-windows-bright-level", "30"); await page.evaluate(() => H.pickAppAction({ cid: "windows", aid: "bright" })); await wait(800);
  const key = await page.evaluate(() => Object.values(D.cfg.keySets).flat().find((k) => k.action && k.action.type === "action" && k.action.aid === "bright"));
  ok("an app-action key is saved with its detail", key && key.action.params && key.action.params.level === "30", JSON.stringify(key && key.action));
  if (key) { await page.evaluate((id) => window.panel.act("key", id), key.id); await wait(400); }
  ok("tapping that key does it", (await sent()).filter((x) => x === "brightness 30").length >= 1, (await sent()).slice(-3).join(" | "));
  // a routine made of app actions is accepted
  r = await ask("when I start a game, do not disturb for an hour, record the last 30 seconds");
  ok("routines accept app actions", /Routine saved/.test(r.say || ""), r.say);

  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.mkdirSync(path.join(__dirname, "shots", "round10"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "round10", "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
