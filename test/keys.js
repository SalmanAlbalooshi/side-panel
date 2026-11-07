// Deep keys as a user makes and uses them: a person, keyboard shortcuts (recorded by pressing them), a snippet,
// Teams and VS Code links, Outlook, a combo, editing a key. Nothing leaves the panel in test mode: the app records
// the link, key press or Outlook call it would make, and this test checks it. Usage: node test/keys.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");

const SHOTS = path.join(__dirname, "shots", "keys");
fs.mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
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
  await page.evaluate(() => window.panel.act("setLayout", "Home")); await wait(1500);
  const sent = async () => (await page.evaluate(() => window.panel.testState())).sent;
  const keyNamed = (label) => page.evaluate((l) => (D.cfg.keySets.home.find((k) => k.label === l) || {}).id, label);
  const press = async (label) => { const id = await keyNamed(label); await page.evaluate((i) => H.key(i), id); await wait(700); };
  const open = async (tab) => { await page.evaluate((t) => { D.ui.addKey.set = "home"; D.ui.addKey.tab = t; openSheet("addKey"); }, tab); await wait(400); };

  // a person: tap asks how to reach them
  await open("people");
  await page.fill("#pName", "Sara"); await page.fill("#pEmail", "sara.ahmed@example.com"); await page.fill("#pPhone", "+973 3311 2233");
  await shot(page, "01-person-form");
  await page.click("[data-act=pickPerson]"); await wait(600);
  ok("person: key added", !!(await keyNamed("Sara")));
  await press("Sara");
  ok("person: tap shows how to reach them", await page.evaluate(() => D.ui.sheet === "person"));
  await shot(page, "02-person-menu");
  await page.click("[data-act=personDo][data-arg*='\"chat\"']"); await wait(500);
  await page.evaluate(() => openSheet("person")); await wait(200);
  await page.click("[data-act=personDo][data-arg*='\"call\"']"); await wait(500);
  await page.evaluate(() => openSheet("person")); await wait(200);
  await page.click("[data-act=personDo][data-arg*='mails']"); await wait(500);
  await page.evaluate(() => openSheet("person")); await wait(200);
  await page.click("[data-act=personDo][data-arg*='whatsapp']"); await wait(500);
  let s = await sent();
  ok("person: Teams chat opens their chat", s.some((x) => /^open (msteams:|https:\/\/teams\.microsoft\.com)\/l\/chat\/0\/0\?users=sara\.ahmed%40example\.com$/.test(x)), s.join(" | "));
  ok("person: Teams call", s.some((x) => /\/l\/call\/0\/0\?users=sara\.ahmed%40example\.com$/.test(x)));
  ok("person: their emails search Outlook", s.includes("outlook from:sara.ahmed@example.com"));
  ok("person: WhatsApp uses the number", s.includes("open whatsapp://send?phone=97333112233"));
  await page.evaluate(() => closeSheet());
  // a bad email is refused
  await open("people"); await page.fill("#pEmail", "sara@"); await page.click("[data-act=pickPerson]"); await wait(300);
  ok("person: half an email is refused", (await page.evaluate(() => D.cfg.keySets.home.filter((k) => k.action.type === "person").length)) === 1);
  await page.evaluate(() => closeSheet());

  // keyboard shortcut recorded by pressing it
  await open("shortcuts");
  await page.click("#hkKeys"); await page.keyboard.press("Control+Shift+KeyM"); await wait(200);
  ok("shortcut: pressing keys records them", (await page.inputValue("#hkKeys")) === "ctrl+shift+m", await page.inputValue("#hkKeys"));
  await page.fill("#hkName", "Mute Teams"); await page.click("[data-act=pickHotkey]"); await wait(500);
  await press("Mute Teams");
  s = await sent();
  ok("shortcut: tap presses Ctrl+Shift+M on the main screen", s.includes("keys 17,16,77"), s.slice(-2).join(" | "));
  // a preset and a snippet
  await open("shortcuts");
  await page.click("[data-act=pickKey][data-arg*='win+shift+s']"); await wait(400);
  await open("shortcuts");
  await page.fill("#txText", "Best regards,\nAlex"); await page.fill("#txName", "Signature"); await page.click("[data-act=pickText]"); await wait(400);
  await app.evaluate(({ clipboard }) => clipboard.writeText("what I had copied"));
  await press("Signature"); await wait(1800);
  s = await sent();
  ok("snippet: pastes into the active app", s.includes("keys 17,86"));
  ok("snippet: your clipboard comes back", (await app.evaluate(({ clipboard }) => clipboard.readText())) === "what I had copied");

  // links that land on a place
  await open("links");
  await page.fill("#lnUrl", "https://teams.microsoft.com/l/channel/19%3aabc%40thread.tacv2/General?groupId=1&tenantId=2"); await page.fill("#lnName", "DT channel");
  await page.click("[data-act=pickLink]"); await wait(400);
  await open("links");
  await page.fill("#lnUrl", "javascript:alert(1)"); await page.click("[data-act=pickLink]"); await wait(300);
  await page.fill("#lnUrl", "slack://channel?team=T123&id=C456"); await page.fill("#lnName", "Slack team"); await page.click("[data-act=pickLink]"); await wait(400);
  ok("links: Teams channel and Slack channel keys", !!(await keyNamed("DT channel")) && !!(await keyNamed("Slack team")));
  ok("links: a javascript link is refused", !(await page.evaluate(() => D.cfg.keySets.home.some((k) => /javascript/i.test(JSON.stringify(k))))));
  await press("DT channel"); s = await sent();
  ok("links: Teams channel key opens that channel", s.some((x) => x.startsWith("open https://teams.microsoft.com/l/channel/19%3aabc")));
  // Outlook
  await open("outlook");
  await page.fill("#olFolder", "Projects/Website"); await page.click("[data-act=pickOutlook][data-arg*='folder']"); await wait(400);
  await press("Website"); s = await sent();
  ok("outlook: folder key opens that folder", s.includes("outlook folder:Projects/Website"));
  // combo: open the Teams channel, then mute
  await open("combo");
  await page.click("[data-act=comboAdd][data-arg*='" + (await keyNamed("DT channel")) + "']");
  await page.click("[data-act=comboAdd][data-arg*='" + (await keyNamed("Mute Teams")) + "']");
  await page.fill("#cbName", "Join and mute"); await shot(page, "03-combo");
  await page.click("[data-act=pickCombo]"); await wait(500);
  const before = (await sent()).length;
  await press("Join and mute"); await wait(2500);
  s = (await sent()).slice(before);
  ok("combo: runs its steps in order", s.length === 2 && s[0].startsWith("open https://teams.microsoft.com/l/channel") && s[1] === "keys 17,16,77", s.join(" | "));

  // edit mode: tap a key to change it
  ok("more keys than fit: pages with arrows and dots", (await page.$$(".kpn .dots i")).length >= 2, await page.evaluate(() => { const L = D.cfg.layouts.find((l) => l.name === D.cfg.activeLayout); return D.cfg.activeLayout + " keys=" + D.cfg.keySets.home.length + " w=" + JSON.stringify(L.widgets.filter((x) => x.type === "keys")) + " sheet=" + D.ui.sheet + " edit=" + D.ui.editing; }));
  const firstPage = await page.$$eval(".keys[data-swipe] .k .l", (x) => x.map((e) => e.textContent).join(","));
  await page.click("[data-act=keyPage][data-arg*='\"d\":1']"); await wait(500);
  const secondPage = await page.$$eval(".keys[data-swipe] .k .l", (x) => x.map((e) => e.textContent).join(","));
  ok("arrow shows the next keys", secondPage !== firstPage && secondPage.length > 0, secondPage);
  await shot(page, "03b-keys-page-2");
  const box = await (await page.$(".keys[data-swipe]")).boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2, { steps: 6 }); await page.mouse.up(); await wait(500);
  ok("swiping right goes back", (await page.$$eval(".keys[data-swipe] .k .l", (x) => x.map((e) => e.textContent).join(","))) === firstPage);
  ok("the swipe didn't open a key", !(await page.evaluate(() => D.ui.sheet)));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, 120); await wait(1200);
  ok("mouse wheel flips to the next page", (await page.$$eval(".keys[data-swipe] .k .l", (x) => x.map((e) => e.textContent).join(","))) === secondPage);
  ok("an All button still lists everything", !!(await page.$("[data-act=allKeys]")), await page.evaluate(() => (document.querySelector(".keys[data-swipe]") || {}).parentElement ? document.querySelector(".keys[data-swipe]").parentElement.querySelector(".wt").outerHTML.slice(0, 300) : "no keys"));
  await page.click("[data-act=allKeys]"); await wait(400);
  ok("all keys: every key is there", (await page.$$(".akeys .k")).length === (await page.evaluate(() => D.cfg.keySets.home.length)));
  await page.click("[data-act=arrange]"); await wait(300);
  const firstBefore = await page.evaluate(() => D.cfg.keySets.home[0].label);
  await page.click(".akey:nth-child(1) [data-act=moveKey]:nth-child(2)"); await wait(400);
  ok("all keys: arrows reorder", (await page.evaluate(() => D.cfg.keySets.home[1].label)) === firstBefore);
  await shot(page, "04a-all-keys");
  await page.click(`.akeys .k[data-arg*='${await keyNamed("Signature")}']`); await wait(400);
  ok("edit: tapping a key in edit mode opens its editor", await page.evaluate(() => D.ui.sheet === "editKey"));
  await page.fill("#ekLabel", "Sign-off"); await page.fill("#ekText", "Thanks,\nAlex");
  await shot(page, "04-edit-key");
  await page.click("[data-act=ekSave]"); await wait(500);
  ok("edit: changes saved", await page.evaluate(() => D.cfg.keySets.home.some((k) => k.label === "Sign-off" && k.action.text === "Thanks,\nAlex")));
  await page.evaluate(() => H.editDone()); await wait(1500);
  await page.reload(); await page.waitForSelector(".top"); await wait(2500);
  ok("keys survive a restart of the page", await page.evaluate(() => ["Sara", "Mute Teams", "Sign-off", "DT channel", "Join and mute", "Website"].every((l) => D.cfg.keySets.home.some((k) => k.label === l))), await page.evaluate(() => D.cfg.keySets.home.map((k) => k.label).join(",")));
  await shot(page, "05-home-with-keys");
  ok("no page errors (keys)", errors.length === 0, errors.slice(0, 5).join(" | "));
  await app.close();
  fs.writeFileSync(path.join(SHOTS, "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
