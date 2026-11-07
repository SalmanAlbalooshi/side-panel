// How this person actually uses their PC, read from Windows' own per-user app usage record (UserAssist: how many
// times each app was started, how long it was in front, when it was last used) plus Steam's play history.
// Read-only, no admin rights, nothing leaves the PC. Used once at setup to suggest keys and layouts.
const { execFile } = require("child_process");
const path = require("path");

const KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist";
// Windows writes some paths with a folder id instead of the folder
const FOLDERS = {
  "{6D809377-6AF0-444B-8957-A3773F02200E}": process.env.ProgramW6432 || "C:\\Program Files",
  "{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}": process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
  "{F38BF404-1D43-42F2-9305-67DE0B28FC23}": process.env.windir || "C:\\Windows",
  "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}": path.join(process.env.windir || "C:\\Windows", "System32"),
  "{D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27}": path.join(process.env.windir || "C:\\Windows", "SysWOW64"),
  "{0139D44E-6AFE-49F2-8690-3DAFCAE6FFB8}": "Programs", "{A77F5D77-2E2B-44C3-A6A2-ABA601054A51}": "Programs"
};
const rot13 = (s) => s.replace(/[a-z]/gi, (c) => String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));

function readUserAssist() {
  return new Promise((resolve) => {
    execFile("reg.exe", ["query", KEY, "/s"], { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 15000 }, (err, out) => {
      if (err && !out) return resolve([]);
      const list = [];
      for (const line of String(out).split(/\r?\n/)) {
        const m = line.match(/^\s{4}(.+?)\s{4}REG_BINARY\s{4}([0-9A-F]+)\s*$/i);
        if (!m) continue;
        const name = rot13(m[1]);
        const b = Buffer.from(m[2], "hex");
        if (b.length < 68 || /^UEME_/i.test(name)) continue;
        const runs = b.readUInt32LE(4), focusMs = b.readUInt32LE(12);
        const ft = b.readBigUInt64LE(60);
        const last = ft > 0n ? Number(ft / 10000n - 11644473600000n) : 0;
        if (!runs && !focusMs) continue;
        let p = name;
        for (const [g, dir] of Object.entries(FOLDERS)) if (p.toUpperCase().startsWith(g)) p = dir + p.slice(g.length);
        list.push({ name: p, runs, focusMin: Math.round(focusMs / 60000), last });
      }
      resolve(list);
    });
  });
}

// Match a usage record to an app Windows lists (by Store app id, by exe path, or by name).
const norm = (s) => String(s || "").toLowerCase().replace(/\.(exe|lnk)$/i, "").replace(/[^a-z0-9]/g, "");
function attach(apps, records) {
  const byId = new Map(), byExe = new Map(), byName = new Map();
  for (const a of apps) {
    if (a.appId) byId.set(a.appId.toLowerCase(), a);
    if (a.path) byExe.set(norm(path.basename(a.path)), a);
    byName.set(norm(a.name), a);
  }
  const score = new Map();
  for (const r of records) {
    const lower = r.name.toLowerCase();
    const a = byId.get(lower) || byExe.get(norm(path.basename(r.name))) || byName.get(norm(path.basename(r.name))) ||
      (/!/.test(r.name) ? apps.find((x) => x.appId && lower.startsWith(x.appId.toLowerCase().split("!")[0])) : null);
    if (!a) continue;
    const s = score.get(a) || { app: a, runs: 0, focusMin: 0, last: 0 };
    s.runs += r.runs; s.focusMin += r.focusMin; s.last = Math.max(s.last, r.last);
    score.set(a, s);
  }
  const now = Date.now();
  return [...score.values()].map((s) => {
    const days = s.last ? (now - s.last) / 86400000 : 999;
    // time in the app matters most, then how often it's started, then how recently
    s.score = s.focusMin * 1 + s.runs * 3 + (days < 2 ? 120 : days < 7 ? 60 : days < 30 ? 20 : 0);
    return s;
  }).sort((a, b) => b.score - a.score);
}

// What kind of app it is, for layouts and reasons. Broad patterns, so it works on anyone's PC.
const KINDS = [
  ["office", /outlook|teams|excel|word|powerpoint|onenote|slack|zoom|webex|acrobat|notion|todo|calendar|sharepoint/i],
  ["dev", /visual studio|vs ?code|cursor|terminal|powershell|git|jetbrains|intellij|pycharm|android studio|postman|docker|wsl|ubuntu|claude/i],
  ["game", /steam|epic games|battle\.net|xbox|ea app|ubisoft|riot|gog galaxy|playnite|minecraft/i],
  ["media", /spotify|music|vlc|netflix|youtube|media player|itunes|plex|kodi|stremio|salflix|deezer|tidal/i],
  ["chat", /discord|whatsapp|telegram|signal|messenger|wechat|line$/i],
  ["create", /photoshop|premiere|after effects|illustrator|lightroom|davinci|obs|blender|figma|canva|audacity|krita|gimp|unity|unreal/i],
  ["browser", /chrome|edge|firefox|brave|opera|vivaldi|arc$/i]
];
const kindOf = (name) => (KINDS.find(([, re]) => re.test(name)) || ["other"])[0];

module.exports = { readUserAssist, attach, kindOf, rot13 };
