// Mini at several sizes and states: fails on anything drawn outside the window. Usage: node test/mini-fit.js [noai]
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = path.join(__dirname, "shots", "mini-fit"); fs.mkdirSync(SHOTS, { recursive: true });
(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true }); } catch { }
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: process.argv[2] === "noai" ? "none" : path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }), args: [path.join(__dirname, ".."), "--test", "--windowed"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(2500);
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  await page.evaluate(() => H.shrink()); await wait(1500);
  const out = async (label) => {
    const r = await page.evaluate(() => {
      const W = window.innerWidth, Hh = window.innerHeight, bad = [];
      for (const el of document.querySelectorAll("#app *, .bk-bubble, .toast, #layer *")) {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        // inside a scrolling box is fine
        let p = el.parentElement, scroll = false; while (p && p !== document.body) { const cs = getComputedStyle(p); const pr = p.getBoundingClientRect(); if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY) && pr.right <= W + 1 && pr.bottom <= Hh + 1) { scroll = true; break; } p = p.parentElement; }
        if (scroll) continue;
        if (r.right > W + 1 || r.bottom > Hh + 1 || r.left < -1 || r.top < -1) bad.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + " [" + Math.round(r.left) + "," + Math.round(r.top) + " " + Math.round(r.width) + "x" + Math.round(r.height) + "]" + (el.textContent ? " " + el.textContent.trim().slice(0, 30) : ""));
      }
      return { W, H: Hh, bad: [...new Set(bad)].slice(0, 8), sideScroll: document.documentElement.scrollWidth > W + 1 };
    });
    console.log((r.bad.length || r.sideScroll ? "FAIL " : "PASS ") + "mini " + label + " fits" + (r.bad.length ? " - " + r.bad.join(" | ") : ""));
    await page.screenshot({ path: path.join(SHOTS, label.replace(/\W+/g, "-") + ".png") });
  };
  for (const [w, h] of [[440, 300], [360, 240], [300, 200], [620, 420]]) {
    await page.setViewportSize({ width: w, height: h }); await wait(700);
    await page.evaluate(() => { D.ui.miniAsk = false; lastAppHTML = ""; render(); }); await wait(400);
    await out(`${w}x${h} home`);
    await page.evaluate(() => { D.ui.miniAsk = true; D.ui.cmd.answer = null; D.ui.cmd.thread = null; D.ui.forceNameAsk = true; D.cfg.userName = ""; lastAppHTML = ""; render(); }); await wait(400);
    await out(`${w}x${h} name question`);
    await page.evaluate(() => { D.ui.forceNameAsk = false; D.ui.cmd.answer = { say: "That needs an AI. Pick one to ask in your browser:", web: "write a poem" }; lastAppHTML = ""; render(); }); await wait(400);
    await out(`${w}x${h} web AI buttons`);
    await page.evaluate(() => { D.ui.cmd.answer = { say: "A very long answer. ".repeat(30), go: { label: "Open Settings", act: "sheet", arg: "settings" } }; lastAppHTML = ""; render(); }); await wait(400);
    await out(`${w}x${h} long answer`);
    await page.evaluate(() => { D.ui.cmd.answer = null; lastAppHTML = ""; render(); const el = document.querySelector(".bk"); if (el) bkSay(el, "Routine done: when a game starts, all good."); }); await wait(500);
    await out(`${w}x${h} Blink bubble`);
    await page.evaluate(() => { toast("Getting a natural voice for Blink: 155 MB, once, from GitHub. It runs on this PC only."); }); await wait(300);
    await out(`${w}x${h} long message`);
  }
  console.log("errors:", errs.join(" | ") || "none");
  await app.close();
})();
