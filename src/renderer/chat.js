// Chats and tasks that run on the panel: the conversation, each step the AI takes, approvals, follow-ups.

// A small, safe Markdown subset: everything is escaped first, then a few marks are turned into tags.
function md(t) {
  const blocks = [];
  // a ```blink-card``` block is a small visual; any other fenced block is code
  let s = String(t || "").replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) => { blocks.push(lang === "blink-card" ? { card: typeof blinkCard === "function" ? blinkCard(code) : "" } : code.replace(/\n$/, "")); return "\u0000" + (blocks.length - 1) + "\u0000"; });
  s = s.replace(/```blink-card[\s\S]*$/, ""); // a visual still arriving isn't shown as raw text
  s = esc(s);
  const inline = (x) => x.replace(/\u0000(\d+)\u0000/g, (_, i) => { const b = blocks[Number(i)]; return b && typeof b === "object" ? b.card : `<code>${esc(b || "")}</code>`; }).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/g, "$1");
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.t}>`); list = null; } };
  let table = null;
  const flushTable = () => { if (table) { const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)).map((r) => r.replace(/^\s*\||\|\s*$/g, "").split("|").map((c) => inline(c.trim()))); out.push(`<table>${rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join("")}</tr>`).join("")}</table>`); table = null; } };
  for (const line of s.split("\n")) {
    // a simple table: rows that start and end with |
    if (/^\s*\|.*\|\s*$/.test(line)) { flush(); (table = table || []).push(line); continue; }
    flushTable();
    const code = line.match(/^\s*(?:[-*•]\s+|\d+[.)]\s+)?\u0000(\d+)\u0000\s*$/);
    if (code) { flush(); const b = blocks[Number(code[1])]; out.push(b && typeof b === "object" ? b.card : `<pre class="code">${esc(b)}</pre>`); continue; }
    const b = line.match(/^\s*[-*•]\s+(.*)$/), n = line.match(/^\s*\d+[.)]\s+(.*)$/), h = line.match(/^#{1,4}\s+(.*)$/);
    if (b || n) { const tag = b ? "ul" : "ol"; if (!list || list.t !== tag) { flush(); list = { t: tag, items: [] }; } list.items.push((b || n)[1]); continue; }
    flush();
    if (h) out.push(`<div class="mh">${inline(h[1])}</div>`);
    else if (line.trim()) out.push(`<p>${inline(line).replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(blocks[Number(i)])}</code>`)}</p>`);
  }
  flush(); flushTable();
  return out.join("");
}

const STEP_ICON = { run: "◌", ok: "✓", bad: "✕" };
function partHTML(p) {
  if (p.type === "text") return p.text && p.text.trim() ? `<div class="msg ai">${md(p.text)}</div>` : "";
  if (p.type === "step") return `<div class="step ${p.state || "ok"}"><span class="si">${STEP_ICON[p.state] || "✓"}</span><span class="ell">${esc(p.label)}</span></div>`;
  if (p.type === "error") return `<div class="msg err">${esc(p.text)}</div>`;
  if (p.type === "note") return `<div class="step"><span class="si">■</span>${esc(p.text)}</div>`;
  return "";
}
// Steps in a row fold into one line ("5 steps") so the answer stays readable; the latest step stays visible.
function convHTML(t) {
  if (!t || !t.messages) return "";
  const out = [];
  t.messages.forEach((m, mi) => {
    if (m.role === "you") { out.push(`<div class="msg you">${esc(m.text)}</div>`); return; }
    const parts = m.parts || [];
    let run = [];
    const isLast = mi === t.messages.length - 1;
    const flushSteps = (final) => {
      if (!run.length) return;
      if (run.length > 3 && !(final && isLast && t.state === "running")) out.push(`<details class="steps"><summary>${run.length} steps${run.some((x) => x.state === "bad") ? ", some failed" : ""}</summary>${run.map(partHTML).join("")}</details>`);
      else out.push(run.map(partHTML).join(""));
      run = [];
    };
    for (const p of parts) { if (p.type === "step") run.push(p); else { flushSteps(false); out.push(partHTML(p)); } }
    flushSteps(true);
    if (isLast && t.state === "running") out.push(`<div class="step live"><span class="si spin">◌</span>${esc(t.now || "Thinking")}</div>`);
  });
  return out.join("");
}
function lastAnswer(t) {
  const m = t && t.messages ? [...t.messages].reverse().find((x) => x.role === "ai") : null;
  const p = m ? [...m.parts].reverse().find((x) => x.type === "text" && x.text.trim()) : null;
  return p ? p.text : "";
}
const MODE_LABEL = { read: "Read-only", ask: "Asks before changes", edit: "Edits files freely" };
const KIND_LABEL = { chat: "Chat", task: "Task", widget: "Widget build" };

const AI_ACTIONS = [
  ["explain", "Explain", "What I copied"], ["summary", "Summarise", "What I copied"], ["reply", "Draft a reply", "To the copied email"],
  ["fix", "Fix my writing", "Copied text"], ["translate", "Translate", "Arabic and English"], ["actions", "Action items", "From copied notes"], ["screen", "My main screen", "What's on it"]
];
function aiActionsHTML(compact) {
  return `<div class="acts${compact ? " compact" : ""}">${AI_ACTIONS.map(([id, l, s]) => `<button class="act" ${A("aiAction", id)}><b>${l}</b><span>${s}</span></button>`).join("")}</div>`;
}

// The full conversation sheet for any chat, task or widget build.
SHEETS.chat = function (D) {
  const t = D.ui.threadData;
  if (!t) return sheetFrame("Chat", "", `<div class="empty">Loading...</div>`);
  const aps = ((D.claude && D.claude.approvals) || []).filter((a) => a.sessionId === t.id);
  const sub = [t.provider && t.provider !== "Claude Code" ? t.provider : "", KIND_LABEL[t.kind], t.project, MODE_LABEL[t.mode], t.seconds ? t.seconds + " s" : ""].filter(Boolean).join(". ");
  const head = `<button class="btn sm" ${A("chats")}>${svg("chat", 16)}All chats</button><button class="btn sm${D.ui.armed === "del:" + t.id ? " warn" : ""}" style="margin-left:auto" ${A("chatDelete")}>${D.ui.armed === "del:" + t.id ? "Tap again to delete" : "Delete"}</button>${D.ui.moveOpen === t.id ? `<span class="m" style="font-size:13px">${t.state === "running" ? "Stops it here, then:" : "Continue in:"}</span>${t.engine !== "codex" ? `<button class="btn sm go" ${A("chatDesktop")}>Claude app</button>` : ""}<button class="btn sm" ${A("chatTerminal")}>${svg("term", 16)}Terminal</button><button class="btn sm" ${A("chatMove")}>Not now</button>` : `<button class="btn sm" ${A("chatMove")} title="Carry on in the Claude app or a terminal">Continue in...</button>`}${t.state === "running" ? `<button class="btn sm stop" ${A("chatStop")}>${svg("stop", 16)}Stop</button>` : ""}<span style="width:24px"></span>`;
  const apHTML = aps.map((a) => `<div class="card need"><div style="font-weight:700;color:var(--wait)">Needs your OK</div><div style="font-size:18px;font-weight:700">${esc(a.what)}</div><div class="m mono">${esc(a.detail)}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm go" ${A("approve", { id: a.id, decision: "allow" })}>Allow once</button><button class="btn sm" ${A("approve", { id: a.id, decision: "deny" })}>Deny</button></div></div>`).join("");
  const plan = t.plan && t.plan.length ? `<div class="card"><b>Plan</b>${t.plan.map((p) => `<div class="step ${p.status === "completed" ? "ok" : p.status === "in_progress" ? "run" : ""}"><span class="si">${p.status === "completed" ? "✓" : p.status === "in_progress" ? "▸" : "·"}</span><span>${esc(p.text)}</span></div>`).join("")}</div>` : "";
  const where = t.extra && t.extra.widget && (D.ui.builtWhere || {})[t.extra.widget];
  const built = t.kind === "widget" && t.extra && t.extra.widget ? `<div class="card" style="box-shadow:inset 0 0 0 2px var(--ok)"><b style="color:var(--ok)">${where ? "Widget added to your " + esc(where) + " screen" : "Widget ready"}</b><span class="m">It's called ${esc(t.extra.widget)}. ${where ? "Hold it to move or resize it." : "Add it from Add a widget."} Not quite right? Say what to change below.</span>${t.extra.command ? `<span class="m mono">Runs: ${esc(t.extra.command)}</span>` : ""}</div>` : "";
  const side = apHTML + built + plan;
  const ans = lastAnswer(t);
  const foot = `<div class="chatfoot"><textarea id="chatText" rows="1" placeholder="${t.state === "running" ? "It's working. You can type your next message" : t.canFollow ? "Reply or ask a follow-up" : "This chat can't continue"}">${esc(D.ui.chatText || "")}</textarea><button class="btn go" ${A("chatSend")}${t.canFollow ? "" : " disabled"}>Send</button>${ans ? `<button class="btn" ${A("copy", ans)}>Copy answer</button>` : ""}</div>`;
  return sheetFrame(esc(t.title), t.kind === "chat" ? "" : esc(sub), `<div class="chatwrap${side ? "" : " one"}"><div class="conv" id="conv">${convHTML(t)}</div>${side ? `<div class="chatside">${side}</div>` : ""}</div>`, head, foot);
};

// A new version is out: one quiet pop-up per version (Settings always has the Update button too)
SHEETS.update = function (D) {
  const u = D.update || {};
  const busy = u.status === "downloading" || u.status === "installing";
  const body = `<div style="display:flex;flex-direction:column;gap:14px;max-width:620px">
    <div style="font-size:18px">${busy ? (u.status === "downloading" ? "Downloading " + (u.progress || 0) + "%..." : "Installing. Side Panel restarts by itself in a moment.") : "Side Panel " + esc(u.latest || "") + " is ready. Updating takes about a minute and keeps all your keys, layouts and chats. No admin rights needed."}</div>
    ${u.notes && !busy ? `<div class="msg ai" style="max-height:30vh;overflow:auto">${md(u.notes)}</div>` : ""}
    ${busy ? "" : `<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn go" ${A("updateNow")}>Update now</button><button class="btn" ${A("updateLater")}>Later</button></div><span class="m" style="font-size:13px">You can also update any time from Settings.</span>`}
  </div>`;
  return sheetFrame("Update ready", "Version " + esc(u.latest || ""), body);
};
Object.assign(H, { updateLater: () => { try { localStorage.setItem("sp-update-seen", (D.update && D.update.latest) || ""); } catch { } closeSheet(); } });
function maybeShowUpdate() {
  const u = D.update; if (!u || u.status !== "available" || D.test && !D.ui.allowUpdatePopup) return;
  let seen = ""; try { seen = localStorage.getItem("sp-update-seen") || ""; } catch { }
  if (seen === u.latest || D.ui.sheet || D.mini || (typeof Call !== "undefined" && Call.on)) return;
  try { localStorage.setItem("sp-update-seen", u.latest); } catch { }
  openSheet("update");
}

// Every chat with Blink, newest first: typed chats, calls and tasks. Kept across restarts.
function chatDay(ts) { const d = new Date(ts), n = new Date(); if (d.toDateString() === n.toDateString()) return "Today"; if (new Date(n - 864e5).toDateString() === d.toDateString()) return "Yesterday"; return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); }
SHEETS.chats = function (D) {
  const q = String(D.ui.chatQ || "").toLowerCase().trim();
  const all = (D.threads || []).filter((t) => t.kind === "chat" || t.kind === "task");
  const list = all.filter((t) => !q || (t.title + " " + (t.summary || "")).toLowerCase().includes(q));
  let day = "";
  const rows = list.map((t) => {
    const d = chatDay(t.updated), headRow = d !== day ? `<div class="chatday">${esc(d)}</div>` : ""; day = d;
    const icon = t.extra && t.extra.call ? "mic" : t.kind === "task" ? "term" : "chat";
    const when = new Date(t.updated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return headRow + `<button class="chatrow" ${A("openThread", t.id)}><span class="ci">${svg(icon, 20)}</span><span class="ct"><b class="ell">${esc(t.title.replace(/^Call: /, ""))}</b><span class="ell m">${t.state === "running" ? "Working..." : esc(t.summary || (t.extra && t.extra.call ? "Voice call" : ""))}</span></span><span class="cw m">${t.extra && t.extra.call ? "Call. " : ""}${when}</span></button>`;
  }).join("");
  const head = `<button class="btn go" ${A("chatNew")}>${svg("plus", 18)}New chat</button>`;
  const search = all.length > 4 ? `<input type="text" id="chatQ" placeholder="Search your chats" value="${esc(D.ui.chatQ || "")}" autocomplete="off" style="margin-bottom:10px">` : "";
  const empty = all.length ? (q ? `<div class="empty">No chats match "${esc(q)}".</div>` : "") : `<div class="empty">No chats yet. Ask Blink anything, or tap the mic for a call. Your chats stay here, even after a restart.</div>`;
  return sheetFrame("Chats", all.length ? all.length + (all.length === 1 ? " chat" : " chats") + ". Tap one to read it or carry on" : "", `${search}<div class="chatlist">${rows}${empty}</div>`, head);
};
Object.assign(H, {
  chats: () => { D.ui.chatQ = ""; openSheet("chats"); },
  // a fresh conversation: the Ask Blink bar, with no earlier chat attached
  chatNew: () => { if (D.ui.cmd) { D.ui.cmd.thread = null; D.ui.cmd.answer = null; D.ui.cmd.text = ""; D.ui.cmd.follow = null; } closeSheet(); setTimeout(() => H.cmdOpen && H.cmdOpen(), 60); }
});

// A Claude Code session from your terminal or the Claude app: what happened, and carry on from here.
SHEETS.log = function (D) {
  const l = D.ui.logData;
  if (!l) return sheetFrame("Session", "", `<div class="empty">Reading its history...</div>`);
  const foot = `<div class="chatfoot"><textarea id="logText" rows="1" dir="auto" placeholder="${D.ui.logThread ? "Reply here or in the Claude app. It's the same conversation" : "Carry on from here. It continues as a copy, your terminal session isn't touched"}"></textarea><button class="btn go" ${A("logContinue")}>Continue here</button></div>`;
  const msgs = l.messages && l.messages.length ? convHTML({ messages: l.messages, state: "done" }) : `<div class="empty">No messages found.</div>`;
  return sheetFrame(esc(l.project || "Session"), esc(l.cwd || ""), `<div class="chatwrap one"><div class="conv" id="conv">${msgs}</div></div>`, `<button class="btn sm" ${A("openSession", D.ui.logThread ? { project: l.project, app: true, id: l.id } : { project: l.project })}>Open on main screen</button>`, foot);
};

async function loadThread(id) {
  const r = await act("thread", id);
  if (r && r.thread) { D.ui.threadCache = D.ui.threadCache || {}; D.ui.threadCache[id] = r.thread; if (D.ui.threadId === id) D.ui.threadData = r.thread; }
  return r && r.thread;
}
// Keep an open chat in step with the AI as it works.
function syncThreads() {
  const list = D.threads || [];
  const want = [];
  if (D.ui.sheet === "chat" && D.ui.threadId) want.push(D.ui.threadId);
  if ((D.ui.sheet === "ask" || (D.mini && D.ui.miniAsk)) && D.ui.ask.thread) want.push(D.ui.ask.thread);
  for (const id of want) {
    const s = list.find((x) => x.id === id);
    const have = (D.ui.threadCache || {})[id];
    if (s && (!have || have.updated !== s.updated || have.state !== s.state) && !D.ui["loading" + id]) {
      D.ui["loading" + id] = true;
      loadThread(id).then(() => { D.ui["loading" + id] = false; if (D.ui.sheet === "chat" || D.ui.sheet === "ask") drawSheet(); if (D.mini) { lastAppHTML = ""; render(); } });
    }
  }
}

Object.assign(H, {
  openThread: async (id) => {
    const tv = (D.threads || []).find((t) => t.id === id);
    if (tv && tv.movedTo && tv.sid) return H.openLog(tv.sid, id);
    return H.openThreadPanel(id);
  },
  openThreadPanel: async (id) => { D.ui.threadId = id; D.ui.threadData = (D.ui.threadCache || {})[id] || null; D.ui.chatText = ""; D.ui.stick = true; openSheet("chat"); await loadThread(id); if (D.ui.sheet === "chat") drawSheet(); },
  chatSend: async () => {
    const el = $("#chatText"); const text = (el && el.value || "").trim();
    if (!text) { toast("Type a message first"); return; }
    const r = await act("threadFollow", { id: D.ui.threadId, text });
    if (r && r.error) { toast(r.error); return; }
    D.ui.chatText = ""; if (el) el.value = ""; D.ui.stick = true;
    await loadThread(D.ui.threadId); drawSheet();
  },
  chatStop: async () => { await act("threadStop", D.ui.threadId); toast("Stopping"); },
  chatMove: () => { D.ui.moveOpen = D.ui.moveOpen === D.ui.threadId ? null : D.ui.threadId; drawSheet(); },
  chatTerminal: async () => { D.ui.moveOpen = null; const r = await act("threadTerminal", D.ui.threadId); toast(r.toast || r.error); drawSheet(); },
  chatDesktop: async () => { D.ui.moveOpen = null; toast("Moving it to the Claude app..."); const r = await act("threadDesktop", D.ui.threadId); toast(r.toast || r.error); drawSheet(); },
  buildIdea: (t) => { const el = $("#buildText"); if (el) { el.value = t; el.focus(); } },
  chatDelete: async () => { if (!H.arm("del:" + D.ui.threadId)) return; await act("threadRemove", D.ui.threadId); closeSheet(); toast("Deleted"); },
  aiAction: async (id) => {
    toast(id === "screen" ? "Looking at your main screen..." : "Working on what you copied...");
    const r = await act("aiAction", { preset: id });
    if (r && r.error) { toast(r.error); return; }
    D.ui.ask.thread = r.thread; D.ui.ask.mode = "quick";
    if (D.ui.sheet !== "ask") openSheet("ask"); else drawSheet();
    await loadThread(r.thread); drawSheet();
  },
  newChat: () => { D.ui.ask.thread = null; D.ui.ask.text = ""; drawSheet(); setTimeout(() => { const t = $("#askText"); if (t) t.focus(); }, 30); },
  openLog: async (id, thread) => { D.ui.logThread = thread || null; D.ui.logData = null; openSheet("log"); const r = await act("sessionLog", id); D.ui.logData = r && r.log; D.ui.stick = true; if (D.ui.sheet === "log") drawSheet(); },
  logContinue: async () => {
    const text = (($("#logText") || {}).value || "").trim();
    if (!text) { toast("Type what to do next"); return; }
    const r = await act("continueSession", { id: D.ui.logData.id, text });
    if (r && r.error) { toast(r.error); return; }
    if (r.same) { $("#logText").value = ""; toast("Sent. The answer shows here and in the Claude app."); return; }
    H.openThread(r.thread);
  }
});
