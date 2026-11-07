// Deep keys: people, keyboard shortcuts, text snippets, Outlook, app links that land on a place, and combos.
Object.assign(G, {
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  kbd: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  textk: '<path d="M4 6h16M12 6v13M8 19h8"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chevl: '<path d="M15 6l-6 6 6 6"/>',
  whatsapp: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8z"/><path d="M9 9.5c.3 2 2.2 4 4.5 4.5l1-1.2 2 .9c-.3 1.2-1.3 1.8-2.5 1.6-3-.5-5.3-2.8-5.8-5.8-.2-1.2.4-2.2 1.6-2.5l.9 2z"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>',
  combo: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M11 7h4a2 2 0 0 1 2 2v4"/>'
});

const LINK_OK = /^(https?:\/\/|steam:\/\/|com\.epicgames\.launcher:\/\/|spotify:|ms-settings:|msteams:|discord:|mailto:|tel:|whatsapp:|slack:|vscode:|vscode-insiders:|cursor:|obsidian:|notion:|zoommtg:|zoomus:|tg:|figma:|ms-outlook:|onenote:|ms-word:|ms-excel:|ms-powerpoint:|ms-whiteboard-cmd:|ms-todo:|epicgames:)/i;
const EMAIL_OK = /^[^\s@"'<>`]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;
const HOTKEYS = [
  ["Teams: mute", "ctrl+shift+m"], ["Teams: camera", "ctrl+shift+o"], ["Teams: raise hand", "ctrl+shift+k"], ["Teams: leave call", "ctrl+shift+h"],
  ["Zoom: mute", "alt+a"], ["Discord: mute", "ctrl+shift+m"], ["Snip a screenshot", "win+shift+s"], ["Clipboard history", "win+v"],
  ["Emoji picker", "win+."], ["Show desktop", "win+d"], ["Task view", "win+tab"], ["Next desktop", "ctrl+win+right"],
  ["Previous desktop", "ctrl+win+left"], ["Play or pause", "playpause"], ["Next track", "nexttrack"], ["Volume up", "volumeup"],
  ["Teams: share screen", "ctrl+shift+e"], ["Teams: accept call", "ctrl+shift+s"], ["Teams: decline call", "ctrl+shift+d"], ["Teams: blur background", "ctrl+shift+p"],
  ["Lock the PC", "win+l"], ["New desktop", "ctrl+win+d"], ["Close this desktop", "ctrl+win+f4"], ["Paste as plain text", "ctrl+shift+v"],
  ["Text from a screenshot", "win+shift+t"], ["Voice typing", "win+h"], ["Night light / quick settings", "win+a"], ["File Explorer", "win+e"],
  ["Outlook: new email", "ctrl+shift+m"], ["Outlook: new meeting", "ctrl+shift+q"], ["Undo", "ctrl+z"], ["Find", "ctrl+f"]
];
const SETTINGS_PAGES = [["Bluetooth", "ms-settings:bluetooth"], ["Display", "ms-settings:display"], ["Sound", "ms-settings:sound"], ["Wi-Fi", "ms-settings:network-wifi"], ["Windows Update", "ms-settings:windowsupdate"], ["App volume", "ms-settings:apps-volume"], ["Night light", "ms-settings:nightlight"], ["Storage", "ms-settings:storagesense"]];
const TAPS = [["menu", "Ask each time"], ["chat", "Teams chat"], ["call", "Teams call"], ["email", "New email"], ["mails", "Their emails"]];
const prettyCombo = (s) => String(s).split("+").map((x) => x.trim()).map((x) => (x.length === 1 ? x.toUpperCase() : x.charAt(0).toUpperCase() + x.slice(1))).join(" + ");
const field = (id, ph, val) => `<input type="text" id="${id}" placeholder="${esc(ph)}" value="${esc(val || "")}">`;
const lbl = (t) => `<span class="m" style="font-size:14px;font-weight:600">${t}</span>`;

// extra tabs for Add a key
const KEY_TABS = {
  people(D) {
    const u = D.ui.addKey;
    return `<div class="kform"><div class="two"><div class="kf">${lbl("Name")}${field("pName", "Like Sara")}</div><div class="kf">${lbl("Work email")}${field("pEmail", "For Teams and Outlook")}</div></div><div class="kf">${lbl("Mobile (optional)")}${field("pPhone", "With country code, for WhatsApp")}</div>
      ${lbl("When you tap the key")}<div class="seg">${TAPS.map(([k, l]) => `<button class="${(u.tap || "menu") === k ? "on" : ""}" ${A("keyTap", k)}>${l}</button>`).join("")}</div>
      <span class="m" style="font-size:13px">${D.discOutlook ? "Their emails opens an Outlook search for everything from them." : "Their emails needs classic Outlook; on this PC it opens Outlook on the web."} Teams opens straight in the chat or call.</span>
      <button class="btn go" style="align-self:flex-start" ${A("pickPerson")}>${svg("person", 18)}Add person</button></div>`;
  },
  shortcuts(D) {
    const u = D.ui.addKey;
    return `<div class="kform">${lbl("Press keys in the app on your main screen")}
      <div style="display:flex;gap:8px"><input type="text" id="hkKeys" placeholder="Tap here, then press the keys. Or type: ctrl+shift+m" value="${esc(u.hk || "")}" data-record="1"><input type="text" id="hkName" placeholder="Name" style="max-width:220px"><button class="btn go" ${A("pickHotkey")}>Add</button></div>
      <div class="chips">${HOTKEYS.map(([l, k]) => `<button class="btn sm" ${A("pickKey", { label: l.replace(/^.*?: /, ""), sub: l.includes(":") ? l.split(":")[0] + " · " + prettyCombo(k) : prettyCombo(k), action: { type: "hotkey", keys: k }, glyph: "kbd" })}>${esc(l)}</button>`).join("")}</div>
      ${lbl("Type a snippet")}<span class="m" style="font-size:13px">Pastes into whatever box is active on your main screen. Your clipboard is put back after.</span>
      <textarea id="txText" rows="3" placeholder="Your email signature, an address, a reply you send often"></textarea><div style="display:flex;gap:8px">${field("txName", "Name on the key")}<button class="btn go" ${A("pickText")}>Add</button></div></div>`;
  },
  links(D) {
    return `<div class="kform">${lbl("Any link that opens a place: a website page, a Teams chat or channel, a Slack channel, a Notion or Obsidian page, a VS Code folder")}
      <div class="two">${field("lnUrl", "Paste the link. In Teams: right-click a chat or channel, Copy link")}${field("lnName", "Name on the key")}</div><button class="btn go" style="align-self:flex-start" ${A("pickLink")}>Add link</button>
      ${lbl("Open a folder in VS Code")}<div style="display:flex;gap:8px"><button class="btn" ${A("pickVSCode")}>${svg("folder", 16)}Pick a folder</button></div>
      ${lbl("A Windows settings page")}<div class="chips">${SETTINGS_PAGES.map(([l, u]) => `<button class="btn sm" ${A("pickKey", { label: l, sub: "Settings", action: { type: "url", target: u }, glyph: "gear" })}>${l}</button>`).join("")}</div></div>`;
  },
  outlook(D) {
    const ok = D.discOutlook;
    return `<div class="kform">${ok ? "" : `<div class="empty">Classic Outlook isn't on this PC, so only New email works here.</div>`}
      ${lbl("Emails from someone")}<div style="display:flex;gap:8px">${field("olFrom", "Their email")}<button class="btn go" ${A("pickOutlook", "from")}${ok ? "" : " disabled"}>Add</button></div>
      ${lbl("A saved search")}<div style="display:flex;gap:8px">${field("olSearch", "Like: subject:UAT or hasattachments:yes from:sara")}<button class="btn go" ${A("pickOutlook", "search")}${ok ? "" : " disabled"}>Add</button></div>
      ${lbl("A folder")}<div style="display:flex;gap:8px">${field("olFolder", "Inside Inbox, like Projects/Website")}<button class="btn go" ${A("pickOutlook", "folder")}${ok ? "" : " disabled"}>Add</button></div>
      ${lbl("New email to")}<div style="display:flex;gap:8px">${field("olTo", "Email address")}<button class="btn go" ${A("pickOutlook", "compose")}>Add</button></div>
      <button class="btn" style="align-self:flex-start" ${A("pickKey", { label: "Calendar", sub: "Outlook", action: { type: "outlook", op: "calendar" }, glyph: "cal" })}${ok ? "" : " disabled"}>${svg("cal", 16)}Calendar key</button></div>`;
  },
  // things this PC's apps can do by themselves; one tap adds a key (a few ask for a detail first)
  inapps(D) {
    const list = D.ui.connList;
    if (!list) { act("connectorList").then((r) => { D.ui.connList = (r && r.list) || []; drawSheet(); }); return `<div class="empty">Looking at your apps...</div>`; }
    const fid = (c, a, p) => "ap-" + c.id + "-" + a.id + "-" + p.name;
    const form = (c, a) => `<div class="kf" style="gap:6px">${lbl(esc(a.label))}<div style="display:flex;gap:8px;flex-wrap:wrap">${a.params.map((p) => p.kind === "choice"
      ? `<select id="${fid(c, a, p)}">${(p.options || []).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`
      : field(fid(c, a, p), p.label + (p.optional ? " (optional)" : ""))).join("")}<button class="btn go" ${A("pickAppAction", { cid: c.id, aid: a.id })}>Add</button></div></div>`;
    return `<div class="kform">${list.length ? list.map((c) => `${lbl(esc(c.name))}
      <div class="chips">${c.actions.filter((a) => !a.params.length).map((a) => `<button class="btn sm" ${A("pickKey", { label: a.label, sub: c.name, action: { type: "action", cid: c.id, aid: a.id }, glyph: "bolt" })}>${esc(a.label)}</button>`).join("")}</div>
      ${c.actions.filter((a) => a.params.length).map((a) => form(c, a)).join("")}`).join("") : `<div class="empty">None of your apps have actions here yet.</div>`}
      <span class="m" style="font-size:13px">These use each app's own shortcuts and links, so nothing needs signing in.</span></div>`;
  },
  combo(D) {
    const u = D.ui.addKey; u.steps = u.steps || [];
    const all = Object.values(D.cfg.keySets).flat().filter((k) => k.action && k.action.type !== "multi" && k.action.type !== "ai-task");
    return `<div class="kform">${lbl("One tap, several things. Pick up to 5 of your keys in order")}
      <div class="chips">${all.map((k) => `<button class="btn sm" ${A("comboAdd", k.id)}>${esc(k.label)}</button>`).join("") || `<span class="empty">Add some keys first.</span>`}</div>
      <div class="steps">${u.steps.map((s, i) => `<span class="stp"><b>${i + 1}</b>${esc(s.label)}<button class="plain" ${A("comboDel", i)} aria-label="Remove">${svg("x", 12, 2.6)}</button></span>`).join(svg("chev", 14)) || `<span class="m">No steps yet.</span>`}</div>
      <div style="display:flex;gap:8px">${field("cbName", "Name, like Start my meeting")}<button class="btn go" ${A("pickCombo")}>Add combo</button></div>
      <span class="m" style="font-size:13px">For example: open Teams, then press Ctrl+Shift+M to mute.</span></div>`;
  }
};

// every key in a set: tap to run, or switch to Arrange to edit and reorder
SHEETS.allKeys = function (D) {
  const set = D.ui.allKeysSet || "home";
  const keys = D.cfg.keySets[set] || [];
  const arr = !!D.ui.arrange;
  const sets = Object.keys(D.cfg.keySets);
  const head = `<div class="seg">${sets.map((s) => `<button class="${s === set ? "on" : ""}" ${A("allKeysSet", s)}>${esc(s.charAt(0).toUpperCase() + s.slice(1))}</button>`).join("")}</div><button class="btn sm${arr ? " go" : ""}" ${A("arrange")}>${arr ? "Done" : "Arrange"}</button><button class="btn sm" ${A("addKey", set)}>${svg("plus", 16)}Add</button>`;
  const tiles = keys.map((k, i) => arr
    ? `<div class="akey">${keyHTML(k, { edit: true, set })}<div class="mv"><button class="ic sm" ${A("moveKey", { set, i, d: -1 })} aria-label="Move earlier"${i === 0 ? " disabled" : ""}>${svg("prev", 16)}</button><button class="ic sm" ${A("moveKey", { set, i, d: 1 })} aria-label="Move later"${i === keys.length - 1 ? " disabled" : ""}>${svg("next", 16)}</button></div></div>`
    : `<div class="akey">${keyHTML(k)}</div>`).join("");
  return sheetFrame("All keys", arr ? "Tap a key to change it. Arrows move it. The first ones show on your screen." : keys.length + " keys", `<div class="akeys">${tiles || `<div class="empty">No keys yet.</div>`}</div>`, head);
};

// a person key asks how to reach them
SHEETS.person = function (D) {
  const k = D.ui.personKey; if (!k) return "";
  const a = k.action;
  const opts = [["chat", "Teams chat", "chat"], ["call", "Teams call", "phone"], ["video", "Video call", "camera"], ["email", "New email", "mail"], ["mails", "Their emails", "inbox"]].concat(a.phone ? [["whatsapp", "WhatsApp", "whatsapp"]] : []);
  return sheetFrame(esc(k.label), esc(a.email + (a.phone ? " · " + a.phone : "")), `<div class="pgrid">${opts.map(([h, l, g]) => `<button class="tile" ${A("personDo", { id: k.id, how: h })}>${svg(G[g] ? g : "chat", 30)}<span class="l">${l}</span></button>`).join("")}</div>`);
};

// edit a key: name, line under it, and what it does
SHEETS.editKey = function (D) {
  const e = D.ui.editKey; if (!e) return "";
  const k = (D.cfg.keySets[e.set] || []).find((x) => x.id === e.id); if (!k) return sheetFrame("Key", "", `<div class="empty">That key is gone.</div>`);
  const a = k.action;
  let what = "";
  if (a.type === "person") what = `${lbl("Email")}${field("ekEmail", "Email", a.email)}${lbl("Mobile")}${field("ekPhone", "Mobile (optional)", a.phone)}${lbl("When you tap")}<div class="seg">${TAPS.map(([t, l]) => `<button class="${(e.tap || a.tap || "menu") === t ? "on" : ""}" ${A("ekTap", t)}>${l}</button>`).join("")}</div>`;
  else if (a.type === "hotkey") what = `${lbl("Keys")}<input type="text" id="ekKeys" data-record="1" value="${esc(a.keys)}">`;
  else if (a.type === "text") what = `${lbl("Text")}<textarea id="ekText" rows="4">${esc(a.text)}</textarea>`;
  else if (a.type === "url" || a.type === "playlist" || a.type === "game") what = `${lbl("Link")}${field("ekUrl", "Link", a.target)}`;
  else if (a.type === "outlook" && a.op !== "calendar") what = `${lbl({ from: "Their email", search: "Search", folder: "Folder", compose: "To" }[a.op])}${field("ekValue", "", a.value)}`;
  else if (a.type === "ai-task") what = `${lbl("What the AI should do")}<textarea id="ekPrompt" rows="3">${esc(a.prompt || "")}</textarea>`;
  return sheetFrame("Edit key", "", `<div class="kform" style="max-width:760px">${lbl("Name")}${field("ekLabel", "Name", k.label)}${lbl("Small line under the name")}${field("ekSub", "Optional", k.sub)}${what}
    <div style="display:flex;gap:8px;margin-top:8px"><button class="btn go" ${A("ekSave")}>Save</button><button class="btn${D.ui.armed === "ekdel" ? " warn" : ""}" ${A("ekDelete")}>${D.ui.armed === "ekdel" ? "Tap again to remove" : "Remove key"}</button></div></div>`);
};

// record a key combination by pressing it
document.addEventListener("keydown", (e) => {
  const el = e.target;
  if (!el || !el.dataset || !el.dataset.record) return;
  if (["Tab"].includes(e.key) && !e.ctrlKey && !e.altKey) return;
  const named = { " ": "space", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Escape: "esc", Enter: "enter", Backspace: "backspace", Delete: "delete", PageUp: "pageup", PageDown: "pagedown", Home: "home", End: "end", Insert: "insert" };
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
  if (e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.shiftKey) { el.value = ""; e.preventDefault(); return; }
  // use the key itself, not the character Shift makes (Shift+1 is "1", not "!"); "+" becomes "plus"
  const code = e.code || "";
  const base = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : /^Digit\d$/.test(code) ? code.slice(5) : { Equal: "plus", Minus: "minus", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`", NumpadAdd: "plus" }[code];
  const k = named[e.key] || (/^F\d{1,2}$/.test(e.key) ? e.key.toLowerCase() : base || (e.key.length === 1 ? e.key.toLowerCase() : null));
  if (!k) return;
  e.preventDefault();
  el.value = [e.ctrlKey && "ctrl", e.metaKey && "win", e.altKey && "alt", e.shiftKey && "shift", k].filter(Boolean).join("+");
}, true);

const val = (id) => (($("#" + id) || {}).value || "").trim();
// flip a Keys widget to another page
function keyPageGo(id, d) {
  const L = activeLayout(); const w = L.widgets.find((x) => x.id === id); if (!w) return;
  const kp = D.ui.keyPage = D.ui.keyPage || {};
  const before = kp[id] || 0;
  kp[id] = Math.max(0, before + d);
  render();
  if ((D.ui.keyPage[id] || 0) !== before) { D.ui.keySlide = { id, d, at: Date.now() }; lastAppHTML = ""; render(); setTimeout(() => { D.ui.keySlide = null; }, 400); }
}
// swipe left or right on the keys
let swipe = null;
document.addEventListener("pointerdown", (e) => { const g = e.target.closest("[data-swipe]"); swipe = g ? { id: g.dataset.swipe, x: e.clientX, y: e.clientY } : null; }, true);
document.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  const s = swipe; swipe = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 350); keyPageGo(s.id, dx < 0 ? 1 : -1); }
}, true);
// mouse wheel over the keys flips pages
document.addEventListener("wheel", (e) => {
  const g = e.target.closest("[data-swipe]"); if (!g || D.ui.editing) return;
  e.preventDefault(); e.stopPropagation();
  const now = Date.now(); if (now - (keyPageGo.t || 0) < 350) return; keyPageGo.t = now;
  keyPageGo(g.dataset.swipe, (e.deltaY || e.deltaX) > 0 ? 1 : -1);
}, { passive: false, capture: true });

Object.assign(H, {
  nextQuote: () => { D.ui.quoteSkip = (D.ui.quoteSkip || 0) + 1; lastAppHTML = ""; render(); },
  keyPage: ({ id, d }) => keyPageGo(id, d),
  allKeys: (set) => { D.ui.allKeysSet = set; D.ui.arrange = false; openSheet("allKeys"); },
  allKeysSet: (s) => { D.ui.allKeysSet = s; drawSheet(); },
  arrange: () => { D.ui.arrange = !D.ui.arrange; drawSheet(); },
  moveKey: async ({ set, i, d }) => { const ks = D.cfg.keySets[set]; const j = i + d; if (j < 0 || j >= ks.length) return; [ks[i], ks[j]] = [ks[j], ks[i]]; await cfgSave(); drawSheet(); render(); },
  keyTap: (t) => { D.ui.addKey.tap = t; drawSheet(); },
  pickPerson: () => {
    const name = val("pName"), email = val("pEmail"), phone = val("pPhone");
    if (!EMAIL_OK.test(email)) { toast("Type their full email address"); return; }
    if (phone && !/^\+?[0-9 ]{6,20}$/.test(phone)) { toast("Type the mobile as digits, like +44 7700 900123"); return; }
    const tap = D.ui.addKey.tap || "menu";
    H.pickKey({ label: name || email.split("@")[0], sub: TAPS.find((t) => t[0] === tap)[1].replace("Ask each time", "Chat, call, email"), action: Object.assign({ type: "person", email, tap }, phone ? { phone } : {}), glyph: "person" });
  },
  pickHotkey: () => {
    const k = val("hkKeys"); if (!/^[A-Za-z0-9+ ,./;'\[\]\\`=-]{1,40}$/.test(k)) { toast("Tap the box and press the keys"); return; }
    H.pickKey({ label: val("hkName") || prettyCombo(k), sub: prettyCombo(k), action: { type: "hotkey", keys: k }, glyph: "kbd" });
  },
  pickText: () => { const t = ($("#txText") || {}).value || ""; if (!t.trim()) { toast("Type the text first"); return; } H.pickKey({ label: val("txName") || t.trim().split("\n")[0].slice(0, 24), sub: "Types it for you", action: { type: "text", text: t.slice(0, 4000) }, glyph: "textk" }); },
  pickLink: () => {
    let u = val("lnUrl"); if (!u) { toast("Paste a link first"); return; }
    if (/^www\.|^[\w-]+\.[a-z]{2,}(\/|$)/i.test(u)) u = "https://" + u;
    if (!LINK_OK.test(u)) { toast("That kind of link can't be opened from a key"); return; }
    const kind = /teams\.microsoft|^msteams:/i.test(u) ? "Teams" : /^slack:|slack\.com/i.test(u) ? "Slack" : /^vscode:/i.test(u) ? "VS Code" : /^obsidian:/i.test(u) ? "Obsidian" : /notion/i.test(u) ? "Notion" : /^whatsapp:|wa\.me/i.test(u) ? "WhatsApp" : /^https?:/i.test(u) ? u.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0] : "Link";
    H.pickKey({ label: val("lnName") || kind, sub: kind, action: { type: "url", target: u }, glyph: /Teams|Slack|WhatsApp/.test(kind) ? "chat" : "link" });
  },
  pickVSCode: async () => { const r = await act("pickFolder"); act("typing", true); if (!r.path) return; H.pickKey({ label: r.path.split(/[\\/]/).filter(Boolean).pop(), sub: "VS Code", action: { type: "url", target: "vscode://file/" + r.path.replace(/\\/g, "/") }, glyph: "codex" }); },
  pickOutlook: (op) => {
    const v = val({ from: "olFrom", search: "olSearch", folder: "olFolder", compose: "olTo" }[op]);
    if (!v) { toast("Fill that in first"); return; }
    if ((op === "from" || op === "compose") && !EMAIL_OK.test(v)) { toast("Type a full email address"); return; }
    H.pickKey({ label: op === "from" ? "From " + v.split("@")[0] : op === "compose" ? "Email " + v.split("@")[0] : op === "folder" ? v.split(/[\\/]/).pop() : v.slice(0, 24), sub: "Outlook", action: { type: "outlook", op, value: v }, glyph: "mail" });
  },
  comboAdd: (id) => { const k = Object.values(D.cfg.keySets).flat().find((x) => x.id === id); const u = D.ui.addKey; u.steps = u.steps || []; if (!k || u.steps.length >= 5) { toast("Five steps at most"); return; } u.steps.push({ label: k.label, action: k.action }); drawSheet(); },
  comboDel: (i) => { D.ui.addKey.steps.splice(i, 1); drawSheet(); },
  pickCombo: () => { const u = D.ui.addKey; if (!u.steps || u.steps.length < 2) { toast("Pick at least two steps"); return; } H.pickKey({ label: val("cbName") || u.steps.map((s) => s.label).join(" + ").slice(0, 30), sub: u.steps.length + " steps", action: { type: "multi", steps: u.steps.map((s) => s.action) }, glyph: "combo" }); u.steps = []; },
  personDo: async (a) => { const r = await act("personDo", a); toast(r.error || r.toast || "Opening"); if (!r.error) closeSheet(); },
  editKey: ({ set, id }) => { D.ui.fromAll = D.ui.sheet === "allKeys"; D.ui.editKey = { set, id }; D.ui.armed = null; openSheet("editKey"); },
  ekTap: (t) => { D.ui.editKey.tap = t; drawSheet(); },
  ekSave: async () => {
    const e = D.ui.editKey; const k = (D.cfg.keySets[e.set] || []).find((x) => x.id === e.id); if (!k) return;
    const a = Object.assign({}, k.action);
    if (a.type === "person") { const em = val("ekEmail"), ph = val("ekPhone"); if (!EMAIL_OK.test(em)) { toast("Type a full email address"); return; } a.email = em; if (ph) a.phone = ph; else delete a.phone; a.tap = e.tap || a.tap || "menu"; }
    if (a.type === "hotkey") a.keys = val("ekKeys");
    if (a.type === "text") a.text = ($("#ekText") || {}).value || a.text;
    if (a.type === "url" || a.type === "playlist" || a.type === "game") { const u = val("ekUrl"); if (!LINK_OK.test(u)) { toast("That kind of link can't be opened from a key"); return; } a.target = u; }
    if (a.type === "outlook" && a.op !== "calendar") a.value = val("ekValue");
    if (a.type === "ai-task") a.prompt = ($("#ekPrompt") || {}).value || "";
    k.label = val("ekLabel") || k.label; k.sub = val("ekSub"); k.action = a;
    await cfgSave(); render(); toast("Saved"); if (D.ui.fromAll) { D.ui.fromAll = false; openSheet("allKeys"); } else closeSheet();
  },
  ekDelete: async () => { if (!H.arm("ekdel")) return; const e = D.ui.editKey; D.cfg.keySets[e.set] = D.cfg.keySets[e.set].filter((k) => k.id !== e.id); await cfgSave(); render(); toast("Removed"); if (D.ui.fromAll) { D.ui.fromAll = false; openSheet("allKeys"); } else closeSheet(); }
});
