// Smart setup: suggests keys from the apps this person actually uses most, and layouts (from templates) that fit
// how they use their PC, each with a plain reason. Works on any PC; nothing here is tied to one person.
const usage = require("./usage");

const W = (type, x, y, w, h, opts) => ({ id: type + "-" + Math.random().toString(36).slice(2, 7), type, x, y, w, h, opts: opts || {} });
// Layout templates. A layout is a 6 x 4 grid of widgets; "keys" says which key set it shows.
const TEMPLATES = {
  everyday: { name: "Everyday", desc: "Your apps, music, today's quote, what needs a look", keys: "home", build: () => [W("music", 1, 1, 2, 2), W("quote", 3, 1, 2, 1), W("clock", 3, 2, 1, 1), W("aitoday", 4, 2, 1, 1), W("needs", 5, 1, 2, 2), W("keys", 1, 3, 6, 2, { set: "home", suggest: true })] },
  ai: { name: "AI builder", desc: "AI sessions with approvals, keys, music", keys: "home", build: () => [W("ai", 1, 1, 3, 2), W("music", 4, 1, 2, 2), W("clock", 6, 1, 1, 1), W("aitoday", 6, 2, 1, 1), W("keys", 1, 3, 4, 2, { set: "home", suggest: true }), W("needs", 5, 3, 2, 2)] },
  work: { name: "Work", desc: "Next meeting, focus timer, work apps", keys: "work", build: () => [W("meeting", 1, 1, 2, 2), W("ai", 3, 1, 2, 2), W("focus", 5, 1, 2, 1), W("clock", 5, 2, 2, 1), W("keys", 1, 3, 6, 2, { set: "work" })] },
  gaming: { name: "Gaming", desc: "Game stats, game keys, music. Turns on by itself in a full-screen game", keys: "game", rules: [{ type: "fullscreen", on: true }], build: () => [W("gamestats", 1, 1, 3, 2), W("keys", 4, 1, 3, 2, { set: "game", big: true }), W("music", 1, 3, 2, 2), W("ai", 3, 3, 2, 2, { hold: true }), W("sound", 5, 3, 2, 2)] },
  focus: { name: "Focus", desc: "A timer, the clock and a quote, nothing else", keys: "home", build: () => [W("focus", 1, 1, 3, 2), W("clock", 4, 1, 3, 1), W("quote", 4, 2, 3, 1), W("keys", 1, 3, 6, 2, { set: "home" })] },
  creator: { name: "Creator", desc: "Sound levels, PC load, your creative apps", keys: "home", build: () => [W("music", 1, 1, 2, 2), W("sound", 3, 1, 2, 2), W("clock", 5, 1, 2, 1), W("pc", 5, 2, 2, 1), W("keys", 1, 3, 6, 2, { set: "home" })] },
  music: { name: "Music", desc: "Big player, playlists, sound", keys: "home", build: () => [W("music", 1, 1, 3, 3), W("playlists", 4, 1, 3, 2), W("sound", 4, 3, 2, 2), W("clock", 6, 3, 1, 1), W("keys", 1, 4, 3, 1, { set: "home" })] }
};
// Start-menu entries that are never useful as keys
const NOISE = /(updater|uninstall|setup|installer|crash ?report|repair)$|faq|documentation|manual|read ?me|release notes|^(windows backup|game bar|xbox game bar|get started|tips|settings|run|help|uninstall|readme|release notes|website|support|feedback hub|windows (security|tools)|control panel|recovery|odbc|component services|services|event viewer|iscsi|disk cleanup|character map|steps recorder)/i;

function suggest(disc, records) {
  const apps = (disc.apps || []).filter((a) => !NOISE.test(a.name));
  const used = usage.attach(apps, records).filter((s) => s.score > 0);
  const kinds = {};
  for (const s of used.slice(0, 25)) { const k = usage.kindOf(s.app.name); kinds[k] = (kinds[k] || 0) + s.score; }
  // apps: most used first, then well-known ones they have but haven't used much yet
  const seen = new Set(used.map((s) => s.app));
  const extra = apps.filter((a) => !seen.has(a) && usage.kindOf(a.name) !== "other").slice(0, 30).map((app) => ({ app, runs: 0, focusMin: 0, last: 0, score: 0 }));
  const list = used.concat(extra).slice(0, 24).map((s, i) => ({ name: s.app.name, appId: s.app.appId, path: s.app.path, iconFrom: s.app.iconFrom, kind: usage.kindOf(s.app.name), runs: s.runs, focusMin: s.focusMin, last: s.last, pick: i < 11 && (s.focusMin >= 3 || s.runs >= 3) }));
  if (!list.some((x) => x.pick)) list.slice(0, 8).forEach((x) => { x.pick = true; });
  const steam = (disc.steam && disc.steam.games) || [];
  const recentGames = steam.filter((g) => g.lastPlayed && Date.now() / 1000 - g.lastPlayed < 60 * 86400).slice(0, 4);
  const top = (k) => used.filter((s) => usage.kindOf(s.app.name) === k).slice(0, 3).map((s) => s.app.name);
  // a real habit, not one old launch: roughly an hour in those apps, or frequent recent use
  const has = (k) => (kinds[k] || 0) >= 60;
  const reasons = {
    everyday: "Your most-used apps in one place",
    ai: disc.ai && disc.ai.claudeCode ? "Claude Code is on this PC" : "",
    work: has("office") ? "You use " + top("office").join(", ") : top("office").length ? top("office").join(", ") + " on this PC" : disc.outlook ? "Outlook is on this PC" : "",
    gaming: recentGames.length ? "You played " + recentGames[0].name + " recently" : has("game") ? "You use " + top("game").join(", ") : "",
    focus: "",
    creator: has("create") ? "You use " + top("create").join(", ") : "",
    music: has("media") ? "You use " + top("media").join(", ") : ""
  };
  // preselect only what the usage clearly shows; the rest stay one tap away with their reason
  const strong = { everyday: true, ai: !!reasons.ai, work: has("office"), gaming: recentGames.length > 0 || has("game"), creator: has("create"), focus: false, music: false };
  const templates = Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, desc: t.desc, reason: reasons[id] || "", pick: !!strong[id] }));
  // the AI builder replaces Everyday as the home screen for people who use Claude Code
  if (templates.find((t) => t.id === "ai").pick) templates.find((t) => t.id === "everyday").pick = false;
  const displays = disc.displays || [];
  return { apps: list, templates, recentGames: recentGames.map((g) => ({ name: g.name, url: g.url })), touch: displays.some((d) => d.touch === "available" && !d.primary), screens: displays.length, kinds };
}

// Turn the choices into keys and layouts.
function build(disc, s, chosenApps, chosenTemplates) {
  const pick = s.apps.filter((a) => chosenApps.includes(a.appId || a.path || a.name));
  const key = (a) => ({ id: "k-" + (a.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30) || Math.random().toString(36).slice(2, 8)), label: a.name.replace(/^(Microsoft|Google) /, "").replace(/ \(classic\)$/i, ""), action: { type: "app", appId: a.appId, path: a.path }, iconFrom: a.iconFrom });
  const cc = disc.ai && disc.ai.claudeCode ? [{ id: "k-claudecode", label: "Claude Code", action: { type: "ai-task", provider: "claude-code" }, glyph: "term" }] : [];
  const shot = { id: "k-shot", label: "Screenshot", sub: "Copied, ready to paste", action: { type: "builtin", name: "screenshot" }, glyph: "camera" };
  const home = pick.map(key).concat(cc, [shot]);
  const work = pick.filter((a) => ["office", "browser", "chat"].includes(a.kind)).map(key).concat([
    { id: "k-claudeweb", label: "Claude", sub: "Web", action: { type: "url", target: "https://claude.ai/new" }, glyph: "claude" },
    { id: "k-chatgpt", label: "ChatGPT", sub: "Web", action: { type: "url", target: "https://chatgpt.com/" }, glyph: "gpt" }]);
  const game = s.recentGames.map((g) => ({ id: "g-" + g.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30), label: g.name, sub: "Play", action: { type: "game", target: g.url }, glyph: "game" }))
    .concat(pick.filter((a) => ["game", "chat", "media"].includes(a.kind)).map(key), [shot]);
  const dedupe = (list) => { const ids = new Set(); return list.filter((k) => !ids.has(k.id) && ids.add(k.id)); };
  const ids = chosenTemplates.filter((t) => TEMPLATES[t]);
  if (!ids.length) ids.push("everyday");
  const layouts = ids.map((t) => ({ name: TEMPLATES[t].name === "Everyday" || (TEMPLATES[t].name === "AI builder" && !ids.includes("everyday")) ? "Home" : TEMPLATES[t].name, widgets: TEMPLATES[t].build(), rules: (TEMPLATES[t].rules || []).map((r) => Object.assign({}, r)) }));
  return { keySets: { home: dedupe(home), work: dedupe(work.length > 2 ? work : home), game: dedupe(game) }, layouts };
}
// A new layout made from a template later on (from the Layouts sheet)
function fromTemplate(id) { const t = TEMPLATES[id]; return t ? { widgets: t.build(), rules: (t.rules || []).map((r) => Object.assign({}, r)) } : null; }

module.exports = { TEMPLATES, suggest, build, fromTemplate, NOISE };
