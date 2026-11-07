// The browser link for real: the panel prepares the add-on, a Chromium browser loads it, it connects by itself, and an
// AI tab's state shows on the panel. claude.ai is stood in by a local page with the same Stop button, because the real
// site needs a login. Usage: node test/browser-link.js
const { _electron: electron, chromium } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
async function until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return true; await wait(500); } return false; }
function chromiumExe() {
  const root = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) for (const sub of ["chrome-win64", "chrome-win"]) { const p = path.join(root, d, sub, "chrome.exe"); if (fs.existsSync(p)) return p; }
  return null;
}

(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(path.join(os.tmpdir(), "side-panel-test")) ? fs.readdirSync(path.join(os.tmpdir(), "side-panel-test")) : [])) try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  const env = Object.assign({}, process.env, { SP_WEB_PORT: "47832" });
  const app = await electron.launch({ env, executablePath: process.env.PANEL_EXE || undefined, args: process.env.PANEL_EXE ? ["--test", "--windowed"] : [path.join(__dirname, ".."), "--test", "--windowed"], cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow();
  await page.waitForSelector(".top", { timeout: 30000 });
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  await page.evaluate(() => openSheet("browser")); await wait(800);
  const r = await page.evaluate(() => window.panel.act("setupBrowserLink", "chrome"));
  ok("setup: add-on copied to a fixed folder", !!(r.folder && fs.existsSync(path.join(r.folder, "manifest.json"))), JSON.stringify(r));
  await page.evaluate(() => { D.ui.linkSetup = "chrome"; drawSheet(); }); await wait(300);
  await page.screenshot({ path: path.join(__dirname, "shots", "browser-setup.png") });

  // the test add-on talks to the test panel's port, never to a panel you have running
  for (const f of ["background.js", "manifest.json"]) { const p = path.join(r.folder, f); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/47822/g, "47832")); }
  const exe = chromiumExe();
  ok("test browser found", !!exe, exe);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "sp-chromium-"));
  const ctx = await chromium.launchPersistentContext(prof, { executablePath: exe, headless: true, args: ["--headless=new", "--disable-extensions-except=" + r.folder, "--load-extension=" + r.folder] });
  ok("add-on connects by itself after install", await until(() => page.evaluate(() => !!(D.web && D.web.paired)), 20000));

  let stop = false;
  await ctx.route("https://claude.ai/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><title>Trip plan - Claude</title><body><fieldset><button id="b" aria-label="Send">Send</button></fieldset></body>` }));
  const tab = await ctx.newPage();
  await tab.goto("https://claude.ai/chat/test");
  await tab.evaluate(() => { document.getElementById("b").setAttribute("aria-label", "Stop response"); });
  ok("a writing tab shows as working", await until(() => page.evaluate(() => (D.claude.sessions || []).some((s) => s.source === "web" && s.state === "working" && /Trip plan/.test(s.project))), 15000), await page.evaluate(() => JSON.stringify((D.claude.sessions || []).filter((s) => s.source === "web").map((s) => s.state + ":" + s.project))));
  await tab.evaluate(() => { document.getElementById("b").setAttribute("aria-label", "Send"); });
  ok("when it finishes it shows as your turn", await until(() => page.evaluate(() => (D.claude.sessions || []).some((s) => s.source === "web" && s.state === "yourturn")), 15000));
  await page.evaluate(() => closeSheet()); await wait(1200);
  await page.screenshot({ path: path.join(__dirname, "shots", "browser-tab-done.png") });
  await tab.close(); await wait(1500);
  ok("closing the tab removes it", await until(() => page.evaluate(() => !(D.claude.sessions || []).some((s) => s.source === "web")), 10000));
  await ctx.close();
  await app.close();
  fs.rmSync(prof, { recursive: true, force: true });
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
