// Installs the newest build on this PC in one fixed place, so shortcuts and Start with Windows never go stale:
//   %LOCALAPPDATA%\Programs\Side Panel
// Closes a running panel first, copies the build, refreshes the Desktop and Start menu shortcuts, starts it.
// Usage: node build/install-local.js [path to built "Side Panel-win32-x64" folder]   (or: npm run install-local)
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = process.argv[2] || ["release", "release-1.6", "release-1.4"].map((d) => path.join(root, d, "Side Panel-win32-x64")).filter((d) => fs.existsSync(path.join(d, "Side Panel.exe"))).sort((a, b) => fs.statSync(path.join(b, "Side Panel.exe")).mtimeMs - fs.statSync(path.join(a, "Side Panel.exe")).mtimeMs)[0];
if (!src) { console.error("Build first: npm run package"); process.exit(1); }
const dest = path.join(process.env.LOCALAPPDATA, "Programs", "Side Panel");
const ps = (cmd, env) => execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
// close any running panel (asks it to close, then makes sure)
ps("Get-Process 'Side Panel' -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }; Start-Sleep 2; Get-Process 'Side Panel' -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 1");
fs.mkdirSync(path.dirname(dest), { recursive: true });
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
const exe = path.join(dest, "Side Panel.exe");
// Desktop and Start menu shortcuts point at the fixed place
ps("$w = New-Object -ComObject WScript.Shell; foreach ($p in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'))) { $s = $w.CreateShortcut((Join-Path $p 'Side Panel.lnk')); $s.TargetPath = $env:SP_EXE; $s.WorkingDirectory = $env:SP_DIR; $s.Description = 'Side Panel'; $s.Save() }", { SP_EXE: exe, SP_DIR: dest });
const v = JSON.parse(fs.readFileSync(path.join(dest, "resources", "app", "package.json"), "utf8")).version;
const c = spawn(exe, [], { detached: true, stdio: "ignore" }); c.unref();
console.log("Side Panel " + v + " installed in " + dest + " and started. Desktop and Start menu shortcuts point there.");
