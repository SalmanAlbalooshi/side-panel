// Widgets. Each one: a title line, the main thing, one main action. Clicks are wired with data-act.
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const A = (act, arg) => `data-act="${act}"${arg !== undefined ? ` data-arg='${esc(JSON.stringify(arg))}'` : ""}`;
const wt = (icon, t, r) => `<div class="wt">${icon ? svg(icon, 18) : ""}<span>${t}</span>${r ? `<span class="r">${r}</span>` : ""}</div>`;
const pad = (n) => String(n).padStart(2, "0");
function ago(t) { const s = Math.round((Date.now() - t) / 1000); if (s < 60) return "now"; const m = Math.round(s / 60); if (m < 60) return m + " min"; const h = Math.round(m / 60); if (h < 48) return h + " h"; const d = Math.round(h / 24); return d + (d === 1 ? " day" : " days"); }
function mmss(sec) { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ":" + pad(sec % 60); }

// Only image data the panel made itself may become an <img> source.
const imgSrc = (u) => (/^data:image\/(png|jpeg|bmp|x-icon);base64,[A-Za-z0-9+/=]+$/.test(String(u || "")) ? u : "");
// notes: open ones first (with their due time), then the ones you ticked in the last hour
function notesOpen(D) { return (D.cfg.notes || []).filter((n) => !n.done); }
function notesHTML(D, max) {
  const recent = (D.cfg.notes || []).filter((n) => n.done && Date.now() - n.doneAt < 3600000);
  const list = notesOpen(D).concat(recent).slice(0, max);
  if (!list.length) return `<div class="empty">Nothing on your list. Say or type "note: ..." to add something.</div>`;
  return `<div class="notes">${list.map((n) => `<div class="note${n.done ? " done" : ""}"><button class="ntick" ${A("noteToggle", n.id)} aria-label="${n.done ? "Not done" : "Done"}">${n.done ? svg("check", 16, 3) : ""}</button><span class="nt" dir="auto">${esc(n.text)}${n.due ? `<span class="nd">by ${esc(n.due)}</span>` : ""}</span>${n.done ? `<button class="plain ndel" ${A("noteDel", n.id)} aria-label="Remove">${svg("x", 14)}</button>` : ""}</div>`).join("")}</div>`;
}
function curMedia(D) { const ss = (D.live.media && D.live.media.sessions) || []; return ss.find((x) => x.app === D.mediaApp) || ss.find((x) => x.current) || ss.find((x) => x.playing) || ss[0] || null; }
// today's quote, or another one after a tap
function quoteNow(D) { const all = D.quotes && D.quotes.length ? D.quotes : [D.quote || ["", ""]]; const i0 = Math.max(0, all.findIndex((x) => D.quote && x[0] === D.quote[0])); return all[(i0 + (D.ui.quoteSkip || 0)) % all.length]; }
function prettyProc(n) { n = String(n || "").replace(/-Win64-Shipping|-Win64|\.exe$/i, ""); return n.charAt(0).toUpperCase() + n.slice(1); }
// Claude's own usage limits, as last reported to the panel (only when the panel itself has run Claude recently).
function limitLine(L) {
  if (!L || !L.at || Date.now() - L.at > 6 * 3600000) return null;
  const win = L.five_hour || L.seven_day || Object.values(L).find((x) => x && x.unifiedWindows);
  const uw = (win && win.unifiedWindows) || {};
  const pick = uw.five_hour || uw.seven_day || null;
  if (!pick || pick.utilization == null) return null;
  const pct = Math.round(pick.utilization * 100), which = uw.five_hour ? "5-hour" : "weekly";
  const reset = pick.resetsAt ? new Date(pick.resetsAt * 1000) : null;
  const when = reset ? (reset - Date.now() < 86400000 ? reset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : reset.toLocaleDateString([], { weekday: "short" })) : "";
  const col = pct >= 90 ? "var(--bad)" : pct >= 70 ? "var(--wait)" : "var(--ok)";
  return { short: pct + "% of " + which + " limit", bar: `<div style="display:flex;align-items:center;gap:10px;font-size:13px"><span class="m" style="white-space:nowrap">Claude ${which} limit</span><span class="bar"><i style="width:${pct}%;background:${col}"></i></span><span class="n" style="font-size:16px">${pct}%</span>${when ? `<span class="m" style="white-space:nowrap">resets ${when}</span>` : ""}</div>` };
}
const STATE = {
  failed: ["var(--bad)", "Failed"], working: ["var(--live)", "Working"], quiet: ["var(--mute)", "Quiet"], idle: ["var(--mute)", "Stopped"], done: ["var(--ok)", "Done"], waiting: ["var(--wait)", "Needs you"], yourturn: ["var(--ok)", "Your turn"], ended: ["var(--mute)", "Closed"]
};
function crabState(sessions, held) {
  if (held) return "sleeping";
  if (sessions.some((s) => s.state === "waiting")) return "asking";
  if (sessions.some((s) => s.state === "failed" && Date.now() - s.updated < 10 * 60000)) return "failed";
  if (sessions.some((s) => s.state === "working")) return "working";
  if (sessions.some((s) => s.state === "yourturn")) return "done";
  return "idle";
}

function keyHTML(k, opts) {
  const D = window.D;
  let sub = k.sub || "", lit = false, glyph = k.glyph, label = k.label;
  if (k.live === "mic" && D.live.mic) { lit = !!D.live.mic.muted; glyph = lit ? "micoff" : "mic"; sub = lit ? "Muted. Tap to talk" : "On"; label = lit ? "Mic muted" : "Mic"; }
  if (k.live === "mute" && D.live.audio) { lit = !!D.live.audio.muted; sub = lit ? "Sound off" : "Sound on"; }

  const pic = imgSrc(k.icon) ? `<img src="${imgSrc(k.icon)}" alt="">` : svg(glyph || "bolt", 28);
  const x = opts && opts.edit ? `<span class="x" ${A("removeKey", { set: opts.set, id: k.id })}>${svg("x", 14, 2.6)}</span>` : "";
  return `<button class="k${lit ? " lit" : ""}" ${opts && opts.edit ? A("editKey", { set: opts.set, id: k.id }) : A("key", k.id)} title="${esc(label)}">${pic}<span><span class="l">${esc(label)}</span>${sub ? `<span class="i">${esc(sub)}</span>` : ""}</span>${x}</button>`;
}

const W = {
  clock: {
    title: "Clock", icon: "timer", size: [1, 1],
    render(w) {
      const d = new Date();
      const big = w.h >= 2 ? 96 : 52;
      const D = window.D, q = D.cfg.quotes !== false && D.cfg.quoteInClock !== false && (w.w >= 2 || w.h >= 2) && !(activeLayout().widgets.some((x) => x.type === "quote")) ? quoteNow(D) : null;
      return `${wt("", d.toLocaleDateString(undefined, { weekday: "long" }))}<span class="n" style="font-size:${big}px;line-height:.9">${pad(d.getHours())}:${pad(d.getMinutes())}</span><span class="m" style="font-size:14px">${d.toLocaleDateString(undefined, { day: "numeric", month: "long" })}</span>${q ? `<button class="plain cq" ${A("nextQuote")}><span>${esc(q[0])}</span><span class="m">${esc(q[1])}</span></button>` : ""}`;
    }
  },
  pc: {
    title: "This PC", icon: "cpu", size: [1, 1],
    render(w, D) {
      const s = D.live.stats || {}, g = s.gpu;
      const c = (D.live.disks || []).find((x) => x.drive === "C:");
      return `${wt("cpu", "This PC")}<div class="stat">CPU <b>${s.cpu ?? "-"}%</b></div>${g ? `<div class="stat">GPU <b>${g.temp}&#176;</b></div>` : ""}<div class="stat">RAM <b>${s.ramUsedGB ?? "-"} GB</b></div>${w.h >= 2 && c ? `<div class="stat">C: <b>${c.freeGB} GB</b> free</div>` : ""}`;
    }
  },
  keys: {
    title: "Keys", icon: "layers", size: [4, 2],
    render(w, D) {
      const set = w.opts.set || "home";
      const keys = (D.cfg.keySets[set] || []);
      const edit = D.ui.editing;
      const area = w.w * w.h;
      const cols = w.opts.big ? Math.max(2, Math.min(3, w.w)) : Math.max(2, Math.min(6, Math.round(w.w * 1.5)));
      const suggest = w.opts.suggest && !edit && D.suggested && D.suggested.length;
      const rowsAvail = w.opts.big ? Math.max(1, w.h) : Math.max(1, Math.round(w.h * 1.5));
      const max = cols * rowsAvail - (suggest ? cols : 0) - (edit ? 1 : 0);
      // pages: swipe on touch, arrows or the mouse wheel with a mouse
      const per = Math.max(1, max);
      const items = keys.length + (edit ? 1 : 0);
      const pages = Math.max(1, Math.ceil(items / per));
      const kp = D.ui.keyPage = D.ui.keyPage || {};
      const page = kp[w.id] = Math.max(0, Math.min(pages - 1, kp[w.id] || 0));
      const shown = keys.slice(page * per, page * per + per);
      const addHere = edit && page === pages - 1 && shown.length < per;
      const nav = pages > 1 ? `<span class="kpn"><button class="ic sm" ${A("keyPage", { id: w.id, d: -1 })} aria-label="Previous keys"${page === 0 ? " disabled" : ""}>${svg("chevl", 18, 2.2)}</button><span class="dots">${Array.from({ length: pages }, (_, i) => `<i class="${i === page ? "on" : ""}"></i>`).join("")}</span><button class="ic sm" ${A("keyPage", { id: w.id, d: 1 })} aria-label="More keys"${page === pages - 1 ? " disabled" : ""}>${svg("chev", 18, 2.2)}</button></span>` : "";
      let h = `<div class="wt"><span>Keys</span>${edit ? `<span class="m" style="font-weight:500">Tap a key to change it, x to remove</span>` : ""}<span style="margin-left:auto;display:flex;align-items:center;gap:6px">${nav}${edit ? "" : `<button class="btn sm kall" ${A("allKeys", set)}>All</button>`}</span></div>`;
      const slide = D.ui.keySlide && D.ui.keySlide.id === w.id && Date.now() - D.ui.keySlide.at < 400 ? (D.ui.keySlide.d > 0 ? " slideL" : " slideR") : "";
      h += `<div class="keys${slide}" data-swipe="${w.id}" style="grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${rowsAvail - (suggest ? 1 : 0)},minmax(0,1fr))">${shown.map((k) => keyHTML(k, { edit, set })).join("")}${addHere ? `<button class="k dash" ${A("addKey", set)}>${svg("plus", 22)}<span style="font-size:13px;font-weight:600">Add a key</span></button>` : ""}</div>`;
      if (suggest) h += `${wt("", "Suggested now", "Learned on this PC")}<div class="keys" style="grid-template-columns:repeat(${cols},minmax(0,1fr));flex:0 0 auto;height:${Math.round(100 / (rowsAvail))}%">${D.suggested.slice(0, cols).map((k) => keyHTML(k)).join("")}</div>`;
      return h;
    }
  },
  music: {
    title: "Music", icon: "music", size: [2, 2],
    render(w, D) {
      const m = D.live.media, a = D.live.audio;
      const ss = (m && m.sessions) || [];
      const cur = curMedia(D);
      const vol = a ? a.volume : 0;
      const volRow = `<div style="display:flex;align-items:center;gap:6px;margin-top:auto"><button class="ic" style="width:44px;height:44px" ${A("volStep", -5)} aria-label="Volume down">${svg(a && a.muted ? "mute" : "speaker", 20)}</button><span class="bar"><i style="width:${vol}%"></i></span><button class="ic" style="width:52px;height:44px" ${A("volStep", 5)} aria-label="Volume up"><span class="n" style="font-size:22px">${vol}</span></button></div>`;
      if (!cur) { const mk = Object.values(D.cfg.keySets).flat().find((k) => /spotify|music|youtube|vlc|media player/i.test(k.label)); return `${wt("music", "Music")}<div class="empty">Nothing playing. Start music in any app and it shows here.</div><div style="display:flex;gap:8px;flex-wrap:wrap">${mk ? `<button class="btn sm" ${A("key", mk.id)}>${svg("pp", 16)}Open ${esc(mk.label)}</button>` : ""}${(D.cfg.playlists || []).length ? `<button class="btn sm" ${A("sheet", "music")}>${svg("music", 16)}Playlists</button>` : ""}</div>${volRow}`; }
      const art = imgSrc(cur.art) ? `<img src="${imgSrc(cur.art)}" style="width:70px;height:70px;border-radius:8px;object-fit:cover;flex:0 0 70px" alt="">` : `<span style="width:70px;height:70px;border-radius:8px;background:var(--rule);display:flex;align-items:center;justify-content:center;flex:0 0 70px">${svg("music", 30)}</span>`;
      const pct = cur.dur > 0 ? Math.min(100, 100 * cur.pos / cur.dur) : 0;
      return `<div class="wt">${svg("music", 18)}<span>Music</span><button class="chip" ${A("sheet", "music")} aria-label="Sources and playlists">${esc(cur.name)}${ss.length > 1 ? " +" + (ss.length - 1) : ""}${svg("chev", 14)}</button></div>
        <button class="plain" style="display:flex;gap:12px;align-items:center;min-width:0;text-align:left" ${A("sheet", "music")}>${art}<div style="min-width:0"><div style="font-size:18px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cur.title || "Unknown")}</div><div class="m" style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cur.artist || "")}</div></div></button>
        ${w.h >= 2 && cur.dur > 0 ? `<div style="display:flex;align-items:center;gap:8px"><span class="n m" style="font-size:14px">${mmss(cur.pos)}</span><span class="bar" style="height:5px"><i style="width:${pct}%"></i></span><span class="n m" style="font-size:14px">${mmss(cur.dur)}</span></div>` : ""}
        <div style="display:flex;align-items:center;justify-content:space-around"><button class="ic" ${A("media", { action: "prev", app: cur.app })} aria-label="Previous">${svg("prev", 22)}</button><button class="ic big" ${A("media", { action: "toggle", app: cur.app })} aria-label="Play or pause">${svg(cur.playing ? "pause" : "pp", 26, 2.2)}</button><button class="ic" ${A("media", { action: "next", app: cur.app })} aria-label="Next">${svg("next", 22)}</button></div>
        ${w.h >= 2 ? volRow : ""}`;
    }
  },
  playlists: {
    title: "Playlists", icon: "music", size: [2, 2],
    render(w, D) {
      const pl = D.cfg.playlists || [];
      if (!pl.length) return `${wt("music", "Playlists")}<div class="empty">Paste a Spotify, YouTube Music or any playlist link and it becomes one tap.</div><button class="btn sm go" style="align-self:flex-start" ${A("sheet", "music")}>${svg("plus", 16)}Add a playlist</button>`;
      const cols = w.w >= 3 ? 3 : 2, max = cols * Math.max(1, w.h * 2 - 1);
      return `${wt("music", "Playlists", pl.length > max ? (pl.length - max) + " more" : "")}<div class="keys" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${pl.slice(0, max).map((p) => `<button class="k" ${A("playlist", p.id)}>${svg(p.kind === "spotify" ? "music" : p.kind === "youtube" ? "pp" : "globe", 24)}<span><span class="l">${esc(p.label)}</span><span class="i">${esc(p.kindLabel || "")}</span></span></button>`).join("")}</div>`;
    }
  },
  sound: {
    title: "Sound", icon: "speaker", size: [2, 2],
    render(w, D) {
      const a = D.live.audio || { volume: 0, apps: [] }, mic = D.live.mic || {};
      const apps = (a.apps || []).filter((x) => !/^(electron|side panel)$/i.test(String(x.name || "").trim())).slice(0, w.h >= 2 ? 4 : 1);
      return `${wt("speaker", "Sound", a.muted ? "Muted" : a.volume + "%")}
        <input type="range" min="0" max="100" value="${a.volume}" data-range="volume" aria-label="Volume">
        <div style="display:flex;gap:8px"><button class="btn sm${a.muted ? " warn" : ""}" style="flex:1" ${A("mute", !a.muted)}>${svg(a.muted ? "mute" : "speaker", 18)}${a.muted ? "Unmute all" : "Mute all"}</button>${mic.available ? `<button class="btn sm${mic.muted ? " warn" : ""}" style="flex:1" ${A("mic", !mic.muted)}>${svg(mic.muted ? "micoff" : "mic", 18)}${mic.muted ? "Unmute mic" : "Mute mic"}</button>` : ""}</div>
        ${apps.map((x) => `<label style="display:grid;grid-template-columns:90px 1fr 34px;align-items:center;gap:8px;font-size:14px"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(prettyProc(x.name))}</span><input type="range" min="0" max="100" value="${x.volume}" data-range="app" data-pid="${x.pid}"><span class="n" style="font-size:17px;text-align:right">${x.volume}</span></label>`).join("")}`;
    }
  },
  ai: {
    title: "AI sessions", icon: "claude", size: [3, 2],
    render(w, D) {
      const c = D.claude || { sessions: [], approvals: [] };
      const ss = c.sessions.filter((s) => s.state !== "ended" && !(D.ui.hiddenSessions || []).includes(s.id) && !(s.state === "done" && Date.now() - s.updated > 6 * 3600000));
      const held = w.opts.hold && D.live.inGame;
      const need = ss.filter((s) => s.state === "waiting").length;
      const running = ss.filter((s) => s.state === "working" || s.state === "waiting").length;
      const head = ss.length ? `${running} running${ss.length > running ? ", " + (ss.length - running) + " finished" : ""}${need ? ", " + need + " need" + (need > 1 ? "" : "s") + " you" : ""}` : "Nothing running";
      const face = companion(D.cfg.companion, w.h >= 2 ? 64 : 40, crabState(ss, held));
      let body;
      if (!ss.length) {
        const cc = D.providers.find((p) => p.id === "claude-code");
        body = cc && !D.hooks.user
          ? `<div class="empty">Claude Code is on this PC but not connected yet.</div><button class="btn sm go" style="align-self:flex-start" ${A("connectClaude")}>${svg("plug", 18)}Connect Claude Code</button>`
          : `<div class="empty">${cc ? "Start a Claude Code session and it shows up here." : "No AI tools on this PC yet. Ask Blink: it opens Claude, ChatGPT or Copilot in your browser."}</div>`;
      } else {
        const rows = Math.max(1, w.h * 2);
        body = ss.slice(0, rows).map((s) => {
          const [col, label] = STATE[s.state] || ["var(--mute)", s.state];
          const prog = s.total ? `<span class="t n" style="font-size:17px;color:var(--ink)">${s.done}/${s.total}</span>` : `<span class="t">${ago(s.updated)}</span>`;
          const open = s.source === "panel" ? A("openThread", s.threadId) : s.source === "log" || s.source === "hook" ? A("openLog", s.id) : A("sheet", "sessions");
          return `<button class="row" ${open}><span class="dot" style="background:${col}"></span><span class="grow"><span class="ell" style="font-weight:700">${esc(s.project)} <span class="m" style="font-weight:500;font-size:12px">${esc(s.provider)}</span></span><span class="ell m" style="font-size:13px">${esc(label + ". " + ((s.state === "yourturn" || s.state === "done") && s.summary ? s.summary : s.now))}</span></span>${prog}</button>`;
        }).join("");
      }

      return `<div style="display:flex;align-items:center;gap:12px">${face}<div style="min-width:0"><div class="wt">AI sessions</div><div style="font-size:18px;font-weight:700">${held && ss.length ? "Held until you stop" : head}</div></div><button class="btn sm" style="margin-left:auto" ${A("sheet", "sessions")}>All ${svg("chev", 16)}</button></div>${body}`;
    }
  },
  aitoday: {
    title: "AI today", icon: "bolt", size: [1, 1],
    render(w, D) {
      const t = D.live.aiToday;
      if (!t) return wt("bolt", "AI today") + '<div class="empty">Counting...</div>';
      const hrs = t.activeMin >= 60 ? Math.floor(t.activeMin / 60) + "h " + (t.activeMin % 60) + "m" : t.activeMin + " min";
      const tok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
      const lim = limitLine(D.live.limits);
      if (w.w === 1 && w.h === 1) return wt("bolt", "AI today") + '<span class="n" style="font-size:40px;line-height:.9">' + hrs + '</span><span class="m" style="font-size:13px">' + (lim ? lim.short : t.sessions + " sessions. " + t.prompts + " asks") + "</span>";
      const stat = (l, v) => '<div><div class="m" style="font-size:13px">' + l + '</div><span class="n" style="font-size:44px;line-height:.9">' + v + "</span></div>";
      const top = w.h >= 2 ? t.top.map((p) => '<div class="row" style="min-height:34px"><span class="dot" style="background:var(--live)"></span><span>' + esc(p.name) + '</span><span class="t">' + p.sessions + " sessions</span></div>").join("") : "";
      return wt("bolt", "AI today", "Claude Code on this PC") + '<div style="display:flex;gap:22px;flex-wrap:wrap">' + stat("Active", hrs) + stat("Sessions", t.sessions) + stat("Your asks", t.prompts) + stat("Written", tok(t.outTokens)) + "</div>" + (lim ? lim.bar : "") + top;
    }
  },
  notes: {
    title: "Notes", icon: "check", size: [2, 2],
    render(w, D) { return `${wt("check", "Notes", notesOpen(D).length ? notesOpen(D).length + "" : "")}${notesHTML(D, 12)}`; }
  },
  needs: {
    title: "Needs a look", icon: "bell", size: [2, 2],
    render(w, D) {
      // your notes come first: they stay here until you tick them off
      const notesTop = notesOpen(D).length || (D.cfg.notes || []).some((n) => n.done && Date.now() - n.doneAt < 3600000) ? notesHTML(D, Math.max(2, w.h * 2 - 1)) : "";
      const all = (D.attention || []).filter((x) => !x.urgent);
      // Finished AI work is one line here; the AI widget has the detail.
      const done = all.filter((x) => x.kind === "session");
      const items = all.filter((x) => x.kind !== "session");
      if (done.length) items.push({ kind: "session", title: done.length === 1 ? done[0].title : done.length + " AI sessions finished", text: done.length === 1 ? done[0].text : done.map((d) => d.title.replace(/ finished$/, "")).join(", ") });
      if (!items.length) return `${wt("bell", "Needs a look")}${notesTop}${notesTop ? "" : `<div class="empty">All good. Your notes, failed automations, low disk space and finished AI work show up here. Say or type "note: ..." to add one.</div>`}`;
      return `${wt("bell", "Needs a look", items.length + "")}${notesTop}${items.slice(0, Math.max(1, w.h * 2 - (notesTop ? 2 : 0))).map((x) => {
        const go = x.kind === "session" || x.kind === "question" ? A("sheet", "sessions") : x.action ? A("attAction", x.action) : A("toastText", x.text);
        const hint = x.action ? x.action.label : x.kind === "session" || x.kind === "question" ? "See sessions" : "";
        return `<div style="display:flex;align-items:center;border-bottom:1px solid var(--rule)"><button class="row" style="border:0;flex:1 1 auto;min-width:0;width:auto" ${go}><span class="dot" style="background:${x.kind === "session" ? "var(--ok)" : "var(--wait)"}"></span><span class="grow"><span class="ell">${esc(x.title)}</span>${w.w >= 2 ? `<span class="ell m" style="font-size:13px">${esc(x.kind === "task" ? hint + ". Failed " + ago(new Date(x.when || Date.now()).getTime()) + (ago(new Date(x.when || Date.now()).getTime()) === "now" ? "" : " ago") : hint ? hint + ". " + x.text : x.text)}</span>` : ""}</span></button>${x.key ? `<button class="ic" style="width:40px;height:40px;flex:0 0 40px" ${A("dismissAtt", { key: x.key, hours: 24 })} aria-label="Hide for a day">${svg("x", 14, 2.4)}</button>` : ""}</div>`;
      }).join("")}`;
    }
  },
  meeting: {
    title: "Next meeting", icon: "people", size: [2, 2],
    render(w, D) {
      const mt = D.live.meeting;
      const ms = (mt && mt.meetings) || [];
      if (!mt) return `${wt("people", "Next meeting")}<div class="empty">${D.discOutlook ? "Open Outlook and your next meeting shows here." : "No calendar found on this PC. Classic Outlook works with no setup."}</div>`;
      const m = ms.find((x) => new Date(x.end) > Date.now());
      if (!m) return `${wt("people", "Next meeting", "Outlook")}<div style="font-size:22px;font-weight:700">No more meetings today</div>`;
      const mins = Math.round((new Date(m.start) - Date.now()) / 60000);
      const when = mins > 59 ? Math.floor(mins / 60) + " h " + (mins % 60) + " m" : mins > 0 ? mins + " min" : "Now";
      const title = D.cfg.hideMeetingTitles && !D.ui.showTitles ? "Busy" : m.subject;
      const t = new Date(m.start);
      return `${wt("people", "Next meeting", "Outlook")}<span class="n" style="font-size:${w.h >= 2 ? 72 : 44}px;line-height:.9">${when}</span><div style="font-size:18px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pad(t.getHours())}:${pad(t.getMinutes())} ${esc(title)}</div>${w.h >= 2 ? `<div style="display:flex;gap:8px;margin-top:auto">${m.join ? `<button class="btn go sm" ${A("openUrl", m.join)}>Join</button>` : ""}${D.cfg.hideMeetingTitles ? `<button class="btn sm" ${A("toggleTitles")}>${D.ui.showTitles ? "Hide title" : "Show title"}</button>` : ""}</div>` : ""}`;
    }
  },
  focus: {
    title: "Focus timer", icon: "timer", size: [2, 1],
    render(w, D) {
      const f = D.ui.focus;
      const left = f.running ? Math.max(0, f.end - Date.now()) / 1000 : f.left;
      return `${wt("timer", "Focus", f.running ? "Running" : "")}<div style="display:flex;align-items:center;gap:10px"><span class="n" style="font-size:52px;line-height:.9">${mmss(left)}</span><div style="margin-left:auto;display:flex;gap:6px">${f.running ? `<button class="btn sm" ${A("focus", "pause")}>Pause</button>` : `<button class="btn go sm" ${A("focus", "start")}>Start</button>`}<button class="btn sm" ${A("focus", "reset")}>Reset</button></div></div>`;
    }
  },
  quote: {
    title: "Quote", icon: "quote", size: [2, 1],
    render(w, D) {
      if (D.cfg.quotes === false) return `${wt("quote", "Quote")}<div class="empty">Quotes are off. Turn them on in Settings.</div>`;
      const q = quoteNow(D);
      const len = q[0].length, area = w.w * w.h;
      const fs = Math.round(Math.max(15, Math.min(34, (area >= 6 ? 30 : area >= 4 ? 26 : area >= 3 ? 22 : 18) - (len > 120 ? 4 : len > 80 ? 2 : 0))));
      return `<button class="plain qw" ${A("nextQuote")} title="Tap for another"><span class="qmark" aria-hidden="true">&#8220;</span><span class="qtext" style="font-size:${fs}px">${esc(q[0])}</span><span class="qby m">${esc(q[1])}</span></button>`;
    }
  },
  gamestats: {
    title: "Game stats", icon: "game", size: [3, 2],
    render(w, D) {
      const s = D.live.stats || {}, g = s.gpu, fg = D.live.fg || {};
      const playing = D.live.inGame;
      const mins = playing && D.live.gameSince ? Math.floor((Date.now() - D.live.gameSince) / 60000) : 0;
      const tile = (l, v, sub, warn) => `<div style="min-width:0"><div class="m" style="font-size:14px">${l}</div><div class="n" style="font-size:${w.h >= 2 ? 52 : 34}px;line-height:.95;${warn ? "color:var(--wait)" : ""}">${v}</div>${sub ? `<div class="m" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>` : ""}</div>`;
      const tiles = [];
      if (g) tiles.push(tile("GPU", g.util + "%", esc(String(g.name || "").replace(/^NVIDIA (GeForce )?/i, ""))), tile("GPU temp", g.temp + "&#176;", g.temp >= 83 ? "Running hot" : "", g.temp >= 83));
      tiles.push(tile("CPU", (s.cpu ?? "-") + "%"));
      tiles.push(tile("RAM", s.ramUsedGB != null ? s.ramUsedGB + "<span style=\"font-size:.45em\"> GB</span>" : "-", s.ramTotalGB ? "of " + s.ramTotalGB + " GB" : ""));
      if (g && g.memTotal) tiles.push(tile("Video memory", (g.memUsed / 1024).toFixed(1) + "<span style=\"font-size:.45em\"> GB</span>", "of " + Math.round(g.memTotal / 1024) + " GB"));
      const cols = w.w >= 3 ? 3 : 2;
      const last = D.live.lastGame ? prettyProc(D.live.lastGame) + (D.live.lastGameMins ? ", " + D.live.lastGameMins + " min" : "") : D.recentGame || "";
      const head = playing ? `<div style="font-size:${w.h >= 2 ? 24 : 18}px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(prettyProc(fg.title || fg.app))}</div>`
        : `<div style="display:flex;align-items:baseline;gap:10px;min-width:0"><span style="font-size:${w.h >= 2 ? 22 : 17}px;font-weight:700">Not playing</span>${last ? `<span class="m" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Last: ${esc(last)}</span>` : ""}</div>`;
      return `${wt("game", playing ? "Playing now" : "PC", playing && mins ? (mins >= 60 ? Math.floor(mins / 60) + " h " + (mins % 60) + " min" : mins + " min") : "")}${head}<div style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:14px 20px;margin-top:auto">${tiles.slice(0, w.h >= 2 ? cols * 2 : cols).join("")}</div>`;
    }
  },
  minigame: {
    title: "Mini game", icon: "dice", size: [2, 1],
    render() { return `${wt("dice", "Break")}<button class="btn go" ${A("sheet", "game")}>${svg("pp", 18)}Play Crab Stack</button>`; }
  },
  ask: {
    title: "Ask", icon: "mic", size: [2, 1],
    render(w, D) { return `${wt("mic", "Ask an AI")}<button class="btn go" style="height:56px" ${A("sheet", "ask")}>${svg("mic", 20)}Ask by text or voice</button>`; }
  },
  custom: {
    title: "Custom", icon: "wand", size: [2, 1],
    render(w, D) {
      const c = (D.custom || {})[w.opts.name];
      if (!c) return `${wt("wand", w.opts.name || "Custom")}<div class="empty">This widget's folder was removed.</div>`;
      if (!c.approved) return `${wt("wand", esc(c.title), "Needs your OK")}<div class="empty">It wants to run:</div><div class="m" style="font-family:Consolas,monospace;font-size:13px;word-break:break-all">${esc(c.command)}</div><button class="btn sm go" style="align-self:flex-start" ${A("approveWidget", { name: c.name, command: c.command })}>Allow it to run</button>`;
      if (c.error) return `${wt("wand", esc(c.title))}<div class="empty" style="color:var(--bad)">${esc(c.error)}</div>`;
      const d = c.data;
      if (d) {
        const tone = d.tone === "bad" ? "var(--bad)" : d.tone === "warn" ? "var(--wait)" : d.tone === "ok" ? "var(--ok)" : "var(--ink)";
        const items = (d.items || []).slice(0, w.h >= 2 ? 6 : 2).map((x) => `<div style="display:flex;gap:8px;font-size:15px;min-width:0"><span class="m" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">${esc(x.label)}</span><span class="n" style="margin-left:auto;font-size:18px">${esc(x.value)}</span></div>`).join("");
        return `${wt("wand", esc(c.title), c.updated ? ago(c.updated) : "")}${d.big ? `<div style="display:flex;align-items:baseline;gap:8px;min-width:0"><span class="n" style="font-size:${w.h >= 2 ? 60 : 38}px;line-height:.95;color:${tone}">${esc(d.big)}</span>${d.label ? `<span class="m" style="font-size:15px">${esc(d.label)}</span>` : ""}</div>` : ""}${d.bar != null ? `<span class="bar" style="flex:0 0 8px"><i style="width:${d.bar}%;background:${tone}"></i></span>` : ""}${(d.lines || []).map((l) => `<div style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l)}</div>`).join("")}${items}${d.link ? `<button class="btn sm" style="align-self:flex-start;margin-top:auto" ${A("openUrl", d.link.url)}>${esc(d.link.label)}</button>` : ""}`;
      }
      const [first, ...rest] = c.lines || [];
      return `${wt("wand", esc(c.title))}<div class="n" style="font-size:${w.h >= 2 ? 64 : 40}px;line-height:.95">${esc(first || "...")}</div>${rest.map((l) => `<div style="font-size:15px">${esc(l)}</div>`).join("")}`;
    }
  }
};
