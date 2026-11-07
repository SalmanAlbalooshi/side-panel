// AI sessions, made for scanning and acting: grouped by what they need from you, each card opens the conversation
// right here (read it, reply, carry on), with the main-screen window one small button away.
const SS_GROUPS = [["need", "Needs you"], ["working", "Working"], ["done", "Done"]];
function ssGroup(s, aps) {
  if (aps.some((a) => a.sessionId === s.id) || s.state === "waiting") return "need";
  if (s.state === "working") return "working";
  return "done";
}
const cleanAsk = (t) => (/^\s*</.test(String(t || "")) ? "" : String(t || ""));
function ssCard(s, aps, D) {
  const [col, label] = STATE[s.state] || ["var(--mute)", s.state];
  const ap = aps.find((a) => a.sessionId === s.id);
  const open = s.source === "panel" ? A("openThread", s.threadId) : s.source === "web" ? A("openSession", { project: s.project, browser: true }) : A("openLog", s.id);
  const body = (s.state === "yourturn" || s.state === "done" || s.state === "failed") && s.summary ? s.summary : s.now;
  const ask = cleanAsk(s.ask);
  const who = s.source === "web" ? s.provider : s.provider + (s.source === "panel" ? "" : "");
  const side = s.source === "web" || s.source === "panel" ? "" : `<button class="ic sm" ${A("openSession", { project: s.project, app: /app/.test(s.provider), id: s.id })} title="Show its window on the main screen" aria-label="Show on main screen">${svg("monitor", 18)}</button>`;
  const hide = s.state !== "working" && s.state !== "waiting" ? `<button class="ic sm" ${A("hideSession", s.id)} title="Hide" aria-label="Hide">${svg("x", 16, 2.4)}</button>` : "";
  const approve = ap ? `<div class="ss-ap"><div class="mono">${esc(ap.detail || ap.what)}</div><div style="display:flex;gap:8px"><button class="btn sm go" ${A("approve", { id: ap.id, decision: "allow" })}>Allow</button><button class="btn sm" ${A("approve", { id: ap.id, decision: "deny" })}>Deny</button>${ap.source === "panel" ? "" : `<button class="btn sm" ${A("approve", { id: ap.id, decision: null })}>In terminal</button>`}</div></div>` : "";
  const plan = s.total ? `<div class="ss-plan"><span class="bar"><i style="width:${100 * s.done / s.total}%"></i></span><span class="n">${s.done}/${s.total}</span></div>` : "";
  return `<div class="ss-card${ap || s.state === "waiting" ? " need" : ""}">
    <button class="plain ss-main" ${open}>
      <span class="ss-top"><b class="ell">${esc(s.project)}</b><span class="ss-chip" style="color:${col};border-color:${col}">${label}</span></span>
      <span class="ss-who m">${esc(who)}. ${ago(s.updated) === "now" ? "Active now" : ago(s.updated) + " ago"}${s.files ? ". " + s.files + (s.files === 1 ? " file" : " files") + " changed" : ""}</span>
      ${ask ? `<span class="ss-ask m">You: ${esc(ask)}</span>` : ""}
      <span class="ss-body">${esc(body || "")}</span>
      ${plan}
      <span class="ss-open">${s.source === "web" ? "Show in browser" : "Open and reply"} ${svg("chev", 14)}</span>
    </button>${approve}<span class="ss-tools">${side}${hide}</span></div>`;
}
SHEETS.sessions = function (D) {
  const c = D.claude || { sessions: [], approvals: [] };
  const aps = c.approvals || [];
  const ss = c.sessions.filter((s) => !(D.ui.hiddenSessions || []).includes(s.id));
  const groups = {}; for (const s of ss) (groups[ssGroup(s, aps)] = groups[ssGroup(s, aps)] || []).push(s);
  const showEarlier = D.ui.ssEarlier;
  const sections = SS_GROUPS.filter(([k]) => (groups[k] || []).length).map(([k, l]) => {
    const list = groups[k];
    const shown = k === "done" && !showEarlier ? list.slice(0, 6) : list;
    const moreBtn = shown.length < list.length ? `<button class="btn sm" style="margin-top:10px" ${A("ssEarlier")}>Show ${list.length - shown.length} more ${svg("chev", 14)}</button>` : "";
    return `<div class="ss-sec"><div class="ss-h">${l}<span class="m">${list.length}</span></div><div class="ss-grid">${shown.map((s) => ssCard(s, aps, D)).join("")}</div>${moreBtn}</div>`;
  }).join("");
  const chats = (D.threads || []).filter((t) => t.kind === "chat" && t.state !== "running");
  const chatList = chats.length ? `<div class="ss-sec"><div class="ss-h">Your chats on the panel<span class="m">${chats.length}</span></div><div class="ss-chats">${chats.slice(0, 8).map((t) => `<button class="row" ${A("openThread", t.id)}><span class="grow"><b class="ell">${esc(t.title)}</b><span class="ell m" style="font-size:13px">${esc(t.provider || "")}${t.summary ? ". " + esc(t.summary) : ""}</span></span><span class="t">${ago(t.updated)}</span></button>`).join("")}</div></div>` : "";
  // Codex conversations from the Codex app or a terminal: continue them here, or in a terminal
  const hasCodex = (D.providers || []).some((p) => p.id === "codex" && p.installed !== false);
  if (hasCodex && (!D.ui.cxAt || Date.now() - D.ui.cxAt > 60000)) { D.ui.cxAt = Date.now(); act("codexThreads").then((r) => { D.ui.cxList = (r && r.threads) || []; if (D.ui.sheet === "sessions") drawSheet(); }); }
  const cx = (D.ui.cxList || []).slice(0, 6);
  const cxList = cx.length ? `<div class="ss-sec"><div class="ss-h">Codex, started elsewhere<span class="m">${cx.length}</span></div><div class="ss-chats">${cx.map((x) => D.ui.cxPick === x.id
    ? `<div class="row" style="flex-wrap:wrap;gap:8px"><b class="ell" style="flex:1 1 100%">${esc(x.title)}</b><input type="text" id="cxText" dir="auto" placeholder="What should Codex do next?" style="flex:1 1 200px;min-width:0;height:44px"><button class="btn sm go" ${A("cxGo", x.id)}>Continue here</button><button class="btn sm" ${A("cxTerm", x.id)}>${svg("term", 16)}Terminal</button></div>`
    : `<button class="row" ${A("cxPick", x.id)}><span class="grow"><b class="ell">${esc(x.title)}</b><span class="m" style="font-size:13px">${esc(x.cwd ? x.cwd.split(/[\\/]/).pop() : "Codex")}${x.updated ? ". " + ago(x.updated) + " ago" : ""}</span></span>${svg("chev", 14)}</button>`).join("")}</div></div>` : "";
  const cli = (D.providers || []).some((p) => p.kind === "cli");
  const empty = cli ? `<div class="empty" style="font-size:17px">No AI sessions right now. Ask Blink to start one.</div>` : `<div class="empty" style="font-size:17px;line-height:1.5">No AI tools on this PC yet, so there are no sessions to show.<br>Ask Blink anything: it opens Claude, ChatGPT or Copilot in your browser.<br>If Claude Code or Codex gets installed later, its sessions show up here by themselves.</div>`;
  return sheetFrame("AI sessions", "", (sections || empty) + ((chats.length || cx.length) ? (D.ui.ssOlder ? chatList + cxList : `<button class="btn sm" style="margin-top:14px" ${A("ssOlder")}>Your chats${cx.length ? " and Codex conversations" : ""} (${Math.min(chats.length, 8) + cx.length}) ${svg("chev", 14)}</button>`) : ""), `<button class="btn" style="height:46px" ${A("cmdOpen")}>${svg("plus", 18)}${cli ? "New task" : "Ask Blink"}</button>`);
};
H.cxPick = (id) => { D.ui.cxPick = D.ui.cxPick === id ? null : id; drawSheet(); setTimeout(() => { const i = $("#cxText"); if (i) { act("typing", true); i.focus(); } }, 60); };
H.cxGo = async (id) => { const x = (D.ui.cxList || []).find((y) => y.id === id); const text = ($("#cxText") || {}).value || ""; if (!text.trim()) return toast("Say what Codex should do next"); const r = await act("codexContinue", { id, text, cwd: x ? x.cwd : "" }); if (r.error) return toast(r.error); D.ui.cxPick = null; H.openThread(r.thread); };
H.cxTerm = async (id) => { const x = (D.ui.cxList || []).find((y) => y.id === id); const r = await act("codexTerminal", { id, cwd: x ? x.cwd : "" }); toast(r.toast || r.error); };
H.ssOlder = () => { D.ui.ssOlder = !D.ui.ssOlder; drawSheet(); };
H.ssEarlier = () => { D.ui.ssEarlier = !D.ui.ssEarlier; drawSheet(); };

// a session's conversation stays live while it's open, so a running session keeps updating
setInterval(async () => {
  if (D.ui.sheet !== "log" || !D.ui.logData) return;
  const r = await act("sessionLog", D.ui.logData.id);
  if (!r || !r.log || D.ui.sheet !== "log") return;
  const before = JSON.stringify(D.ui.logData.messages.slice(-2)), after = JSON.stringify(r.log.messages.slice(-2));
  if (before !== after || r.log.messages.length !== D.ui.logData.messages.length) { D.ui.logData = r.log; drawSheet(); }
}, 4000);
// if its window can't be found, show the session here instead of an error
const openSessionOld = H.openSession;
H.openSession = async (s) => {
  const r = await act("openSession", s);
  if (r && r.ok) { toast(r.toast || "Opened on your main screen"); return; }
  if (s && s.id && !s.browser) { toast("Its window is closed. Showing it here, you can reply"); H.openLog(s.id); return; }
  toast((r && r.toast) || "Couldn't find that window");
};
