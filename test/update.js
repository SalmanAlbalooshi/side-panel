// In-app update, end to end: an installed copy sees a newer release on a local stand-in for GitHub, downloads it,
// checks the checksum, swaps itself and restarts as the new version. A tampered download is refused.
// Needs a packaged build in release-1.4. Usage: node test/update.js
const { _electron: electron } = require("playwright-core");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
const BUILD = process.env.SP_BUILD || path.join(__dirname, "..", "release", "Side Panel-win32-x64");

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "sp-update-"));
  const installed = path.join(base, "Side Panel");
  fs.cpSync(BUILD, installed, { recursive: true });
  // the "new release": same build, version 9.9.9, with a marker file
  const next = path.join(base, "next");
  fs.cpSync(BUILD, next, { recursive: true });
  const pj = path.join(next, "resources", "app", "package.json");
  fs.writeFileSync(pj, JSON.stringify(Object.assign(JSON.parse(fs.readFileSync(pj, "utf8")), { version: "9.9.9" })));
  fs.writeFileSync(path.join(next, "UPDATED.txt"), "9.9.9");
  const zip = path.join(base, "Side-Panel-9.9.9-win32-x64.zip");
  execFileSync("powershell.exe", ["-NoProfile", "-Command", "Compress-Archive -Path (Join-Path $env:A '*') -DestinationPath $env:Z"], { env: Object.assign({}, process.env, { A: next, Z: zip }) });
  const good = crypto.createHash("sha256").update(fs.readFileSync(zip)).digest("hex");
  let sums = good + "  Side-Panel-9.9.9-win32-x64.zip\n";
  const srv = http.createServer((q, r) => {
    const p = srv.address().port;
    if (q.url === "/latest") { r.writeHead(200, { "content-type": "application/json" }); return r.end(JSON.stringify({ tag_name: "v9.9.9", body: "Test release", assets: [{ name: "Side-Panel-9.9.9-win32-x64.zip", size: fs.statSync(zip).size, browser_download_url: "http://127.0.0.1:" + p + "/zip" }, { name: "SHA256SUMS.txt", browser_download_url: "http://127.0.0.1:" + p + "/sums" }] })); }
    if (q.url === "/zip") { r.writeHead(200, { "content-length": fs.statSync(zip).size }); return fs.createReadStream(zip).pipe(r); }
    if (q.url === "/sums") { r.writeHead(200); return r.end(sums); }
    r.writeHead(404); r.end();
  }).listen(0, "127.0.0.1");
  await wait(300);
  const port = srv.address().port;
  const report = path.join(base, "relaunched.json");
  const env = Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_UPDATE_URL: "http://127.0.0.1:" + port + "/latest", SP_UPDATE_SELFTEST: report, SP_UPDATE_SELFTEST_VERSION: "9.9.9" });
  const exe = path.join(installed, "Side Panel.exe");

  // 1. a tampered download is refused and nothing changes
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { for (const f of (fs.existsSync(path.join(os.tmpdir(), "side-panel-test")) ? fs.readdirSync(path.join(os.tmpdir(), "side-panel-test")) : [])) try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test", f), { recursive: true, force: true }); } catch { } }
  sums = "0".repeat(64) + "  Side-Panel-9.9.9-win32-x64.zip\n";
  let app = await electron.launch({ env, executablePath: exe, args: ["--test", "--windowed"] });
  let page = await app.firstWindow();
  await page.waitForSelector(".top", { timeout: 30000 });
  const seen = await (async () => { for (let i = 0; i < 30; i++) { const s = await page.evaluate(() => D.update && D.update.status); if (s === "available") return true; await wait(500); } return false; })();
  ok("update: a newer release is noticed", seen);
  ok("update: shown in Needs a look with an Update button", await page.evaluate(() => (D.attention || []).some((a) => a.kind === "update" && a.action && a.action.act === "updateNow")));
  const bad = await page.evaluate(() => window.panel.act("updateNow"));
  ok("update: a download that doesn't match its checksum is refused", /checksum/i.test(bad.error || ""), JSON.stringify(bad));
  ok("update: the app keeps running after a refused update", !!(await page.$(".top")));
  await app.close();

  // 2. the real thing: download, verify, swap, restart as 9.9.9
  sums = good + "  Side-Panel-9.9.9-win32-x64.zip\n";
  app = await electron.launch({ env, executablePath: exe, args: ["--test", "--windowed", "--update-selftest=" + report] });
  page = await app.firstWindow();
  await page.waitForSelector(".top", { timeout: 30000 });
  for (let i = 0; i < 30 && (await page.evaluate(() => D.update && D.update.status)) !== "available"; i++) await wait(500);
  await page.evaluate(() => openSheet("settings")); await wait(500);
  ok("update: Settings shows the new version with Update", /9\.9\.9 is ready/.test(await page.textContent("#layer")) && !!(await page.$("#layer [data-act=updateNow]")));
  const closed = new Promise((res) => app.on("close", res));
  const res = await page.evaluate(() => window.panel.act("updateNow"));
  ok("update: install starts", !!(res && res.ok), JSON.stringify(res));
  await Promise.race([closed, wait(60000)]);
  let r = null;
  for (let i = 0; i < 90 && !r; i++) { await wait(1000); try { r = JSON.parse(fs.readFileSync(report, "utf8")); } catch { } }
  ok("update: the panel restarted as the new version", r && r.version === "9.9.9", JSON.stringify(r));
  ok("update: it restarted from the same place", r && path.dirname(r.exe).toLowerCase() === installed.toLowerCase(), r && r.exe);
  ok("update: new files are in place", fs.existsSync(path.join(installed, "UPDATED.txt")));
  ok("update: the old version is kept for rollback", fs.existsSync(path.join(installed + ".old", "Side Panel.exe")));
  srv.close();
  await wait(3000);
  try { fs.rmSync(base, { recursive: true, force: true }); } catch { }
  fs.writeFileSync(path.join(__dirname, "shots", "update-results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
