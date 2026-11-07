// Settings, layouts and keys live in one readable JSON file in the app's data folder.
const fs = require("fs");
const path = require("path");

const QUOTES = [
  ["A journey of a thousand miles begins with a single step.", "Lao Tzu, Tao Te Ching"],
  ["Well done is better than well said.", "Benjamin Franklin, Poor Richard's Almanack"],
  ["The best way to predict the future is to invent it.", "Alan Kay"],
  ["What I cannot create, I do not understand.", "Richard Feynman"],
  ["The first principle is that you must not fool yourself, and you are the easiest person to fool.", "Richard Feynman"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["Premature optimization is the root of all evil.", "Donald Knuth"],
  ["Programs must be written for people to read, and only incidentally for machines to execute.", "Abelson and Sussman, SICP"],
  ["He who has a why to live can bear almost any how.", "Friedrich Nietzsche"],
  ["The unexamined life is not worth living.", "Socrates, in Plato's Apology"],
  ["Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", "Antoine de Saint-Exupery"],
  ["Your time is limited, so don't waste it living someone else's life.", "Steve Jobs, Stanford, 2005"],
  ["Stay hungry, stay foolish.", "Whole Earth Catalog, quoted by Steve Jobs"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["Empty your mind, be formless, shapeless, like water.", "Bruce Lee"]
];

const KNOWN = [
  [/^steam$/i, "Steam"], [/^discord$/i, "Discord"], [/^spotify/i, "Spotify"], [/^google chrome$/i, "Chrome"], [/^microsoft edge$/i, "Edge"], [/^firefox$/i, "Firefox"],
  [/^visual studio code$/i, "VS Code"], [/^outlook( \(classic\))?$/i, "Outlook"], [/^(microsoft )?teams( (work or school))?$/i, "Teams"], [/^excel$/i, "Excel"], [/^word$/i, "Word"], [/^powerpoint$/i, "PowerPoint"],
  [/^obs studio/i, "OBS"], [/^whatsapp$/i, "WhatsApp"], [/^file explorer$/i, "Explorer"], [/^notepad$/i, "Notepad"], [/^salflix$/i, "SalFlix"], [/^vlc media player$/i, "VLC"]
];

function pickApps(disc, wanted) {
  const apps = (disc && disc.apps) || [];
  const out = [];
  for (const [re, label] of KNOWN) {
    if (wanted && !wanted.includes(label)) continue;
    const a = apps.find((x) => re.test(x.name));
    if (a) out.push({ id: "k-" + label.toLowerCase().replace(/\W/g, ""), label, action: { type: "app", appId: a.appId, path: a.path }, iconFrom: a.iconFrom });
  }
  return out;
}

function homeKeys(disc) {
  const keys = pickApps(disc, ["Steam", "Discord", "Spotify", "Chrome", "VS Code", "SalFlix", "Explorer", "OBS", "WhatsApp", "Edge", "Firefox"]);
  if (disc && disc.ai && disc.ai.claudeCode) keys.splice(Math.min(3, keys.length), 0, { id: "k-claudecode", label: "Claude Code", action: { type: "ai-task", provider: "claude-code" }, glyph: "term" });
  keys.push({ id: "k-shot", label: "Screenshot", sub: "Copied, ready to paste", action: { type: "builtin", name: "screenshot" }, glyph: "camera" });
  return keys.slice(0, 11);
}
function workKeys(disc) {
  const keys = pickApps(disc, ["Outlook", "Teams", "Excel", "Word", "PowerPoint", "Edge", "Chrome", "Explorer"]);
  keys.push({ id: "k-claudeweb", label: "Claude", sub: "Web", action: { type: "url", target: "https://claude.ai/new" }, glyph: "claude" });
  keys.push({ id: "k-chatgpt", label: "ChatGPT", sub: "Web", action: { type: "url", target: "https://chatgpt.com/" }, glyph: "gpt" });
  keys.push({ id: "k-gemini", label: "Gemini", sub: "Web", action: { type: "url", target: "https://gemini.google.com/app" }, glyph: "gem" });
  return keys.slice(0, 11);
}
function gameKeys(disc) {
  const keys = [

    { id: "g-shot", label: "Screenshot", action: { type: "builtin", name: "screenshot" }, glyph: "camera" }
  ];
  return keys.concat(pickApps(disc, ["Discord", "Spotify", "Steam"]));
}

function W(type, x, y, w, h, opts) { return { id: type + "-" + Math.random().toString(36).slice(2, 7), type, x, y, w, h, opts: opts || {} }; }

function templates(disc) {
  return {
    Developer: [W("ai", 1, 1, 3, 2), W("music", 4, 1, 2, 2), W("clock", 6, 1, 1, 1), W("aitoday", 6, 2, 1, 1), W("keys", 1, 3, 4, 2, { set: "home", suggest: true }), W("needs", 5, 3, 2, 2)],
    Gamer: [W("gamestats", 1, 1, 3, 2), W("keys", 4, 1, 3, 2, { set: "game", big: true }), W("music", 1, 3, 2, 2), W("ai", 3, 3, 2, 2, { hold: true }), W("sound", 5, 3, 2, 2)],
    Office: [W("meeting", 1, 1, 2, 2), W("ai", 3, 1, 2, 2), W("focus", 5, 1, 2, 1), W("clock", 5, 2, 2, 1), W("keys", 1, 3, 6, 2, { set: "work" })],
    Focus: [W("focus", 1, 1, 3, 2), W("clock", 4, 1, 3, 2), W("keys", 1, 3, 6, 2, { set: "home" })],
    Creator: [W("music", 1, 1, 2, 2), W("sound", 3, 1, 2, 2), W("clock", 5, 1, 2, 1), W("pc", 5, 2, 2, 1), W("keys", 1, 3, 6, 2, { set: "home" })]
  };
}

function defaults(disc, template) {
  const t = templates(disc);
  const first = template || "Developer";
  const layouts = [
    { name: "Home", widgets: t[first] || t.Developer, rules: [] },
    { name: "Gaming", widgets: t.Gamer, rules: [{ type: "fullscreen", on: true }] },
    { name: "Work", widgets: t.Office, rules: [] },
    { name: "Focus", widgets: t.Focus, rules: [] }
  ];
  return {
    version: 1,
    notes: [], appAllow: {}, musicSource: "auto", trayHintShown: false,
    setupDone: false,
    theme: "auto",
    darkFrom: "18:00", darkTo: "06:30",
    // Clawd on PCs that have Claude Code (your own PC); the neutral Pip everywhere else.
    companion: "blink", companionTalk: "all", companionV: 2, quoteInClock: true, routines: [], replyHome: "listen", replyWork: "read", autoQuiet: true, brief: true, appChips: true, voiceRate: 10, voiceEn: false, voiceAr: false, voiceAuto: true, userName: "", autoDesktop: true, webAI: "claude-web",
    quotes: true,
    display: null,
    approvalsFromPanel: true,
    holdInGame: true,
    hideMeetingTitles: false,
    startWithWindows: false,
    ambient: true,
    ambientAfterMin: 5,
    chime: true,
    keySets: { home: homeKeys(disc), work: workKeys(disc), game: gameKeys(disc) },
    layouts,
    activeLayout: "Home",
    usage: {},
    customWidgets: {},
    projects: [],
    playlists: [],
    hiddenSessions: [],
    dismissed: {},
    homeLayout: "Home", aiModel: "sonnet", lyrics: true, mini: false, miniCorner: "br", miniDisplay: "", fullBounds: null, miniSize: null, miniParts: [], miniFollow: true
  };
}

const WIDGET_TYPES = new Set(["notes", "clock", "pc", "keys", "music", "sound", "ai", "aitoday", "needs", "meeting", "focus", "quote", "gamestats", "minigame", "ask", "custom", "playlists"]);
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);

// A key is kept only if its action is one the panel knows, with a target of the right shape.
const LINK = /^(https?:\/\/|steam:\/\/|com\.epicgames\.launcher:\/\/|spotify:|ms-settings:|msteams:|discord:|mailto:|tel:|whatsapp:|slack:|vscode:|vscode-insiders:|cursor:|obsidian:|notion:|zoommtg:|zoomus:|tg:|figma:|ms-outlook:|onenote:|ms-word:|ms-excel:|ms-powerpoint:|ms-whiteboard-cmd:|ms-todo:|spotify:|epicgames:)/i;
function validKey(k) {
  if (!isObj(k) || typeof k.id !== "string" || !/^[A-Za-z0-9][\w-]{0,59}$/.test(k.id) || typeof k.label !== "string" || !isObj(k.action)) return false;
  const a = k.action, str = (v) => typeof v === "string" && v.length > 0 && v.length < 2000;
  switch (a.type) {
    case "open": return str(a.target) && !/^\\\\/.test(a.target);
    case "folder": return str(a.target);
    case "app": return (str(a.path) && !/^\\\\/.test(a.path)) || (str(a.appId) && !/^\\\\/.test(a.appId));
    case "url": case "game": case "playlist": return str(a.target) && LINK.test(a.target);
    case "ai-task": return typeof a.provider === "string" && (a.prompt === undefined || typeof a.prompt === "string");
    case "builtin": return ["mic-toggle", "mute-toggle", "screenshot", "media-play"].includes(a.name);
    case "person": return (typeof a.email === "string" && /^[^\s@"'<>`]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/.test(a.email)) && (a.phone === undefined || /^\+?[0-9 ]{6,20}$/.test(String(a.phone))) && ["chat", "call", "video", "email", "mails", "whatsapp", "menu"].includes(a.tap || "menu");
    case "hotkey": return typeof a.keys === "string" && /^[A-Za-z0-9+ ,./;'\[\]\\`=-]{1,40}$/.test(a.keys);
    case "text": return typeof a.text === "string" && a.text.length > 0 && a.text.length <= 4000;
    case "action": return typeof a.cid === "string" && /^[a-z]{2,20}$/.test(a.cid) && typeof a.aid === "string" && /^[a-z]{2,20}$/.test(a.aid) && (a.params === undefined || (isObj(a.params) && Object.values(a.params).every((v) => typeof v === "string" && v.length < 500)));
    case "outlook": return ["from", "search", "folder", "compose", "calendar"].includes(a.op) && (a.op === "calendar" || str(a.value));
    case "multi": return Array.isArray(a.steps) && a.steps.length > 0 && a.steps.length <= 5 && a.steps.every((st) => isObj(st) && st.type !== "multi" && validKey({ id: "s", label: "s", action: st }));
    default: return false;
  }
}

// Makes any config safe to use: missing or wrong-typed fields fall back to defaults, widgets are clamped to the grid.
function sanitize(c, disc) {
  const d = defaults(disc);
  const out = Object.assign({}, d);
  for (const k of Object.keys(d)) {
    if (c[k] === undefined) continue;
    const want = Array.isArray(d[k]) ? "array" : d[k] === null ? "any" : typeof d[k];
    const got = Array.isArray(c[k]) ? "array" : typeof c[k];
    if (want === "any" || want === got) out[k] = c[k];
  }
  if (!isObj(out.keySets)) out.keySets = d.keySets;
  for (const s of ["home", "work", "game"]) if (!Array.isArray(out.keySets[s])) out.keySets[s] = d.keySets[s];
  for (const s of Object.keys(out.keySets)) out.keySets[s] = out.keySets[s].filter(validKey).slice(0, 60);
  out.layouts = (Array.isArray(out.layouts) ? out.layouts : []).filter((L) => isObj(L) && typeof L.name === "string" && L.name.trim()).slice(0, 20).map((L) => ({
    name: L.name.slice(0, 40),
    rules: (Array.isArray(L.rules) ? L.rules : []).filter(isObj).slice(0, 10),
    widgets: (Array.isArray(L.widgets) ? L.widgets : []).filter((w) => isObj(w) && WIDGET_TYPES.has(w.type)).map((w) => {
      const x = Math.min(6, Math.max(1, w.x | 0 || 1)), y = Math.min(4, Math.max(1, w.y | 0 || 1));
      return { id: String(w.id || w.type + "-" + Math.random().toString(36).slice(2, 7)).replace(/[^\w-]/g, "").slice(0, 40), type: w.type, x, y, w: Math.min(7 - x, Math.max(1, w.w | 0 || 1)), h: Math.min(5 - y, Math.max(1, w.h | 0 || 1)), opts: isObj(w.opts) ? w.opts : {} };
    })
  }));
  if (!out.layouts.length) out.layouts = d.layouts;
  if (!out.layouts.some((L) => L.name === out.activeLayout)) out.activeLayout = out.layouts[0].name;
  if (!isObj(out.usage)) out.usage = {};
  if (!["tl", "tr", "bl", "br"].includes(out.miniCorner)) out.miniCorner = "br";
  out.routines = (Array.isArray(out.routines) ? out.routines : []).filter((r) => isObj(r) && typeof r.id === "string" && isObj(r.when) && ["game", "layout", "focus", "time"].includes(r.when.type) && Array.isArray(r.steps) && r.steps.length && r.steps.length <= 6 && r.steps.every((s) => typeof s === "string" && s.length < 200)).slice(0, 30);
  // values with a fixed set of choices: anything else (a hand edit, an old version) goes back to the default
  const CHOICES = { theme: ["light", "dark", "auto"], companion: ["blink", "pip", "clawd", "none"], companionTalk: ["all", "important", "off"], webAI: ["claude-web", "chatgpt-web", "gemini-web", "copilot-web"], aiModel: ["default", "haiku", "sonnet", "opus"] };
  for (const [k, ok] of Object.entries(CHOICES)) if (k in d && !ok.includes(out[k])) out[k] = d[k];
  for (const k of ["replyHome", "replyWork"]) if (!["read", "listen"].includes(out[k])) out[k] = k === "replyWork" ? "read" : "listen";
  // Blink became the default companion; everyone gets it once, then their choice sticks
  if (out.companionV !== 2) { out.companion = "blink"; out.companionV = 2; }
  if (!["blink", "pip", "clawd", "none"].includes(out.companion)) out.companion = "blink";
  if (!["all", "important", "off"].includes(out.companionTalk)) out.companionTalk = "all";
  out.miniParts = (out.miniParts || []).filter((x) => ["ai", "music", "focus", "meeting", "game", "keys"].includes(x)).slice(0, 6);
  const ms = out.miniSize;
  if (ms !== null && !(isObj(ms) && Number.isFinite(ms.w) && Number.isFinite(ms.h))) out.miniSize = null;
  if (!["haiku", "sonnet", "opus"].includes(out.aiModel)) out.aiModel = "sonnet";
  const fb = out.fullBounds;
  if (fb !== null && !(isObj(fb) && ["x", "y", "width", "height"].every((k) => Number.isFinite(fb[k])) && fb.width >= 320 && fb.height >= 200)) out.fullBounds = null;
  for (const k of Object.keys(out.usage)) if (!/^[A-Za-z0-9][\w-]{0,59}$/.test(k) || !isObj(out.usage[k]) || !validKey(out.usage[k].key)) delete out.usage[k];
  if (!isObj(out.customWidgets)) out.customWidgets = {};
  out.projects = out.projects.filter((p) => typeof p === "string").slice(0, 8);
  out.hiddenSessions = out.hiddenSessions.filter((x) => typeof x === "string").slice(-200);
  if (!isObj(out.dismissed)) out.dismissed = {};
  out.playlists = out.playlists.filter((p) => isObj(p) && typeof p.url === "string").slice(0, 24);
  out.notes = (Array.isArray(out.notes) ? out.notes : []).filter((n) => isObj(n) && typeof n.id === "string" && typeof n.text === "string" && n.text.length > 0).map((n) => ({ id: n.id.slice(0, 20), text: n.text.slice(0, 300), due: typeof n.due === "string" ? n.due.slice(0, 40) : "", done: !!n.done, at: Number(n.at) || Date.now(), doneAt: Number(n.doneAt) || 0 })).slice(-60);
  out.appAllow = isObj(out.appAllow) ? Object.fromEntries(Object.entries(out.appAllow).filter(([k, v]) => /^[\w .-]{1,60}$/.test(k) && v === true).slice(0, 200)) : {};
  if (!["auto", "spotify", "ytmusic", "apple"].includes(out.musicSource)) out.musicSource = "auto";
  out.version = 1;
  return out;
}

// A broken config file is kept as a backup, never silently thrown away.
function load(file, disc) {
  let raw = null;
  try { raw = fs.readFileSync(file, "utf8"); } catch { return defaults(disc); }
  try {
    const c = JSON.parse(raw.replace(/^﻿/, ""));
    if (isObj(c)) return sanitize(c, disc);
  } catch { }
  try { fs.writeFileSync(file + ".broken-" + new Date().toISOString().replace(/[:.]/g, "-"), raw); } catch { }
  const fresh = defaults(disc);
  fresh.recoveredFromBroken = true;
  return fresh;
}
function save(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { QUOTES, defaults, templates, load, save, sanitize, homeKeys, workKeys, gameKeys, pickApps, WIDGET_TYPES, validKey };
