// Finds what this PC has: installed apps, games, AI tools, calendar, voice, screens. Nothing is hardcoded to one machine.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

function run(cmd, args, opts) {
  return new Promise((res) => {
    execFile(cmd, args, Object.assign({ windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, opts || {}), (err, stdout) => res(err ? "" : String(stdout)));
  });
}
async function which(name) {
  // where.exe also lists extension-less sh shims (npm installs) that Windows can't run; prefer .exe, then .cmd/.bat.
  const hits = (await run("where.exe", [name])).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return hits.find((h) => /\.exe$/i.test(h)) || hits.find((h) => /\.(cmd|bat)$/i.test(h)) || null;
}

function walk(dir, depth, out) {
  if (depth < 0) return;
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) walk(p, depth - 1, out);
    else if (/\.(lnk|url)$/i.test(it.name)) out.push(p);
  }
}

const SKIP = /uninstall|readme|help|documentation|release notes|license|website|support|manual|setup|repair|^about /i;

async function findApps(shell) {
  // 1. Start menu shortcuts (gives real icons)
  const roots = [
    path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs")
  ];
  const files = [];
  roots.forEach((r) => walk(r, 3, files));
  const lnk = new Map();
  for (const f of files) {
    const name = path.basename(f).replace(/\.(lnk|url)$/i, "");
    let target = "", icon = "";
    if (/\.lnk$/i.test(f) && shell) { try { const l = shell.readShortcutLink(f); target = l.target || ""; icon = l.icon || ""; } catch { } }
    if (!lnk.has(name.toLowerCase())) lnk.set(name.toLowerCase(), { lnkPath: f, target, icon });
  }
  // 2. Every app Windows lists in Start, including Microsoft Store apps
  let start = [];
  try { start = JSON.parse(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress"], { timeout: 20000 }) || "[]"); } catch { start = []; }
  if (!Array.isArray(start)) start = [start];
  const out = new Map();
  for (const s of start) {
    if (!s || !s.Name || SKIP.test(s.Name)) continue;
    const l = lnk.get(s.Name.toLowerCase());
    const isPath = /^[a-z]:\\/i.test(s.AppID || "");
    // Windows draws Start menu icons from the AppsFolder item; the helper asks for exactly that.
    const iconFrom = s.AppID ? "shell:AppsFolder\\" + s.AppID : (l ? l.lnkPath : "");
    out.set(s.Name.toLowerCase(), { name: s.Name, appId: s.AppID, path: l ? l.lnkPath : isPath ? s.AppID : "", iconFrom });
  }
  for (const [k, l] of lnk) if (!out.has(k) && !SKIP.test(k)) out.set(k, { name: path.basename(l.lnkPath).replace(/\.(lnk|url)$/i, ""), appId: "", path: l.lnkPath, iconFrom: l.target && fs.existsSync(l.target) ? l.target : l.lnkPath });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function parseVdfPaths(txt) {
  const out = [];
  const re = /"path"\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(txt))) out.push(m[1].replace(/\\\\/g, "\\"));
  return out;
}
function findSteamGames() {
  const roots = ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"];
  const steam = roots.find((r) => fs.existsSync(path.join(r, "steamapps")));
  if (!steam) return { installed: false, games: [] };
  let libs = [steam];
  try { libs = libs.concat(parseVdfPaths(fs.readFileSync(path.join(steam, "steamapps", "libraryfolders.vdf"), "utf8"))); } catch { }
  const games = [];
  const seen = new Set();
  for (const lib of [...new Set(libs)]) {
    const dir = path.join(lib, "steamapps");
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const t = fs.readFileSync(path.join(dir, f), "utf8");
        const id = (t.match(/"appid"\s+"(\d+)"/) || [])[1];
        const name = (t.match(/"name"\s+"([^"]+)"/) || [])[1];
        const played = Number((t.match(/"LastPlayed"\s+"(\d+)"/) || [])[1] || 0);
        if (!id || !name || seen.has(id) || /redistributable|steamworks|proton|runtime/i.test(name)) continue;
        seen.add(id);
        games.push({ id, name, lastPlayed: played, url: "steam://rungameid/" + id });
      } catch { }
    }
  }
  games.sort((a, b) => b.lastPlayed - a.lastPlayed);
  return { installed: true, path: steam, games };
}

function findEpicGames() {
  const dir = path.join(process.env.ProgramData || "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests");
  const games = [];
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".item"))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (j.DisplayName && j.AppName) games.push({ id: j.AppName, name: j.DisplayName, url: "com.epicgames.launcher://apps/" + j.AppName + "?action=launch&silent=true" });
      } catch { }
    }
  } catch { return { installed: false, games: [] }; }
  return { installed: true, games };
}

// Where the AI command-line tools usually live, for when the panel starts without them on its PATH
// (from Start with Windows, a shortcut, or another user setup).
function usual(name) {
  const home = os.homedir(), ad = process.env.APPDATA || "", la = process.env.LOCALAPPDATA || "";
  const list = [path.join(home, ".local", "bin", name + ".exe"), path.join(ad, "npm", name + ".cmd"), path.join(la, "Microsoft", "WinGet", "Links", name + ".exe"), path.join(home, "scoop", "shims", name + ".exe"), path.join(la, "Programs", name, name + ".exe"), path.join(home, ".bun", "bin", name + ".exe")];
  return list.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}
async function tool(name, override) {
  if (override === "none") return null;
  if (override) return fs.existsSync(override) ? override : null;
  return (await which(name)) || usual(name);
}
async function findAITools() {
  const [claude, codex, gemini] = await Promise.all([tool("claude", process.env.SP_CLAUDE), tool("codex", process.env.SP_CODEX || (process.env.SP_CLAUDE ? "none" : "")), tool("gemini", process.env.SP_CLAUDE ? "none" : "")]);
  const local = process.env.LOCALAPPDATA || "";
  const desktopClaude = fs.existsSync(path.join(local, "AnthropicClaude")) || fs.existsSync(path.join(local, "Programs", "Claude"));
  let desktopChatGPT = fs.existsSync(path.join(local, "Programs", "ChatGPT"));
  let pkgs = []; try { pkgs = fs.readdirSync(path.join(local, "Packages")); } catch { }
  if (!desktopChatGPT) desktopChatGPT = pkgs.some((d) => /OpenAI\.ChatGPT/i.test(d));
  const copilotApp = pkgs.some((d) => /^Microsoft\.(Copilot|MicrosoftOfficeHub)_/i.test(d));
  return {
    claudeCode: claude ? { path: claude, level: "full" } : null,
    codex: codex ? { path: codex, level: "partial" } : null,
    geminiCli: gemini ? { path: gemini, level: "basic" } : null,
    claudeDesktop: desktopClaude,
    chatgptDesktop: !!desktopChatGPT,
    copilotApp,
    web: ["claude", "chatgpt", "gemini", "copilot"]
  };
}

async function findOutlookClassic() {
  const out = await run("reg.exe", ["query", "HKCR\\Outlook.Application\\CurVer"]);
  return /Outlook\.Application/i.test(out);
}

async function findExtras() {
  const [wt, whisper, nvsmi] = await Promise.all([which("wt"), which("whisper-transcribe"), which("nvidia-smi")]);
  return { windowsTerminal: wt, whisper, nvidiaSmi: nvsmi };
}

// Every finder is fenced: one failing never stops the rest, and the app always gets a usable result.
const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };
function empty() {
  return { at: 0, host: os.hostname(), apps: [], steam: { installed: false, games: [] }, epic: { installed: false, games: [] }, ai: { web: ["claude", "chatgpt", "gemini"] }, outlook: false, extras: {}, displays: [], partial: true };
}
async function discoverAll(shell, screen) {
  const [apps, ai, outlook, extras] = await Promise.all([
    safe(() => findApps(shell), []), safe(findAITools, { web: ["claude", "chatgpt", "gemini"] }), safe(findOutlookClassic, false), safe(findExtras, {})
  ]);
  const steam = await safe(findSteamGames, { installed: false, games: [] });
  const epic = await safe(findEpicGames, { installed: false, games: [] });
  const displays = await safe(() => (screen ? screen.getAllDisplays().map((d) => ({ id: d.id, label: d.label || "", w: d.size.width, h: d.size.height, scale: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id, touch: d.touchSupport })) : []), []);
  return { at: Date.now(), host: os.hostname(), apps, steam, epic, ai, outlook, extras, displays };
}

// The fast part (a few seconds): AI tools, GPU tool, games, calendar. The app list (Start menu scan) comes later.
async function discoverQuick(screen) {
  const [ai, outlook, extras] = await Promise.all([safe(findAITools, { web: ["claude", "chatgpt", "gemini"] }), safe(findOutlookClassic, false), safe(findExtras, {})]);
  const steam = await safe(findSteamGames, { installed: false, games: [] });
  const epic = await safe(findEpicGames, { installed: false, games: [] });
  return { at: Date.now(), host: os.hostname(), apps: [], steam, epic, ai, outlook, extras, displays: [], partial: true };
}

module.exports = { discoverAll, discoverQuick, empty, which, run, findAITools };
