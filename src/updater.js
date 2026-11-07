// Updates from GitHub Releases. The repo is set in package.json ("updateRepo": "owner/name"); empty means off.
// Check: the latest release's tag vs this version. Update: download the win32-x64 zip, check it against the release's
// SHA256SUMS.txt, unpack it next to the app, then a small hidden PowerShell script waits for the panel to close,
// swaps the folders (keeping the old one to roll back), and starts the new version. No admin rights needed when the
// app lives in a user folder.
const https = require("https");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");

const pkg = (() => { try { return require("../package.json"); } catch { return {}; } })();
const TEST_URL = process.env.SP_UPDATE_URL || ""; // tests point this at a local server
const OK_HOSTS = /^(api\.github\.com|github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com|codeload\.github\.com)$/i;

function latestUrl() {
  if (TEST_URL) return TEST_URL;
  const repo = String(pkg.updateRepo || "").trim();
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? "https://api.github.com/repos/" + repo + "/releases/latest" : "";
}
function allowed(u) {
  try { const x = new URL(u); if (TEST_URL && x.hostname === "127.0.0.1") return true; return x.protocol === "https:" && OK_HOSTS.test(x.hostname); } catch { return false; }
}
// GET with redirects (GitHub sends assets to its download host), only to allowed hosts.
function get(u, opts, hops) {
  return new Promise((resolve, reject) => {
    if (!allowed(u)) return reject(new Error("Blocked a download from " + u));
    const lib = u.startsWith("https:") ? https : http;
    const q = lib.get(u, { headers: { "User-Agent": "SidePanel-Updater", Accept: opts.accept || "application/octet-stream" }, timeout: 20000 }, (r) => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && (hops || 0) < 5) { r.resume(); return resolve(get(new URL(r.headers.location, u).toString(), opts, (hops || 0) + 1)); }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error("The update server answered " + r.statusCode)); }
      resolve(r);
    });
    q.on("timeout", () => q.destroy(new Error("The update server didn't answer")));
    q.on("error", reject);
  });
}
const text = async (u) => { const r = await get(u, { accept: "application/vnd.github+json" }); let t = ""; r.setEncoding("utf8"); for await (const c of r) { t += c; if (t.length > 2e6) break; } return t; };
const newer = (a, b) => { const p = (v) => String(v).replace(/^v/i, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

class Updater {
  constructor({ version, onChange }) { this.version = version; this.onChange = onChange || (() => { }); this.state = { status: latestUrl() ? "idle" : "off", current: version }; }
  set(s) { Object.assign(this.state, s); try { this.onChange(); } catch { } }
  async check() {
    const url = latestUrl();
    if (!url) return this.set({ status: "off" }), this.state;
    if (["downloading", "installing"].includes(this.state.status)) return this.state;
    this.set({ status: "checking", error: "" });
    try {
      const rel = JSON.parse(await text(url));
      const ver = String(rel.tag_name || "").replace(/^v/i, "");
      const assets = rel.assets || [];
      const zip = assets.find((a) => /win32-x64.*\.zip$/i.test(a.name));
      const sums = assets.find((a) => /^SHA256SUMS(\.txt)?$/i.test(a.name));
      if (!ver || !newer(ver, this.version)) return this.set({ status: "current", checked: Date.now() }), this.state;
      if (!zip || !sums) return this.set({ status: "error", error: "The new release is missing its files", checked: Date.now() }), this.state;
      this.release = { ver, zip, sums };
      this.set({ status: "available", latest: ver, notes: String(rel.body || "").slice(0, 600), size: zip.size || 0, checked: Date.now() });
    } catch (e) { this.set({ status: "error", error: "Couldn't check for updates: " + e.message, checked: Date.now() }); }
    return this.state;
  }
  // Download, verify, unpack, then hand over to the swap script and quit. appDir is the folder with the .exe.
  async install(appDir, exe, args, quit) {
    if (!this.release) await this.check();
    if (this.state.status !== "available") return { error: this.state.status === "current" ? "You already have the latest version" : this.state.error || "No update to install" };
    if (!fs.existsSync(path.join(appDir, path.basename(exe)))) return { error: "Updates work for the installed app only" };
    const { zip, sums, ver } = this.release;
    const work = path.join(os.tmpdir(), "side-panel-update-" + Date.now());
    fs.mkdirSync(work, { recursive: true });
    const zipFile = path.join(work, "update.zip");
    try {
      // the expected hash first, from the release's own checksum file
      const sumText = await text(sums.browser_download_url);
      const line = sumText.split(/\r?\n/).find((l) => l.toLowerCase().includes(zip.name.toLowerCase()));
      const want = line && (line.match(/\b[a-f0-9]{64}\b/i) || [])[0];
      if (!want) throw new Error("The checksum file doesn't list " + zip.name);
      this.set({ status: "downloading", progress: 0 });
      const r = await get(zip.browser_download_url, {});
      const total = Number(r.headers["content-length"]) || zip.size || 0;
      const h = crypto.createHash("sha256"); let got = 0;
      await new Promise((res, rej) => {
        const out = fs.createWriteStream(zipFile);
        r.on("data", (c) => { h.update(c); got += c.length; if (total) { const p = Math.round(100 * got / total); if (p !== this.state.progress) this.set({ progress: p }); } });
        r.on("error", rej); out.on("error", rej); out.on("finish", res); r.pipe(out);
      });
      if (h.digest("hex").toLowerCase() !== want.toLowerCase()) throw new Error("The download didn't match its checksum, so it wasn't installed");
      this.set({ status: "installing", progress: 100 });
      const unpacked = path.join(work, "new");
      await new Promise((res, rej) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:SP_ZIP -DestinationPath $env:SP_DEST -Force"], { windowsHide: true, timeout: 300000, env: Object.assign({}, process.env, { SP_ZIP: zipFile, SP_DEST: unpacked }) }, (e) => (e ? rej(new Error("Couldn't unpack the update")) : res())));
      // the zip may hold the app folder or its contents
      const exeName = path.basename(exe);
      const root = fs.existsSync(path.join(unpacked, exeName)) ? unpacked : fs.readdirSync(unpacked).map((d) => path.join(unpacked, d)).find((d) => fs.existsSync(path.join(d, exeName)));
      if (!root) throw new Error("The update doesn't contain " + exeName);
      // the swap runs after the panel closes; if anything fails it puts the old version back
      const ps1 = path.join(work, "swap.ps1");
      fs.writeFileSync(ps1, [
        "$c = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'swap.json') | ConvertFrom-Json",
        "$env:SP_PID = $c.pid; $env:SP_APPDIR = $c.appDir; $env:SP_NEW = $c.newDir; $env:SP_EXE = $c.exe; $env:SP_VER = $c.ver; $env:SP_ARGS = $c.args",
        "$log = Join-Path ([IO.Path]::GetTempPath()) 'side-panel-update.log'",
        "function Say($m) { Add-Content -LiteralPath $log -Value ((Get-Date -Format s) + ' ' + $m) }",
        "Say ('update to ' + $env:SP_VER)",
        "try { Wait-Process -Id ([int]$env:SP_PID) -Timeout 60 -ErrorAction SilentlyContinue } catch { }",
        "$old = $env:SP_APPDIR + '.old'",
        "$done = $false",
        // files can stay locked for a moment after the app closes (its helper, antivirus): keep trying for 30 s
        "for ($i = 0; $i -lt 30 -and -not $done; $i++) {",
        "  Start-Sleep -Seconds 1",
        "  try {",
        "    if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction Stop }",
        "    Rename-Item -LiteralPath $env:SP_APPDIR -NewName (Split-Path $old -Leaf) -ErrorAction Stop",
        "    try { Move-Item -LiteralPath $env:SP_NEW -Destination $env:SP_APPDIR -ErrorAction Stop; $done = $true; Say 'swapped' }",
        "    catch { Say ('move failed: ' + $_); Rename-Item -LiteralPath $old -NewName (Split-Path $env:SP_APPDIR -Leaf); }",
        "  } catch { Say ('try ' + $i + ': ' + $_) }",
        "}",
        "if (-not $done) { Say 'gave up; old version kept' }",
        "$a = @(); if ($env:SP_ARGS) { $a = $env:SP_ARGS -split \"`n\" | Where-Object { $_ } }",
        "$exe = Join-Path $env:SP_APPDIR $env:SP_EXE",
        "if ($a.Count) { Start-Process -FilePath $exe -ArgumentList $a } else { Start-Process -FilePath $exe }",
        "Say ('started ' + $exe)"
      ].join("\r\n"));
      fs.writeFileSync(path.join(work, "swap.json"), JSON.stringify({ pid: String(process.pid), appDir, newDir: root, exe: exeName, ver, args: (args || []).join("\n") }));
      // started through Windows' process service, so it outlives the panel even when a launcher would close
      // everything the panel started; plain spawn is the fallback
      const cmd = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ps1 + '"';
      await new Promise((res) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:SP_CMD }; exit [int]$r.ReturnValue"], { windowsHide: true, timeout: 30000, env: Object.assign({}, process.env, { SP_CMD: cmd }) }, (e) => {
        if (e) { const c = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", ps1], { detached: true, stdio: "ignore", windowsHide: true }); c.on("error", () => { }); c.unref(); }
        res();
      }));
      setTimeout(quit, 400);
      return { ok: true, toast: "Updating to " + ver + ". The panel restarts in a moment" };
    } catch (e) {
      this.set({ status: "error", error: e.message });
      try { fs.rmSync(work, { recursive: true, force: true }); } catch { }
      return { error: e.message };
    }
  }
}
module.exports = { Updater, newer, latestUrl };
