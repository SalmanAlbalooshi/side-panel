// This round: notes that stay on screen until ticked off, more shortcuts, and the update pop-up.
// Never touches your real apps, keys, mic or speakers. Usage: node test/round14.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 220) : "")); console.log(log[log.length - 1]); };
(async () => {
  for (const f of ["config.json", "ai"]) { try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  const launch = async () => {
    const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }), args: [path.join(__dirname, ".."), "--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"], cwd: path.join(__dirname, "..") });
    const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);
    return { app, page, errors };
  };
  let { app, page, errors } = await launch();
  const ask = (t) => page.evaluate((x) => window.panel.act("command", x), t);
  const home = () => page.evaluate(() => document.querySelector("#app").textContent);

  // ---- notes ----
  let r = await ask("note: send Ahmed the revised deck by Thursday");
  await wait(600); ok("'note: ...' adds it, with its due day", /Noted, by Thursday/.test(r.say) && await page.evaluate(() => (D.cfg.notes || []).some((n) => n.text === "send Ahmed the revised deck" && n.due === "Thursday")), r.say);
  await ask("todo call the bank"); await wait(800);
  ok("notes are always on the home screen (top of Needs a look)", /send Ahmed the revised deck/.test(await home()) && /by Thursday/.test(await home()) && /call the bank/.test(await home()));
  r = await ask("what's on my list"); ok("'what's on my list' reads them out", /You have 2/.test(r.say) && /revised deck/.test(r.say), r.say);
  r = await ask("done with the deck"); ok("'done with the deck' ticks the right one off", /Ticked off: send Ahmed the revised deck/.test(r.say) && /1 left/.test(r.say), r.say);
  await wait(600);
  ok("a ticked note shows crossed out for a while", await page.evaluate(() => [...document.querySelectorAll(".note.done .nt")].some((e) => /revised deck/.test(e.textContent))));
  await page.click(".note:not(.done) .ntick"); await wait(600);
  ok("tapping the box ticks a note off", await page.evaluate(() => (D.cfg.notes || []).every((n) => n.done)));
  r = await ask("clear done notes"); ok("'clear done notes' clears them", /Cleared 2/.test(r.say) && await page.evaluate(() => !(D.cfg.notes || []).length), r.say);
  await ask("note: renew parking permit by 5pm"); await wait(500);
  await app.close(); ({ app, page, errors } = await launch());
  ok("notes survive a restart", /renew parking permit/.test(await home()));

  // ---- a Notes widget can be placed on any layout ----
  ok("'Notes' is a widget you can add", await page.evaluate(() => typeof W.notes === "object" && /renew parking permit/.test(W.notes.render({ w: 2, h: 2 }, D))));

  // ---- more shortcuts in Add a key ----
  await page.evaluate(() => { H.addKey("home"); H.addKeyTab("shortcuts"); }); await wait(500);
  const t = await page.evaluate(() => document.querySelector(".sheet").textContent);
  ok("useful shortcuts are ready to add (Teams share screen, lock, plain-text paste, voice typing...)", ["Teams: share screen", "Lock the PC", "Paste as plain text", "Voice typing", "Text from a screenshot", "Outlook: new meeting"].every((x) => t.includes(x)), t.slice(0, 100));
  await page.evaluate(() => closeSheet());

  // ---- update pop-up: once per version, with Update now and Later ----
  const pop = await page.evaluate(async () => {
    try { localStorage.removeItem("sp-update-seen"); } catch { }
    D.ui.allowUpdatePopup = true; D.update = { status: "available", latest: "9.9.9", notes: "- Faster voice\n- Notes on screen" };
    maybeShowUpdate();
    const shown = D.ui.sheet === "update" && /9\.9\.9/.test(document.querySelector(".sheet").textContent) && !!document.querySelector("[data-act=updateNow]") && !!document.querySelector("[data-act=updateLater]");
    H.updateLater(); maybeShowUpdate();
    return { shown, again: D.ui.sheet === "update" };
  });
  ok("a new version shows a pop-up with Update now and Later", pop.shown, JSON.stringify(pop));
  ok("after Later it doesn't nag again for the same version", !pop.again, JSON.stringify(pop));
  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.mkdirSync(path.join(__dirname, "shots", "round14"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "round14", "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
