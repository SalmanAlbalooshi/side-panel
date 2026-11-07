// Side Panel renderer: draws the active layout, the attention card and sheets; handles taps, edit mode, voice and the game.
const D = { cfg: null, live: {}, claude: null, attention: [], suggested: [], providers: [], quote: null, hooks: {}, host: "", sideScreen: false };
window.D = D;
D.ui = {
  sheet: null, editing: null, showTitles: false, layoutSel: null,
  focus: { running: false, end: 0, left: 25 * 60 },
  ask: { mode: "quick", provider: null, text: "", answer: "", error: "", busy: false, recording: false, dir: null },
  addKey: { tab: "apps", set: "home", q: "" },
  setup: { step: 1, template: "Developer" },
  apps: null, games: null, displays: null, disc: null
};
const LIVE_SHEETS = new Set(["sessions", "settings", "screens", "layouts", "setup", "music", "browser", "chat", "chats", "update"]);
const TYPING_SHEETS = new Set(["ask", "addKey", "build", "music", "chat", "log", "editKey", "cmd"]);
// the music sheet redraws every second; its lyrics, progress and level bars animate in between
let pointerDown = false, lastAppHTML = "", pendingRender = false;
document.addEventListener("pointerdown", () => { pointerDown = true; }, true);
const pointerEnd = () => { pointerDown = false; if (pendingRender) { pendingRender = false; setTimeout(render, 30); } };
document.addEventListener("pointerup", pointerEnd, true);
document.addEventListener("pointercancel", pointerEnd, true);
let dragging = false, toastTimer = null, lastAttKey = "";

const $ = (s) => document.querySelector(s);
const act = (n, a) => window.panel.act(n, a);
function toast(t) {
  if (!t) return;
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = t; el.classList.remove("hide");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add("hide"), 2600);
}

// ---------- theme ----------
function applyTheme() {
  const c = D.cfg;
  let dark;
  if (c.theme === "dark") dark = true;
  else if (c.theme === "light") dark = false;
  else {
    const now = new Date(); const m = now.getHours() * 60 + now.getMinutes();
    const t = (s) => { const [h, mm] = String(s).split(":").map(Number); return h * 60 + mm; };
    const a = t(c.darkFrom || "18:00"), b = t(c.darkTo || "06:30");
    dark = a <= b ? m >= a && m < b : m >= a || m < b;
  }
  document.documentElement.classList.toggle("dark", dark);
}

// ---------- layout ----------
function activeLayout() {
  const name = D.ui.editing || D.cfg.activeLayout;
  return D.cfg.layouts.find((l) => l.name === name) || D.cfg.layouts[0];
}
function topBar() {
  const L = activeLayout();
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  if (D.ui.editing) {
    return `<div class="editbar"><span style="font-size:22px;font-weight:700">Editing: ${esc(L.name)}</span><span class="m" style="font-size:14px">Drag a widget to move it. Drag its corner to resize. Tap x to remove.</span><button class="btn" style="margin-left:auto" ${A("sheet", "library")}>${svg("plus", 18)}Add widget</button><button class="btn go" ${A("editDone")}>Done</button></div>`;
  }
  const note = D.live.ruleNote && D.live.ruleNote !== "picked by you" ? `Layout ${esc(D.live.ruleNote)}` : D.cfg.quotes && D.quote ? `${esc(D.quote[0])} <span style="opacity:.8">${esc(D.quote[1])}</span>` : "";
  return `<div class="top">
    <button class="lay" ${A("sheet", "layouts")} aria-label="Switch layout">${svg("layers", 20)}${esc(L.name)}${svg("chev", 18)}</button>
    <span class="note">${D.live.ruleNote && D.live.ruleNote !== "picked by you" ? note : ""}</span>
    <button class="askblink" ${A("cmdOpen")} aria-label="Ask Blink">${typeof blinkFace === "function" && (D.cfg.companion || "blink") === "blink" ? blinkFace(40, typeof bkMood === "function" ? bkMood() : "idle").replace(/data-act="poke"/, "") : svg("mic", 20)}<span>Ask Blink</span></button>
    <button class="ic" style="width:46px;height:46px" ${A("editCurrent")} aria-label="Edit this layout" title="Edit this layout">${svg("edit", 22)}</button>
    ${D.canMini ? `<button class="ic" style="width:46px;height:46px" ${A("shrink")} aria-label="Switch to the small Mini panel" title="Switch to the small Mini panel">${svg("shrink", 22)}</button>` : ""}
    <button class="ic" style="width:46px;height:46px" ${A("sheet", "settings")} aria-label="Settings">${svg("gear", 22)}</button>
    ${L.widgets.some((w) => w.type === "clock") ? "" : `<span class="n clockTop">${p(d.getHours())}:${p(d.getMinutes())}</span>`}</div>`;
}
function gridHTML() {
  const L = activeLayout();
  const edit = !!D.ui.editing;
  const cells = (L.widgets || []).map((w) => {
    const def = W[w.type];
    if (!def) return "";
    let inner = "";
    try { inner = def.render(w, D); } catch (e) { inner = `<div class="empty">This widget hit a problem: ${esc(e.message)}</div>`; }
    const handles = edit ? `<button class="wx" ${A("removeWidget", w.id)} aria-label="Remove">${svg("x", 16, 2.4)}</button><span class="wr" data-resize="${w.id}">${svg("resize", 20, 2.2)}</span>` : "";
    return `<div class="w" data-wid="${w.id}" style="grid-column:${w.x} / span ${w.w};grid-row:${w.y} / span ${w.h}">${inner}${handles}</div>`;
  }).join("");
  const empty = edit ? freeCellsHint(L) : "";
  return `<div class="g6${edit ? " editing" : ""}" id="grid">${cells}${empty}</div>`;
}
function freeCellsHint(L) {
  const taken = new Set();
  L.widgets.forEach((w) => { for (let x = w.x; x < w.x + w.w; x++) for (let y = w.y; y < w.y + w.h; y++) taken.add(x + "," + y); });
  let out = "";
  for (let y = 1; y <= 4; y++) for (let x = 1; x <= 6; x++) if (!taken.has(x + "," + y)) out += `<div style="grid-column:${x};grid-row:${y};border:2px dashed var(--rule);border-radius:12px"></div>`;
  return out;
}

// countdowns tick in place, so the buttons next to them never get rebuilt under a finger
function tickCountdowns() { for (const el of document.querySelectorAll(".cdown")) { const v = String(Math.max(0, Math.round((Number(el.dataset.until) - Date.now()) / 1000))); if (el.textContent !== v) el.textContent = v; } }
setInterval(tickCountdowns, 1000);
function attentionHTML() {
  const urgent = (D.attention || []).filter((x) => x.urgent);
  if (!urgent.length || D.ui.editing) return "";
  const a = urgent[0];
  const more = urgent.length > 1 ? `<span class="m" style="font-size:13px">+${urgent.length - 1} more</span>` : "";
  if (a.kind === "approval") {
    const left = Math.max(0, Math.round((a.until - Date.now()) / 1000));
    return `<div class="att">${companion(D.cfg.companion, 120, "asking")}<div style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:6px">
      <span class="title">${esc(a.title)}. ${a.source === "panel" ? "It waits for you" : `If you don't answer in <span class="cdown" data-until="${a.until}"></span>s, it asks on your main screen instead`} ${more}</span>
      <span class="big">${esc(a.text)}?</span><span class="detail">${esc(a.detail)}</span>
      <div style="display:flex;gap:10px;margin-top:4px;flex-wrap:wrap">${a.source === "app" ? `<button class="btn go" ${A("approve", { id: a.id, decision: "allow" })}>Allow</button><button class="btn" ${A("approve", { id: a.id, decision: "deny" })}>Not now</button>` : a.source === "panel" ? `<button class="btn go" ${A("approve", { id: a.id, decision: "allow" })}>Allow once</button><button class="btn" ${A("approve", { id: a.id, decision: "deny" })}>Deny</button><button class="btn" style="margin-left:auto" ${A("openThread", a.thread)}>See the task</button>` : ""}${a.source !== "panel" && a.source !== "app" && D.cfg.approvalsFromPanel ? `<button class="btn go" ${A("approve", { id: a.id, decision: "allow" })}>Allow once</button><button class="btn" ${A("approve", { id: a.id, decision: "deny" })}>Deny</button>` : ""}${a.source === "panel" || a.source === "app" ? "" : `<button class="btn" style="margin-left:auto" ${A("approve", { id: a.id, decision: null })}>Answer on main screen</button>`}</div></div></div>`;
  }
  if (a.kind === "meeting") {
    return `<div class="att" style="padding:14px 20px">${svg("people", 36)}<div style="flex:1 1 auto"><span class="title">${esc(a.title)}</span><div style="font-size:22px;font-weight:700">${esc(a.text)}</div></div>${a.join ? `<button class="btn go" ${A("openUrl", a.join)}>Join</button>` : ""}<button class="btn" ${A("dismissAtt", { key: a.key, hours: 1 })}>Later</button></div>`;
  }
  if (a.kind === "pair") {
    return `<div class="att" style="padding:14px 20px">${svg("globe", 36)}<div style="flex:1 1 auto"><span class="title">${esc(a.title)}</span><div style="font-size:20px;font-weight:700">${esc(a.text)}</div></div><button class="btn go" ${A("pairWeb", true)}>Allow</button><button class="btn" ${A("pairWeb", false)}>Deny</button></div>`;
  }
  // anything else urgent: a plain banner with its fix (if any) and Hide
  return `<div class="att" style="padding:14px 20px">${svg("bell", 34)}<div style="flex:1 1 auto;min-width:0"><span class="title">${esc(a.title)}</span><div style="font-size:18px;font-weight:600">${esc(a.text || "")}</div></div>${a.action ? `<button class="btn go" ${A("attAction", a.action)}>${esc(a.action.label)}</button>` : ""}<button class="btn" ${A("dismissAtt", { key: a.key, hours: 24 })}>Hide</button>${more}</div>`;
}

// The mini panel: what's happening with your AI, the song, and your first keys. Tap expand for the full panel.
function miniHTML() {
  const c = D.claude || { sessions: [], approvals: [] };
  const ss = c.sessions.filter((s) => s.state !== "ended" && !(s.state === "done" && Date.now() - s.updated > 6 * 3600000));
  const need = ss.filter((s) => s.state === "waiting").length, run = ss.filter((s) => s.state === "working").length;
  const ap = (c.approvals || [])[0];
  const line = ap ? esc(ap.project) + " needs your OK" : need ? need + " waiting for you" : run ? run + " working" : ss.length ? "All done" : "No AI running";
  const face = companion(D.cfg.companion === "none" ? "pip" : D.cfg.companion, 40, ap || need ? "asking" : run ? "working" : "idle");
  const apRow = ap ? `<div class="mrow need"><div style="min-width:0;flex:1 1 auto"><b class="ell" style="display:block">${esc(ap.what)}</b><span class="ell m mono" style="display:block">${esc(ap.detail || "")}</span></div>${ap.source === "panel" || ap.source === "app" || D.cfg.approvalsFromPanel ? `<button class="btn sm go" ${A("approve", { id: ap.id, decision: "allow" })}>${ap.source === "app" ? "Allow" : "Allow once"}</button><button class="btn sm" ${A("approve", { id: ap.id, decision: "deny" })}>${ap.source === "app" ? "Not now" : "Deny"}</button>` : `<button class="btn sm" ${A("approve", { id: ap.id, decision: null })}>Answer on PC</button>`}</div>`
    : `<button class="mrow plain" ${A("sheet", "sessions")}>${ss.slice(0, 2).map((s) => `<span class="ell" style="display:block"><span class="dot" style="background:${(STATE[s.state] || ["var(--mute)"])[0]}"></span> <b>${esc(s.project)}</b> <span class="m">${esc((STATE[s.state] || ["", s.state])[1])}</span></span>`).join("") || `<span class="m">Ask Blink to start one.</span>`}</button>`;
  const cur = curMedia(D);
  const art = cur && imgSrc(cur.art);
  const music = cur ? `<div class="mrow"><button class="plain" style="display:flex;gap:10px;align-items:center;min-width:0;flex:1 1 auto" ${A("musicOpen", "")}>${art ? `<img src="${art}" style="width:40px;height:40px;border-radius:6px;object-fit:cover" alt="">` : svg("music", 22)}<span style="min-width:0"><b class="ell" style="display:block">${esc(cur.title || "")}</b><span class="ell m" style="display:block;font-size:12px">${esc(cur.artist || cur.name)}</span></span></button><button class="ic sm" ${A("media", { action: "prev", app: cur.app })} aria-label="Previous">${svg("prev", 18)}</button><button class="ic sm" style="background:var(--ink);color:var(--bg)" ${A("media", { action: "toggle", app: cur.app })} aria-label="Play or pause">${svg(cur.playing ? "pause" : "pp", 18, 2.2)}</button><button class="ic sm" ${A("media", { action: "next", app: cur.app })} aria-label="Next">${svg("next", 18)}</button></div>` : "";
  const L = activeLayout();
  const kw = L.widgets.find((w) => w.type === "keys");
  const keys = ((kw && D.cfg.keySets[(kw.opts && kw.opts.set) || "home"]) || D.cfg.keySets.home || []).slice(0, 6);
  const keyRow = keys.length ? `<div class="mkeys">${keys.map((k) => `<button class="mk" ${A("key", k.id)} title="${esc(k.label)}">${imgSrc(k.icon) ? `<img src="${imgSrc(k.icon)}" alt="">` : svg(k.glyph || "bolt", 22)}<span>${esc(k.label)}</span></button>`).join("")}</div>` : "";
  return `<div class="minip${ap || need ? " needs" : ""}"><div class="mhead">${face}<b class="ell" style="flex:1 1 auto">${line}</b><button class="ic sm" ${A("sheet", "ask")} aria-label="Ask">${svg("mic", 18)}</button><button class="ic sm" ${A("expand")} aria-label="Open the full panel">${svg("expand", 18)}</button></div>${apRow}${music}${keyRow}</div>`;
}
// The day's quote, shown big once a day the first time you look at the panel; tap the top bar to see it again.
const today = () => new Date().toDateString();
function quoteSeen() { try { return localStorage.getItem("quoteSeen") === today(); } catch { return true; } }
function quoteCardHTML() {
  if (!D.cfg.quotes || !D.quote || D.ui.editing || D.ui.sheet || D.mini) return "";
  if ((quoteSeen() || D.test) && !D.ui.quoteOpen) return "";
  return `<div class="qcard">${svg("quote", 34)}<div style="flex:1 1 auto;min-width:0"><span class="title" style="color:var(--mute)">Today's quote</span><div class="qtext">${esc(D.quote[0])}</div><div class="m" style="font-size:16px;margin-top:6px">${esc(D.quote[1])}</div></div><button class="btn go" ${A("quoteDone")}>Got it</button></div>`;
}
function ambientHTML() {
  const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  const ss = ((D.claude && D.claude.sessions) || []).filter((s) => s.state !== "ended" && s.state !== "idle").slice(0, 4);
  const m = D.live.media && (D.live.media.sessions || []).find((x) => x.playing);
  const col = { working: "var(--live)", waiting: "var(--wait)", yourturn: "var(--ok)" };
  const crew = ss.map((s) => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:200px">${companion(D.cfg.companion === "none" ? "pip" : D.cfg.companion, 120, s.state === "waiting" ? "asking" : s.state === "working" ? "working" : "done")}<span style="font-size:17px;font-weight:700;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.project)}</span><span style="font-size:14px;color:${col[s.state] || "var(--mute)"}">${esc((STATE[s.state] || ["", s.state])[1])}</span></div>`).join("");
  return `<div class="ambient" ${A("wake")}>
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div class="n" style="font-size:150px;line-height:.85">${p(d.getHours())}:${p(d.getMinutes())}</div><div style="font-size:24px;margin-top:10px">${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div></div>
    ${D.cfg.quotes && D.quote ? `<div style="max-width:420px;text-align:right;font-size:18px;line-height:1.4" class="m">${esc(D.quote[0])}<br><span style="font-size:14px">${esc(D.quote[1])}</span></div>` : ""}</div>
    <div style="display:flex;gap:30px;align-items:flex-end;justify-content:center;flex:1 1 auto;padding-bottom:20px">${crew || `<div class="m" style="font-size:20px">No AI sessions running</div>`}</div>
    <div style="display:flex;align-items:center;gap:14px;font-size:18px">${m ? svg("music", 22) + esc(m.title) + (m.artist ? '<span class="m">' + esc(m.artist) + "</span>" : "") : ""}<span class="m" style="margin-left:auto">Tap anywhere to wake</span></div>
  </div>`;
}
let lastApprovalCount = 0;
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[660, 0], [880, 0.16]].forEach(([f, t]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4); });
    setTimeout(() => ctx.close(), 1200);
  } catch { }
}
function keepFocus(swap) {
  const a = document.activeElement, id = a && a.id && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && document.getElementById("app").contains(a) ? a.id : null;
  const st = id ? a.selectionStart : 0, en = id ? a.selectionEnd : 0, val = id ? a.value : "";
  swap();
  if (!id) return;
  const b = document.getElementById(id); if (!b) return;
  if (b.value !== val) b.value = val;
  b.focus(); try { b.setSelectionRange(st, en); } catch { }
}
function render() {
  if (!D.cfg) return;
  const nApprovals = ((D.claude && D.claude.approvals) || []).length;
  if (nApprovals > lastApprovalCount && D.cfg.chime !== false && !D.live.inGame) chime();
  lastApprovalCount = nApprovals;
  document.body.classList.toggle("needyou", nApprovals > 0);
  const away = D.live.away && !D.mini && !D.ui.editing && !D.ui.sheet && !(D.attention || []).some((x) => x.urgent) && Date.now() > (D.ui.wakeUntil || 0);
  if (away) { applyTheme(); document.body.classList.toggle("windowed", !D.sideScreen); const h = ambientHTML(); if (h !== lastAppHTML) { keepFocus(() => { $("#app").innerHTML = h; }); lastAppHTML = h; } return; }
  applyTheme();
  document.body.classList.toggle("windowed", !D.sideScreen);
  document.body.classList.toggle("minimode", !!D.mini);
  if (D.mini && !D.ui.editing) { if (D.ui.sheet) { D.ui.sheet = null; $("#layer").innerHTML = ""; } const h = miniHTML(); if (h !== lastAppHTML) { if (pointerDown) pendingRender = true; else { keepFocus(() => { $("#app").innerHTML = h; }); lastAppHTML = h; } } return; }
  if (!D.cfg.setupDone && D.ui.sheet !== "setup") { openSheet("setup"); }
  // Rebuilding the page between a finger going down and up would swallow the tap, so wait for the finger.
  if (!dragging) {
    const html = topBar() + gridHTML() + attentionHTML();
    if (html !== lastAppHTML) { if (pointerDown) pendingRender = true; else { keepFocus(() => { $("#app").innerHTML = html; }); lastAppHTML = html; } }
    tickCountdowns();
  }
  if (D.ui.sheet && LIVE_SHEETS.has(D.ui.sheet)) drawSheet();
}
function drawSheet() {
  const f = SHEETS[D.ui.sheet];
  const layer = $("#layer");
  if (!f) { layer.innerHTML = ""; return; }
  const scroll = layer.querySelector(".body") ? layer.querySelector(".body").scrollTop : 0;
  const ae = document.activeElement; const fid = ae && ae.id; const sel = fid && ae.selectionStart;
  // boxes that only save on Save/Enter keep what you're typing through a refresh
  const KEEP = ["setName", "setupName", "nameText", "cxText", "logText", "plUrl", "plName"];
  const keepVal = fid && KEEP.includes(fid) && layer.contains(ae) ? ae.value : null;
  const c0 = layer.querySelector("#conv");
  const convTop = c0 ? c0.scrollTop : 0, atBottom = !c0 || c0.scrollHeight - c0.scrollTop - c0.clientHeight < 60;
  const openSteps = c0 ? [...c0.querySelectorAll("details")].map((d) => d.open) : [];
  const typed = $("#chatText"); if (typed) D.ui.chatText = typed.value;
  layer.innerHTML = f(D);
  const b = layer.querySelector(".body"); if (b) b.scrollTop = scroll;
  const c1 = layer.querySelector("#conv");
  if (c1) { c1.querySelectorAll("details").forEach((d, i) => { if (openSteps[i]) d.open = true; }); c1.scrollTop = D.ui.stick || atBottom ? c1.scrollHeight : convTop; D.ui.stick = false; }
  if (fid) { const el = document.getElementById(fid); if (el) { if (keepVal !== null) el.value = keepVal; el.focus(); try { el.selectionStart = el.selectionEnd = sel; } catch { } } }
  if (D.ui.sheet === "game") Game.mount();
}
async function openSheet(name) {
  if (D.mini) { D.mini = false; await act("setMini", false); }
  D.ui.lastTouch = Date.now(); // idle timers (like the music Glance view) start when a screen opens
  D.ui.sheet = name;
  if (name === "addKey" && !D.ui.apps) { act("apps").then((r) => { D.ui.apps = r.apps; D.ui.games = r.games; if (D.ui.sheet === "addKey") drawSheet(); }); }
  if (name === "screens") act("displays").then((r) => { D.ui.displays = r.displays; if (D.ui.sheet === "screens") drawSheet(); });
  if (name === "setup") act("discovery").then((r) => { D.ui.disc = r.disc; if (D.ui.sheet === "setup") drawSheet(); });
  act("typing", TYPING_SHEETS.has(name));
  drawSheet();
  if (name === "ask") setTimeout(() => { const t = $("#askText"); if (t) { t.focus(); t.selectionStart = t.value.length; } }, 50);
}
function closeSheet() {
  if (D.ui.sheet === "game") Game.stop();
  if (D.ui.sheet === "setup" && !D.cfg.setupDone) return;
  D.ui.sheet = null; $("#layer").innerHTML = ""; act("typing", false);
}

const Icons = {
  busy: false,
  want(list) {
    if (this.busy) return;
    const need = list.filter((a) => !a.icon && a.iconFrom && !a._asked).slice(0, 48);
    if (!need.length) return;
    need.forEach((a) => { a._asked = true; });
    this.busy = true;
    act("appIcons", need.map((a) => a.iconFrom)).then((r) => { need.forEach((a) => { if (r && r[a.iconFrom]) a.icon = r[a.iconFrom]; }); this.busy = false; if (D.ui.sheet === "addKey") drawSheet(); });
  }
};
function guessGlyph(n) {
  n = String(n).toLowerCase();
  if (/game|steam|xbox|epic|battle|launcher/.test(n)) return "game";
  if (/music|spotify|audio|sound/.test(n)) return "music";
  if (/chat|whatsapp|discord|telegram|teams|slack/.test(n)) return "chat";
  if (/edge|chrome|firefox|browser|opera|brave/.test(n)) return "globe";
  if (/camera|photo|snip|capture|obs/.test(n)) return "camera";
  if (/terminal|powershell|command|code/.test(n)) return "term";
  if (/settings|control/.test(n)) return "gear";
  if (/explorer|files|folder/.test(n)) return "folder";
  return "layers";
}

// ---------- data ----------
window.panel.onTick((data) => {
  // While you edit (or just after a change), keep your unsaved layout instead of the copy from the last save.
  if (D.cfg && data.cfg && (D.ui.editing || Date.now() < (D.ui.holdCfgUntil || 0))) data.cfg.layouts = D.cfg.layouts;
  Object.assign(D, data);
  if (typeof Call !== "undefined" && Call.on) Call.checkAsk();
  if (typeof maybeShowUpdate === "function") maybeShowUpdate();
  D.discOutlook = data.live && data.live.meeting !== undefined ? true : D.discOutlook;
  D.voice = D.voice ?? null;
  if (D.ui.focus.running && Date.now() >= D.ui.focus.end) { D.ui.focus.running = false; D.ui.focus.left = 25 * 60; toast("Focus time is up"); }
  render();
  if (typeof syncThreads === "function") syncThreads();
});
window.panel.onOpen((what) => {
  D.ui.wakeUntil = Date.now() + 120000;
  // a widget the AI just built goes straight onto the screen
  if (/^built:[\w .-]{1,60}$/.test(what)) {
    const name = what.slice(6);
    const L = D.cfg.layouts.find((l) => l.name === D.cfg.activeLayout) || D.cfg.layouts[0];
    if (!L.widgets.some((w) => w.type === "custom" && w.opts && w.opts.name === name)) {
      let spot = findSpot(L, 2, 1) || findSpot(L, 1, 1), shrunk = "";
      if (!spot) {
        const big = [...L.widgets].sort((a, b) => b.w * b.h - a.w * a.h)[0];
        if (big && big.w >= 3) { big.w--; shrunk = big; } else if (big && big.h >= 2) { big.h--; shrunk = big; }
        spot = findSpot(L, 2, 1) || findSpot(L, 1, 1);
      }
      D.ui.builtWhere = D.ui.builtWhere || {}; D.ui.builtWhere[name] = spot ? L.name : "";
      if (spot) { L.widgets.push({ id: "custom-" + Math.random().toString(36).slice(2, 7), type: "custom", x: spot.x, y: spot.y, w: spot.w, h: spot.h, opts: { name } }); cfgSave(); render(); toast("Your new widget is on the " + L.name + " screen" + (shrunk ? ". " + ((W[shrunk.type] || {}).title || "A widget") + " got a little smaller to make room" : "")); if (D.ui.sheet === "chat") drawSheet(); }
      else toast("Widget ready. Make room, then add it from Add a widget");
    }
    return;
  }
  if (what === "cmd") { if (D.mini) { D.ui.miniAsk = true; lastAppHTML = ""; render(); setTimeout(() => { const i = $("#cmdText"); if (i) i.focus(); }, 60); return; } H.cmdOpen(); return; }
  if (what.startsWith("thread:")) { if (D.mini && H.expand) H.expand(); setTimeout(() => H.openThread(what.slice(7)), D.mini ? 600 : 0); return; }
  if (what.startsWith("say:")) { let o = {}; try { o = JSON.parse(what.slice(4)); } catch { } const bk = [...document.querySelectorAll(".bk")].find((x) => x.getBoundingClientRect().width > 0); if (o.reminder) { chime(); toast(o.text); } if (bk) bkSay(bk, o.text); if (typeof speak === "function") speak(o.text); return; }
  openSheet(what === "settings" ? "screens" : what);
});
act("discovery").then((r) => { D.voice = !!(r.disc && r.disc.extras && r.disc.extras.whisper); D.discOutlook = !!(r.disc && r.disc.outlook); D.ui.disc = r.disc; D.recentGame = r.disc && r.disc.steam && r.disc.steam.games[0] ? r.disc.steam.games[0].name : ""; });

// ---------- taps ----------
let suppressClick = false;
document.addEventListener("click", async (e) => {
  if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
  const el = e.target.closest("[data-act]");
  if (!el) return;
  if (el.dataset.act === "editKey" && e.target.closest(".x")) return;
  const name = el.dataset.act;
  let arg; try { arg = el.dataset.arg !== undefined ? JSON.parse(el.dataset.arg) : undefined; } catch { arg = el.dataset.arg; }
  e.preventDefault();
  const h = H[name];
  if (h) await h(arg, el);
});
document.addEventListener("input", (e) => {
  if (e.target.id === "askText" || e.target.id === "miniText") D.ui.ask.text = e.target.value;
  if (e.target.id === "plUrl" || e.target.id === "plName") { D.ui.pl = D.ui.pl || {}; D.ui.pl[e.target.id === "plUrl" ? "url" : "name"] = e.target.value; }
  if (e.target.id === "chatQ") { D.ui.chatQ = e.target.value; clearTimeout(window.__cq); window.__cq = setTimeout(() => drawSheet(), 200); }
  if (e.target.id === "appSearch") { D.ui.addKey.q = e.target.value; clearTimeout(window.__st); window.__st = setTimeout(() => drawSheet(), 200); }
});
document.addEventListener("change", (e) => {
  const r = e.target.dataset.range;
  if (r === "volume") act("volume", Number(e.target.value));
  if (r === "app") act("appVolume", { pid: Number(e.target.dataset.pid), volume: Number(e.target.value) });
});

function allKeys() { return Object.values(D.cfg.keySets).flat().concat(D.suggested || []); }
function cfgSave(patch) { D.ui.holdCfgUntil = Date.now() + 2500; return act("saveConfig", patch || { layouts: D.cfg.layouts, keySets: D.cfg.keySets }); }

const H = {
  expand: async () => { D.mini = false; await act("setMini", false); },
  shrink: async () => { D.mini = true; await act("setMini", true); },
  showQuote: () => { D.ui.quoteOpen = true; lastAppHTML = ""; render(); },
  quoteDone: () => { try { localStorage.setItem("quoteSeen", today()); } catch { } D.ui.quoteOpen = false; lastAppHTML = ""; render(); },
  updateCheck: async () => { const r = await act("updateCheck"); toast(r.status === "current" ? "You have the latest version" : r.status === "available" ? r.latest + " is ready" : r.error || ""); },
  updateNow: async () => { const r = await act("updateNow"); toast(r.toast || r.error); },
  wake: () => { D.ui.wakeUntil = Date.now() + 120000; render(); },
  key: async (id) => { const k = allKeys().find((x) => x.id === id); if (!k) return; if (k.action && k.action.type === "person" && (k.action.tap || "menu") === "menu") { D.ui.personKey = k; openSheet("person"); return; } const r = await act("key", id); if (r && r.thread) { H.openThread(r.thread); return; } if (r && r.askTask) { D.ui.ask.mode = "task"; if (r.provider) D.ui.ask.provider = r.provider; D.ui.ask.thread = null; openSheet("ask"); return; } if (r && r.error) toast("Couldn't open: " + r.error); else toast(r && r.toast ? r.toast : "Opening " + k.label); },
  media: async (a) => { await act("media", a); },
  volStep: async (d) => { const v = Math.max(0, Math.min(100, ((D.live.audio && D.live.audio.volume) || 0) + d)); D.live.audio && (D.live.audio.volume = v); render(); await act("volume", v); },
  mute: (m) => act("mute", m),
  mic: (m) => act("mic", m),
  sheet: (n) => openSheet(n),
  closeSheet: () => closeSheet(),
  appForget: async (k) => { await act("appForget", k); D.cfg.appAllow = Object.assign({}, D.cfg.appAllow); delete D.cfg.appAllow[k]; drawSheet(); },
  noteToggle: async (id) => { const n = (D.cfg.notes || []).find((x) => x.id === id); if (n) { n.done = !n.done; n.doneAt = n.done ? Date.now() : 0; render(); } await act("noteToggle", id); },
  noteDel: async (id) => { D.cfg.notes = (D.cfg.notes || []).filter((x) => x.id !== id); render(); await act("noteDel", id); },
  approve: async (a) => { const r = await act("approve", a); toast(a.decision === "allow" ? "Allowed" : a.decision === "deny" ? "Denied" : "Asking in the terminal"); },
  openSession: async (s) => { const r = await act("openSession", s); toast(r && r.toast ? r.toast : r && r.ok ? "Opened" : "Couldn't find that window"); },
  hideSession: async (id) => { D.ui.hiddenSessions = (D.ui.hiddenSessions || []).concat(id).slice(-200); await act("hideSession", id); drawSheet(); render(); },
  mediaSource: async (a) => { D.mediaApp = a; await act("mediaSource", a); drawSheet(); render(); },
  playlist: async (id) => { const r = await act("playlist", id); toast(r && r.error ? r.error : (r && r.toast) || "Opening playlist"); },
  addPlaylist: async () => {
    const u = (($("#plUrl") || {}).value || "").trim(), n = (($("#plName") || {}).value || "").trim();
    const p = playlistFrom(u, n);
    if (!p) { toast("Paste a full link that starts with https:// or spotify:"); return; }
    D.cfg.playlists = (D.cfg.playlists || []).concat(p).slice(0, 24); D.ui.pl = {};
    await cfgSave({ playlists: D.cfg.playlists }); drawSheet(); render(); toast("Added " + p.label);
  },
  removePlaylist: async (id) => { D.cfg.playlists = (D.cfg.playlists || []).filter((p) => p.id !== id); await cfgSave({ playlists: D.cfg.playlists }); drawSheet(); render(); },
  pairWeb: async (yes) => { const r = await act("pairWeb", yes); toast(r && (r.toast || r.error) || (yes ? "Allowed" : "Declined")); },
  disconnectClaude: async () => { const r = await act("disconnectClaude"); toast(r.toast || r.error); },
  setupLink: async (which) => { const r = await act("setupBrowserLink", which); if (r.error) { toast(r.error); return; } D.ui.linkSetup = which; drawSheet(); toast("Look at your main screen"); },
  openExtensionFolder: async () => { const r = await act("openExtensionFolder"); toast(r.toast || r.error || "Opened on your main screen"); },
  copy: async (t) => { try { await navigator.clipboard.writeText(t); toast("Copied"); } catch { toast("Couldn't copy"); } },
  openUrl: (u) => act("openUrl", u),
  toggleTitles: () => { D.ui.showTitles = !D.ui.showTitles; render(); },
  dismissAtt: async (a) => { await act("dismiss", a); },
  attAction: async (a) => { const r = await act(a.act, a.arg); toast(r && r.error ? r.error : (r && r.toast) || "Opened on your main screen"); },
  toastText: (t) => toast(t),
  connectClaude: async () => { const r = await act("connectClaude"); toast(r.toast || r.error); },
  focus: (cmd) => {
    const f = D.ui.focus;
    if (cmd === "start") { f.running = true; f.end = Date.now() + f.left * 1000; }
    if (cmd === "pause") { f.left = Math.max(0, (f.end - Date.now()) / 1000); f.running = false; }
    if (cmd === "reset") { f.running = false; f.left = 25 * 60; }
    render();
  },
  themeFlip: () => { const dark = document.documentElement.classList.contains("dark"); D.cfg.theme = dark ? "light" : "dark"; render(); cfgSave({ theme: D.cfg.theme }); },
  // layouts
  layoutSel: (n) => { D.ui.layoutSel = n; drawSheet(); },
  setLayout: async (n) => { await act("setLayout", n); D.cfg.activeLayout = n; closeSheet(); render(); },
  editLayout: (n) => { closeSheet(); D.ui.editing = n; render(); },
  layoutNew: async () => {
    let i = 1; while (D.cfg.layouts.find((l) => l.name === "Layout " + i)) i++;
    D.cfg.layouts.push({ name: "Layout " + i, widgets: [], rules: [] }); D.ui.layoutSel = "Layout " + i; await cfgSave(); drawSheet();
  },
  // Anything that throws work away needs a second tap within 4 seconds.
  arm: (key) => { if (D.ui.armed === key) { D.ui.armed = null; return true; } D.ui.armed = key; clearTimeout(H._armT); H._armT = setTimeout(() => { D.ui.armed = null; if (D.ui.sheet) drawSheet(); }, 4000); drawSheet(); return false; },
  ruleTime: async ({ layout, i, which, delta }) => {
    const L = D.cfg.layouts.find((l) => l.name === layout); const r = L && L.rules[i]; if (!r) return;
    const [h, m] = String(r[which] || "09:00").split(":").map(Number);
    const t = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
    r[which] = String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
    drawSheet(); await cfgSave();
  },
  layoutDelete: async (n) => {
    if (!H.arm("del:" + n)) return; D.cfg.layouts = D.cfg.layouts.filter((l) => l.name !== n); D.ui.layoutSel = D.cfg.layouts[0].name; if (D.cfg.activeLayout === n) await act("setLayout", D.cfg.layouts[0].name); await cfgSave(); drawSheet(); },
  ruleToggle: async ({ layout, i }) => { const L = D.cfg.layouts.find((l) => l.name === layout); L.rules[i].on = !L.rules[i].on; await cfgSave(); drawSheet(); },
  ruleRemove: async ({ layout, i }) => { const L = D.cfg.layouts.find((l) => l.name === layout); L.rules.splice(i, 1); await cfgSave(); drawSheet(); },
  ruleAdd: async ({ layout, type }) => {
    const L = D.cfg.layouts.find((l) => l.name === layout);
    L.rules = L.rules || [];
    if (type === "fullscreen") L.rules.push({ type, on: true });
    if (type === "pc") L.rules.push({ type, host: D.host, on: true });
    if (type === "time") L.rules.push({ type, from: "09:00", to: "17:00", on: true });
    await cfgSave(); drawSheet();
  },
  applyTemplate: async (a) => { if (!H.arm("tpl:" + a.layout + ":" + a.template)) return; await act("applyTemplate", a); drawSheet(); toast("Layout reset to " + a.template); },
  // edit mode
  editDone: async () => { D.ui.editing = null; await cfgSave(); render(); toast("Saved"); },
  removeWidget: (id) => { const L = activeLayout(); L.widgets = L.widgets.filter((w) => w.id !== id); render(); },
  approveWidget: async (a) => { const r = await act("approveWidget", a); toast(r.toast || r.error); },
  openWidgetsFolder: () => act("openWidgetsFolder"),
  addWidget: (type) => {
    let opts = {};
    if (String(type).startsWith("custom:")) { opts = { name: type.slice(7) }; type = "custom"; }
    const L = activeLayout(); const def = W[type];
    const spot = findSpot(L, def.size[0], def.size[1]) || findSpot(L, 1, 1);
    if (!spot) { toast("No room. Remove or shrink a widget first"); return; }
    L.widgets.push({ id: type + "-" + Math.random().toString(36).slice(2, 7), type, x: spot.x, y: spot.y, w: spot.w, h: spot.h, opts: type === "keys" ? { set: "home" } : opts });
    closeSheet(); render();
  },
  // keys
  addKey: (set) => { D.ui.addKey.set = set; openSheet("addKey"); },
  addKeyTab: (t) => { D.ui.addKey.tab = t; drawSheet(); },
  // an app action that needs a detail (a meeting ID, a website, a game): read the boxes, then add the key
  pickAppAction: ({ cid, aid }) => {
    const c = (D.ui.connList || []).find((x) => x.id === cid), a = c && c.actions.find((x) => x.id === aid); if (!a) return;
    const params = {}; for (const p of a.params) { const el = document.getElementById("ap-" + cid + "-" + aid + "-" + p.name); const v = el ? String(el.value || "").trim() : ""; if (!v && !p.optional) { toast("Fill in: " + p.label); el && el.focus(); return; } if (v) params[p.name] = v; }
    const first = Object.values(params)[0] || "";
    H.pickKey({ label: (a.label.replace(/ \(.*\)$/, "") + (first && !/^(dark|light)$/.test(first) ? ": " + first : "")).slice(0, 40), sub: c.name, action: { type: "action", cid, aid, params }, glyph: "bolt" });
  },
  pickKey: async (k) => {
    const set = D.ui.addKey.set || "home";
    const key = Object.assign({ id: "k-" + Math.random().toString(36).slice(2, 8) }, k);
    D.cfg.keySets[set] = (D.cfg.keySets[set] || []).concat(key);
    await cfgSave(); closeSheet(); toast("Added " + key.label);
  },
  pickWeb: () => {
    let u = ($("#webUrl").value || "").trim(); const n = ($("#webName").value || "").trim();
    if (!u) { toast("Type a web address first"); return; }
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    H.pickKey({ label: n || u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0], sub: "Website", action: { type: "url", target: u }, glyph: "globe" });
  },
  browseFolder: async () => { const r = await act("pickFolder"); if (r.path) $("#folderPath").value = r.path; act("typing", true); },
  pickFolderKey: () => { const p = ($("#folderPath").value || "").trim(); if (!p) { toast("Pick a folder first"); return; } H.pickKey({ label: p.split(/[\\/]/).filter(Boolean).pop() || p, sub: "Folder", action: { type: "folder", target: p }, glyph: "folder" }); },
  pickAiTask: () => { const t = (($("#aiPrompt") || {}).value || "").trim(); if (!t) { toast("Say what the AI should do"); return; } H.pickKey({ label: (($("#aiName") || {}).value || "").trim() || t.slice(0, 24), sub: "AI task", action: { type: "ai-task", provider: "claude-code", prompt: t }, glyph: "claude" }); },
  removeKey: async ({ set, id }) => { D.cfg.keySets[set] = D.cfg.keySets[set].filter((k) => k.id !== id); await cfgSave(); render(); if (D.ui.sheet === "allKeys") drawSheet(); },
  // ask
  askMode: (m) => { D.ui.ask.mode = m; D.ui.ask.answer = ""; D.ui.ask.error = ""; if (m === "task") D.ui.ask.thread = null; drawSheet(); },
  askProvider: (p) => { D.ui.ask.provider = p; drawSheet(); },
  askDir: (d) => { D.ui.ask.dir = d; drawSheet(); },
  pickFolder: async () => { const r = await act("pickFolder"); if (r.path) { D.ui.ask.dir = r.path; } act("typing", true); drawSheet(); },
  askToTask: () => { const u = D.ui.ask; const th = u.thread && (D.ui.threadCache || {})[u.thread]; if (th && !u.text) { const q = th.messages.filter((m) => m.role === "you").map((m) => m.text); u.text = q.join("\n"); } u.mode = "task"; u.thread = null; u.answer = ""; drawSheet(); },
  askTaskMode: (m) => { D.ui.ask.taskMode = m; drawSheet(); },
  askSendTerminal: () => H.askSend(true),
  askSend: async (terminal) => {
    const u = D.ui.ask; const t = ($("#askText") || {}).value || u.text;
    u.text = t;
    if (!t.trim()) { toast("Type or say something first"); return; }
    // a follow-up in the chat that's already showing
    if (u.thread && u.mode === "quick") {
      const r = await act("threadFollow", { id: u.thread, text: t });
      if (r && r.error) { toast(r.error); return; }
      u.text = ""; D.ui.stick = true; await loadThread(u.thread); drawSheet(); return;
    }
    const p = D.providers.find((x) => x.id === u.provider);
    if (!p) return;
    if (u.mode === "task") {
      const r = await act("task", { provider: p.id, prompt: t, dir: u.dir, mode: u.taskMode, terminal: terminal === true });
      if (r && r.thread) { u.text = ""; H.openThread(r.thread); return; }
      toast(r.toast || (r.ok ? "Started" : r.error)); if (r.ok) { u.text = ""; closeSheet(); } return;
    }
    if (p.kind === "web") { const r = await act("ask", { provider: p.id, question: t }); toast(r.toast || r.error); closeSheet(); return; }
    u.busy = true; u.answer = ""; u.error = ""; drawSheet();
    const r = await act("ask", { provider: p.id, question: t });
    u.busy = false;
    if (r && r.thread) { u.thread = r.thread; u.text = ""; D.ui.stick = true; await loadThread(r.thread); if (D.ui.sheet === "ask") drawSheet(); return; }
    if (r.error) u.error = r.error; else u.answer = (r.text || "").trim() + (r.seconds ? "\n\n(" + r.seconds + " s)" : "");
    if (D.ui.sheet === "ask") drawSheet();
  },
  voice: async () => Voice.toggle(),
  // settings
  setFlag: async (k) => { D.cfg[k] = !D.cfg[k]; await cfgSave({ [k]: D.cfg[k] }); drawSheet(); render(); },
  setMore: () => { D.ui.setMore = !D.ui.setMore; drawSheet(); },
  setSpeak: async (v) => { const o = { replyHome: v === "never" ? "read" : "listen", replyWork: v === "always" ? "listen" : "read" }; Object.assign(D.cfg, o); await cfgSave(o); drawSheet(); },
  setVal: async ({ key, val }) => { D.cfg[key] = val; await cfgSave({ [key]: val }); drawSheet(); render(); },
  rediscover: async () => { toast("Looking around this PC..."); await act("rediscover"); D.ui.apps = null; toast("Done"); },
  moveToDisplay: async (id) => { await act("moveToDisplay", id); },
  quit: () => act("quit"),
  buildWidget: async () => {
    const t = ($("#buildText") || {}).value || "";
    if (!t.trim()) { toast("Describe the widget first"); return; }
    const r = await act("buildWidget", t);
    if (r && r.thread) { H.openThread(r.thread); return; }
    toast(r.error || "Couldn't start");
  },
  // setup
  setupTemplate: (t) => { D.ui.setup.template = t; drawSheet(); },
  setupBack: () => { D.ui.setup.step--; drawSheet(); },
  setupNext: async () => {
    const u = D.ui.setup;
    if (u.step < 3) { u.step++; drawSheet(); return; }
    await act("finishSetup", { template: u.template });
    D.cfg.setupDone = true; D.ui.sheet = null; $("#layer").innerHTML = ""; toast("All set. Hold any widget to change it");
  }
};
const BUILD_PROMPT = (desc) => `Build a widget for my Side Panel app. What I want: ${desc}

Widget format: create a folder <short-name> in the current folder (the Side Panel widgets folder). Read README.txt here first. The folder needs:
- widget.json: {"title": "...", "command": "<command that prints the widget text>", "interval": <seconds, at least 10>}
- the script the command runs.
The command must print up to 4 short lines of plain text (the first line is shown biggest). Keep it read-only unless I asked for an action. Test the command once and show me its output.`;

// A pasted or dropped link becomes a playlist: Spotify, YouTube Music, YouTube or any https page.
function playlistFrom(url, name) {
  url = String(url || "").trim();
  if (!/^(https:\/\/|spotify:)/i.test(url) || url.length > 1000) return null;
  const kind = /spotify/i.test(url) ? "spotify" : /youtube\.com|youtu\.be/i.test(url) ? "youtube" : "web";
  const kindLabel = kind === "spotify" ? "Spotify" : /music\.youtube/i.test(url) ? "YouTube Music" : kind === "youtube" ? "YouTube" : url.replace(/^https:\/\/(www\.)?/i, "").split("/")[0];
  const what = (url.match(/(playlist|album|artist|show)/i) || [])[1];
  return { id: "pl-" + Math.random().toString(36).slice(2, 8), url, kind, kindLabel, label: (name || (kindLabel + (what ? " " + what.toLowerCase() : " playlist"))).slice(0, 40) };
}

function findSpot(L, w, h) {
  const taken = new Set();
  L.widgets.forEach((x) => { for (let i = x.x; i < x.x + x.w; i++) for (let j = x.y; j < x.y + x.h; j++) taken.add(i + "," + j); });
  for (const [ww, hh] of [[w, h], [Math.min(w, 2), Math.min(h, 2)], [1, 1]]) {
    for (let y = 1; y <= 5 - hh; y++) for (let x = 1; x <= 7 - ww; x++) {
      let ok = true;
      for (let i = x; i < x + ww && ok; i++) for (let j = y; j < y + hh && ok; j++) if (taken.has(i + "," + j)) ok = false;
      if (ok) return { x, y, w: ww, h: hh };
    }
  }
  return null;
}

// ---------- hold to edit, drag to move, corner to resize ----------
let holdTimer = null, holdStart = null;
document.addEventListener("pointerdown", (e) => {
  const grid = $("#grid"); if (!grid || D.ui.sheet) return;
  const wEl = e.target.closest(".w");
  if (!D.ui.editing) {
    if (!wEl) return;
    holdStart = { x: e.clientX, y: e.clientY };
    holdTimer = setTimeout(() => { D.ui.editing = D.cfg.activeLayout; suppressClick = true; render(); toast("Editing. Drag widgets, tap Done when finished"); }, 650);
    return;
  }
  if (e.target.closest(".wx") || e.target.closest("[data-act]")) return;
  const rz = e.target.closest("[data-resize]");
  if (!wEl) return;
  const L = activeLayout();
  const w = L.widgets.find((x) => x.id === wEl.dataset.wid); if (!w) return;
  e.preventDefault();
  dragging = true;
  const rect = grid.getBoundingClientRect();
  const cs = getComputedStyle(grid);
  const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight), padB = parseFloat(cs.paddingBottom);
  const cw = (rect.width - padL - padR) / 6, ch = (rect.height - padB) / 4;
  const cell = (ev) => ({ cx: Math.floor((ev.clientX - rect.left - padL) / cw) + 1, cy: Math.floor((ev.clientY - rect.top) / ch) + 1 });
  const start = cell(e);
  const orig = { x: w.x, y: w.y, w: w.w, h: w.h };
  const ghost = document.createElement("div"); ghost.className = "ghost"; grid.appendChild(ghost);
  wEl.classList.add("drag");
  let target = Object.assign({}, orig);
  const place = () => { ghost.style.gridColumn = `${target.x} / span ${target.w}`; ghost.style.gridRow = `${target.y} / span ${target.h}`; };
  place();
  const move = (ev) => {
    const c = cell(ev);
    if (rz) { target.w = Math.max(1, Math.min(7 - orig.x, orig.w + c.cx - start.cx)); target.h = Math.max(1, Math.min(5 - orig.y, orig.h + c.cy - start.cy)); }
    else { target.x = Math.max(1, Math.min(7 - orig.w, orig.x + c.cx - start.cx)); target.y = Math.max(1, Math.min(5 - orig.h, orig.y + c.cy - start.cy)); }
    place();
  };
  const up = () => {
    document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
    dragging = false;
    const clash = L.widgets.some((o) => o.id !== w.id && o.x < target.x + target.w && target.x < o.x + o.w && o.y < target.y + target.h && target.y < o.y + o.h);
    if (clash) toast("That space is taken. Move or remove the other widget first");
    else Object.assign(w, target);
    render();
  };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
});
document.addEventListener("pointermove", (e) => { if (holdTimer && holdStart && Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > 12) { clearTimeout(holdTimer); holdTimer = null; } });
document.addEventListener("pointerup", () => { clearTimeout(holdTimer); holdTimer = null; });

// ---------- mouse and keyboard ----------
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (D.ui.sheet || D.ui.editing) return;
  if (e.target.closest(".w")) { D.ui.editing = D.cfg.activeLayout; render(); toast("Editing. Drag widgets, tap Done when finished"); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (D.ui.sheet) closeSheet(); else if (D.ui.editing) H.editDone(); }
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && D.ui.sheet === "ask") H.askSend();
});
document.addEventListener("wheel", (e) => {
  const w = e.target.closest(".w"); if (!w || D.ui.editing) return;
  const id = w.dataset.wid; const L = activeLayout(); const def = L.widgets.find((x) => x.id === id);
  if (!def || !["music", "sound"].includes(def.type)) return;
  e.preventDefault();
  H.volStep(e.deltaY < 0 ? 2 : -2);
}, { passive: false });

// ---------- drop an app, file, folder or link from the main screen to make a key ----------
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  const set = (activeLayout().widgets.find((w) => w.type === "keys") || { opts: { set: "home" } }).opts.set || "home";
  D.ui.addKey.set = set;
  const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    for (const f of e.dataTransfer.files) {
      const p = window.panel.pathFor(f);
      if (!p) continue;
      await H.pickKey({ label: f.name.replace(/\.(lnk|url|exe)$/i, ""), action: { type: "open", target: p }, iconFrom: p });
    }
  } else if (D.ui.sheet === "music" || /open\.spotify\.com\/(intl-[a-z]+\/)?(playlist|album|artist|show)|youtube\.com\/playlist|music\.youtube\.com\/(playlist|browse)/i.test(url.trim())) {
    const p = playlistFrom(url.trim().split(/\r?\n/)[0]);
    if (!p) { toast("That link can't be a playlist"); return; }
    D.cfg.playlists = (D.cfg.playlists || []).concat(p).slice(0, 24);
    await cfgSave({ playlists: D.cfg.playlists }); toast("Added " + p.label + " to your playlists"); if (D.ui.sheet === "music") drawSheet(); render();
  } else if (/^https?:/i.test(url)) {
    await H.pickKey({ label: url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0], sub: "Website", action: { type: "url", target: url.trim() }, glyph: "globe" });
  }
});

// ---------- voice ----------
const Voice = {
  rec: null, chunks: [],
  async toggle() {
    const u = D.ui.ask;
    if (!D.voice) { toast("No speech-to-text here. Click in the box and press Windows key + H"); const t = $("#askText"); if (t) t.focus(); return; }
    if (u.recording) { this.rec && this.rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      this.rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      this.rec.ondataavailable = (ev) => this.chunks.push(ev.data);
      this.rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        u.recording = false; u.busy = true; drawSheet();
        const buf = new Uint8Array(await new Blob(this.chunks).arrayBuffer());
        const r = await act("voice", buf);
        u.busy = false;
        if (r.text) u.text = (u.text ? u.text + " " : "") + r.text; else toast(r.error);
        drawSheet();
      };
      this.rec.start(); u.recording = true; drawSheet();
    } catch (e) { toast("Couldn't use the microphone: " + e.message); }
  }
};

// ---------- Crab Stack ----------
const Game = {
  raf: 0,
  mount() {
    this.best = Number(localStorage.getItem("crabBest") || 0);
    this.reset();
    const area = $("#gArea");
    area.addEventListener("pointerdown", (e) => { e.preventDefault(); this.drop(); });
    const loop = () => { this.step(); this.draw(); this.raf = requestAnimationFrame(loop); };
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(loop);
  },
  stop() { cancelAnimationFrame(this.raf); },
  reset() { this.W = Math.min(920, ($("#gArea") || { clientWidth: 920 }).clientWidth); const w0 = this.W / 3; this.layers = [{ x: (this.W - w0) / 2, w: w0 }]; this.cur = { x: 0, w: w0, dir: 1 }; this.speed = 4; this.score = 0; this.over = false; },
  step() { if (this.over) return; const c = this.cur; c.x += c.dir * this.speed; if (c.x < 0) { c.x = 0; c.dir = 1; } if (c.x + c.w > this.W) { c.x = this.W - c.w; c.dir = -1; } },
  drop() {
    if (this.over) { this.reset(); return; }
    const top = this.layers[this.layers.length - 1], c = this.cur;
    const l = Math.max(top.x, c.x), r = Math.min(top.x + top.w, c.x + c.w);
    if (r - l < 4) { this.over = true; if (this.score > this.best) { this.best = this.score; localStorage.setItem("crabBest", this.best); } return; }
    const perfect = Math.abs(c.x - top.x) < 4;
    const nl = perfect ? { x: top.x, w: top.w } : { x: l, w: r - l };
    this.layers.push(nl); this.score++; this.cur = { x: 0, w: nl.w, dir: 1 }; this.speed = Math.min(14, this.speed + 0.45);
  },
  draw() {
    const st = $("#gStack"); if (!st) return;
    const area = $("#gArea"); const H2 = area.clientHeight; const per = 40; const maxVis = Math.max(4, Math.floor(H2 / per) - 3);
    const vis = this.layers.slice(-maxVis);
    let h = vis.map((b, i) => `<div class="crate" style="left:${b.x}px;width:${b.w}px;bottom:${i * per}px;background:${(this.layers.length - vis.length + i) % 2 ? "#9C6B45" : "#7A5236"}"></div>`).join("");
    const n = vis.length;
    if (!this.over) h += `<div class="crate" style="left:${this.cur.x}px;width:${this.cur.w}px;bottom:${n * per}px;background:#B07A4F"></div><div style="position:absolute;left:${this.cur.x + this.cur.w / 2 - 36}px;bottom:${n * per + 38}px">${companion(D.cfg.companion === "none" ? "pip" : D.cfg.companion, 72, "working")}</div>`;
    st.innerHTML = h;
    $("#gScore").textContent = this.score; $("#gBest").textContent = this.best;
    const msg = $("#gMsg"); msg.classList.toggle("hide", !this.over); if (this.over) msg.textContent = "Fell off at " + this.score + ". Tap to play again.";
    // pause the game when something needs you
    if ((D.attention || []).some((x) => x.urgent) && !this.over && !this.paused) { this.paused = true; this.over = true; msg.textContent = "Paused: something needs you. Tap to play again."; msg.classList.remove("hide"); closeSheet(); }
  }
};
