// Mini panel v2: follows the layout you're in (Work shows Focus and your next meeting, Gaming shows game stats),
// fits whatever size you drag it to, and you can pick what it shows. Replaces miniHTML from app.js.
const MINI_PARTS = [["ai", "AI"], ["music", "Music"], ["focus", "Focus"], ["meeting", "Meeting"], ["game", "Game stats"], ["keys", "Keys"]];
function miniParts() {
  const c = D.cfg;
  if (Array.isArray(c.miniParts) && c.miniParts.length && c.miniFollow === false) return c.miniParts;
  // follow the layout: show what its widgets show, in a sensible order
  const L = activeLayout(); const t = new Set(L.widgets.map((w) => w.type));
  const out = [];
  if (t.has("ai") || t.has("aitoday") || t.has("ask")) out.push("ai");
  if (t.has("focus")) out.push("focus");
  if (t.has("meeting")) out.push("meeting");
  if (t.has("gamestats")) out.push("game");
  if (t.has("music") || t.has("playlists")) out.push("music");
  out.push("keys");
  return out;
}
function focusLeft() { const f = D.ui.focus; return Math.max(0, f.running ? (f.end - Date.now()) / 1000 : f.left); }

function miniHTML() {
  const W0 = window.innerWidth, H0 = window.innerHeight;
  const c = D.claude || { sessions: [], approvals: [] };
  const ss = c.sessions.filter((s) => s.state !== "ended" && !(s.state === "done" && Date.now() - s.updated > 6 * 3600000));
  const need = ss.filter((s) => s.state === "waiting").length, run = ss.filter((s) => s.state === "working").length;
  const ap = (c.approvals || [])[0];
  const L = activeLayout();
  const face = companion(D.cfg.companion === "none" ? "pip" : D.cfg.companion, 34, ap || need ? "asking" : run ? "working" : "idle");
  // header: the mode you're in (tap to switch), Ask, expand
  const layouts = D.ui.miniLayouts ? `<div class="mlays">${D.cfg.layouts.map((x) => `<button class="btn sm${x.name === L.name ? " go" : ""}" ${A("miniLayout", x.name)}>${esc(x.name)}</button>`).join("")}<button class="btn sm" ${A("miniCustomize")}>${svg("gear", 16)}Customize</button></div>` : "";
  const head = `<div class="mhead">${face}<button class="mmode" ${A("miniLayouts")} aria-label="Switch mode">${esc(L.name)}${svg("chev", 14)}</button><span style="flex:1 1 auto"></span><button class="ic sm${D.ui.miniAsk ? " on" : ""}" ${A("miniAsk")} aria-label="Ask the AI">${svg("chat", 18)}</button><button class="ic sm" ${A("expand")} aria-label="Open the full panel">${svg("expand", 18)}</button></div>`;
  const parts = [];
  let room = H0 - 44 - 20 - (layouts ? 52 : 0);
  const add = (html, h) => { if (room >= h) { parts.push(html); room -= h + 8; return true; } return false; };
  // asking the AI, right here
  if (D.ui.miniAsk && typeof cmdBarHTML === "function") return `<div class="minip">${head}<div class="mcmd">${cmdBarHTML(true)}</div></div>`;
  if (D.ui.miniAsk) {
    const th = D.ui.ask.thread && (D.ui.threadCache || {})[D.ui.ask.thread];
    const ans = th ? lastAnswer(th) : "";
    const busy = th && th.state === "running";
    const box = `<div class="mask"><input type="text" id="miniText" placeholder="${th ? "Ask a follow-up" : "Ask anything"}" value="${esc(D.ui.ask.text || "")}"><button class="ic sm" ${A("voice")} aria-label="Talk">${svg("mic", 18)}</button><button class="btn sm go" ${A("miniSend")}${busy ? " disabled" : ""}>Ask</button></div>`;
    const answerH = Math.max(0, room - 52 - 52);
    const out = th ? `<div class="mans" style="max-height:${Math.max(44, answerH)}px">${busy && !ans ? `<span class="m"><span class="spin">◌</span> ${esc(th.now || "Thinking")}</span>` : `<div class="msg ai">${md(ans || "")}</div>`}<div class="mansb">${ans ? `<button class="btn sm" ${A("copy", ans)}>Copy</button>` : ""}<button class="btn sm" ${A("openThread", th.id)}>Open</button><button class="btn sm" ${A("miniNew")}>New</button></div></div>` : `<div class="m" style="font-size:13px">Quick answers, read-only. Open for tasks and the full chat.</div>`;
    return `<div class="minip">${head}${box}${out}</div>`;
  }
  // an approval always comes first
  if (ap) add(`<div class="mrow need"><div style="min-width:0;flex:1 1 auto"><b class="ell" style="display:block">${esc(ap.what)}</b><span class="ell m mono" style="display:block">${esc(ap.detail || "")}</span></div>${ap.source === "panel" || ap.source === "app" || D.cfg.approvalsFromPanel ? `<button class="btn sm go" ${A("approve", { id: ap.id, decision: "allow" })}>Allow</button><button class="btn sm" ${A("approve", { id: ap.id, decision: "deny" })}>No</button>` : `<button class="btn sm" ${A("approve", { id: ap.id, decision: null })}>Terminal</button>`}</div>`, 56);
  for (const p of miniParts()) {
    if (p === "ai" && !ap) {
      const rows = ss.slice(0, room > 120 ? 2 : 1);
      add(`<button class="mrow plain" ${A("sheet", "sessions")}><span style="min-width:0;flex:1 1 auto">${rows.map((s) => `<span class="ell" style="display:block"><span class="dot" style="background:${(STATE[s.state] || ["var(--mute)"])[0]}"></span> <b>${esc(s.project)}</b> <span class="m">${esc((STATE[s.state] || ["", s.state])[1])}</span></span>`).join("") || `<span class="m">${need ? need + " waiting for you" : "No AI running. Tap Ask to start."}</span>`}</span></button>`, rows.length > 1 ? 56 : 44);
    }
    if (p === "focus") {
      const f = D.ui.focus;
      add(`<div class="mrow">${svg("timer", 20)}<span class="n" data-focusleft style="font-size:24px;flex:1 1 auto">${mmss(focusLeft())}</span>${f.running ? `<button class="btn sm" ${A("focus", "pause")}>Pause</button>` : `<button class="btn sm go" ${A("focus", "start")}>Start focus</button>`}<button class="btn sm" ${A("focus", "reset")} aria-label="Reset">Reset</button></div>`, 52);
    }
    if (p === "meeting") {
      const ms = (D.live.meeting && D.live.meeting.meetings) || [];
      const m = ms.find((x) => new Date(x.end) > Date.now());
      if (m) {
        const mins = Math.round((new Date(m.start) - Date.now()) / 60000);
        const when = mins > 59 ? Math.floor(mins / 60) + " h " + (mins % 60) + " m" : mins > 0 ? "in " + mins + " min" : "Now";
        add(`<div class="mrow">${svg("people", 20)}<span style="min-width:0;flex:1 1 auto"><b class="ell" style="display:block">${esc(D.cfg.hideMeetingTitles ? "Busy" : m.subject)}</b><span class="m" style="font-size:12px">${when}</span></span>${m.join ? `<button class="btn sm go" ${A("openUrl", m.join)}>Join</button>` : ""}</div>`, 52);
      }
    }
    if (p === "game") {
      const st = D.live.stats || {}, g = st.gpu;
      add(`<div class="mrow">${svg("game", 20)}<span style="flex:1 1 auto;display:flex;gap:14px;font-size:13px" class="m">${g ? `<span>GPU <b class="n" style="font-size:18px;color:var(--ink)">${g.util}%</b></span><span><b class="n" style="font-size:18px;color:${g.temp >= 83 ? "var(--wait)" : "var(--ink)"}">${g.temp}&#176;</b></span>` : ""}<span>CPU <b class="n" style="font-size:18px;color:var(--ink)">${st.cpu ?? "-"}%</b></span>${D.live.inGame && D.live.gameSince ? `<span>${Math.floor((Date.now() - D.live.gameSince) / 60000)} min</span>` : ""}</span></div>`, 44);
    }
    if (p === "music") {
      const cur = curMedia(D);
      if (cur) {
        const art = imgSrc(cur.art);
        add(`<div class="mrow"><button class="plain" style="display:flex;gap:10px;align-items:center;min-width:0;flex:1 1 auto" ${A("musicOpen", "")}>${art ? `<img src="${art}" style="width:40px;height:40px;border-radius:6px;object-fit:cover" alt="">` : svg("music", 22)}<span style="min-width:0"><b class="ell" style="display:block">${esc(cur.title || "")}</b><span class="ell m" style="display:block;font-size:12px">${esc(cur.artist || cur.name)}</span></span></button>${W0 >= 380 ? `<button class="ic sm" ${A("media", { action: "prev", app: cur.app })} aria-label="Previous">${svg("prev", 18)}</button>` : ""}<button class="ic sm" style="${ap ? "box-shadow:inset 0 0 0 2px var(--ink)" : "background:var(--ink);color:var(--bg)"}" ${A("media", { action: "toggle", app: cur.app })} aria-label="Play or pause">${svg(cur.playing ? "pause" : "pp", 18, 2.2)}</button><button class="ic sm" ${A("media", { action: "next", app: cur.app })} aria-label="Next">${svg("next", 18)}</button>${cur.dur > 0 ? `<span class="mprog"><i data-prog></i></span>` : ""}</div>`, 56);
      }
    }
    if (p === "keys") {
      const kw = L.widgets.find((w) => w.type === "keys");
      const all = (kw && D.cfg.keySets[(kw.opts && kw.opts.set) || "home"]) || D.cfg.keySets.home || [];
      const cols = Math.max(3, Math.floor((W0 - 24) / 74));
      const rows = Math.max(0, Math.min(3, Math.floor((room + 8) / 68)));
      const keys = all.slice(0, cols * rows);
      if (keys.length) { parts.push(`<div class="mkeys" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${keys.map((k) => `<button class="mk" ${A("key", k.id)} title="${esc(k.label)}">${imgSrc(k.icon) ? `<img src="${imgSrc(k.icon)}" alt="">` : svg(k.glyph || "bolt", 22)}<span>${esc(k.label)}</span></button>`).join("")}</div>`); room -= rows * 68; }
    }
  }
  return `<div class="minip${ap || need ? " needs" : ""}">${head}${layouts}${parts.join("")}<span class="mgrip" aria-hidden="true"></span></div>`;
}

document.addEventListener("keydown", (e) => { if (e.target && e.target.id === "miniText" && e.key === "Enter") { e.preventDefault(); H.miniSend(); } });
// the focus timer ticks every second in the mini panel without a full redraw
setInterval(() => { const el = document.querySelector("[data-focusleft]"); if (el) el.textContent = mmss(focusLeft()); }, 1000);
// resizing the mini panel redraws it to fit
let miniResizeT = null;
window.addEventListener("resize", () => { if (!D.mini) return; clearTimeout(miniResizeT); miniResizeT = setTimeout(() => { lastAppHTML = ""; render(); }, 60); });

// play and pause answer at once; Windows catches up a moment later
const mediaAct = H.media;
H.media = async (a) => {
  const cur = ((D.live.media && D.live.media.sessions) || []).find((s) => s.app === a.app) || curMedia(D);
  if (cur && (a.action === "toggle" || a.action === "play" || a.action === "pause")) {
    cur.playing = a.action === "toggle" ? !cur.playing : a.action === "play";
    D.ui.mediaHold = { app: cur.app, playing: cur.playing, until: Date.now() + 2500 };
    lastAppHTML = ""; render(); if (D.ui.sheet === "music") drawSheet();
  }
  return mediaAct(a);
};
// keep that answer on screen until Windows reports the same (or 2.5 s pass)
window.panel.onTick((data) => {
  const h = D.ui.mediaHold;
  if (!h || Date.now() > h.until) return;
  const s = ((D.live.media && D.live.media.sessions) || []).find((x) => x.app === h.app);
  if (s && s.playing !== h.playing) { s.playing = h.playing; lastAppHTML = ""; render(); } else if (s) D.ui.mediaHold = null;
});

Object.assign(H, {
  miniAsk: () => { D.ui.miniAsk = !D.ui.miniAsk; D.ui.miniLayouts = false; lastAppHTML = ""; render(); if (D.ui.miniAsk) setTimeout(() => { const t = $("#cmdText") || $("#miniText"); if (t) { act("typing", true); t.focus(); } }, 60); else act("typing", false); },
  miniNew: () => { D.ui.ask.thread = null; D.ui.ask.text = ""; lastAppHTML = ""; render(); setTimeout(() => { const t = $("#cmdText") || $("#miniText"); if (t) t.focus(); }, 60); },
  miniSend: async () => {
    const el = $("#miniText"); const q = ((el && el.value) || D.ui.ask.text || "").trim();
    if (!q) { toast("Type or say something first"); return; }
    const u = D.ui.ask; u.text = "";
    const cc = D.providers.find((p) => p.id === "claude-code") || D.providers.find((p) => p.id === "codex");
    if (!cc) { const r = await act("ask", { provider: "claude-web", question: q }); toast(r.toast || r.error || "Opened in your browser"); return; }
    const r = u.thread ? await act("threadFollow", { id: u.thread, text: q }) : await act("ask", { provider: cc.id, question: q });
    if (r && r.thread) u.thread = r.thread;
    if (r && r.error) { toast(r.error); return; }
    await loadThread(u.thread); lastAppHTML = ""; render();
  },
  miniLayouts: () => { D.ui.miniLayouts = !D.ui.miniLayouts; lastAppHTML = ""; render(); },
  miniLayout: async (name) => { D.ui.miniLayouts = false; await act("setLayout", name); D.cfg.activeLayout = name; lastAppHTML = ""; render(); },
  miniCustomize: () => { D.ui.miniLayouts = false; openSheet("settings"); },
  miniPart: async (p) => {
    const cur = miniParts();
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : MINI_PARTS.map((x) => x[0]).filter((x) => x === p || cur.includes(x));
    D.cfg.miniParts = next; D.cfg.miniFollow = false;
    await act("saveSettings", { miniParts: next, miniFollow: false }); drawSheet();
  },
  miniFollow: async () => { D.cfg.miniFollow = D.cfg.miniFollow === false; await act("saveSettings", { miniFollow: D.cfg.miniFollow }); drawSheet(); }
});
