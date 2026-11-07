// Sheets slide up over the layout for anything that needs more room, then close back.
function sheetFrame(title, sub, inner, extraHead, foot) {
  return `<div class="shade" ${A("closeSheet")}></div><div class="sheet"><div class="grab"></div><div class="head"><h2>${title}</h2>${sub ? `<span class="m" style="font-size:14px">${sub}</span>` : ""}${extraHead || ""}<button class="btn" style="margin-left:auto;height:46px" ${A("closeSheet")}>Close</button></div><div class="body">${inner}</div>${foot || ""}</div>`;
}

// downloaded voices: what, how big, from where; they run on this PC and nothing is sent anywhere
function voicesHTML(D) {
  const v = D.voices; if (!v) return "";
  const st = { waiting: "Waiting", downloading: "Downloading", paused: "Paused while you play or talk", unpacking: "Setting up", done: "Ready", failed: "Failed" };
  const row = (x) => {
    const j = x.job;
    const right = j && j.state !== "failed" ? `<span class="m" style="font-size:14px">${esc(st[j.state] || "")}${j.state === "downloading" ? " " + j.pct + "%" : ""}</span>`
      : x.installed ? `<button class="btn sm" ${A("voiceRemove", x.id)}>Remove</button>`
      : x.tooHeavy ? `<span class="m" style="font-size:13px">Too heavy for this PC</span>`
      : `<button class="btn sm" ${A("voiceInstall", x.id)}>Add (${x.mb} MB)</button>`;
    const sub = (j && j.state === "failed" ? "Didn't finish: " + j.error + " " : "") + x.what + (x.installed ? " On this PC." : "");
    return `<div class="setrow"><span style="min-width:0">${esc(x.label)}<span class="sub">${esc(sub)}</span></span>${right}</div>`;
  };
  const status = v.lastError ? `<div class="setrow"><span style="color:var(--bad)">The natural voice didn't play: ${esc(v.lastError.plain)}<span class="sub">Blink used the Windows voice instead. The details are in voice-log.txt.</span></span><button class="btn sm" ${A("voiceLog")}>Show details</button></div>` : v.lastOk ? `<div class="setrow"><span>The natural voice is working<span class="sub">Last line took ${(v.lastOk.ms / 1000).toFixed(1)} s to prepare</span></span></div>` : "";
    return status + `<div class="setrow"><span>Test the voice<span class="sub">Plays one sentence with the voice Blink uses</span></span><button class="btn sm go" ${A("voiceTest")}>Play</button></div><div class="setrow"><span>Voices<span class="sub">Blink's natural voice downloads once by itself (about 60 MB, from GitHub) and runs on this PC only. Downloads pause during games and calls; the voice only runs while Blink is talking.</span></span></div>${v.voices.map(row).join("")}`;
}
function routinesHTML(D) {
  const rs = D.cfg.routines || [];
  const when = (w) => (w.type === "game" ? "When a game starts" : w.type === "layout" ? "When " + w.value + " turns on" : w.type === "focus" ? "When Focus starts" : "Every day at " + w.value);
  return `<div class="card" style="gap:8px"><b>Routines</b>${rs.map((r) => `<div class="setrow" style="min-height:44px"><span style="min-width:0">${esc(when(r.when))}<span class="sub ell">${esc(r.steps.join(", then "))}</span></span><span style="display:flex;gap:6px;align-items:center"><button class="sw${r.on ? " on" : ""}" ${A("routineToggle", r.id)} aria-label="On or off"></button><button class="ic sm" ${A("routineRemove", r.id)} aria-label="Remove">${svg("x", 16, 2.4)}</button></span></div>`).join("") || `<span class="m" style="font-size:14px">None yet.</span>`}<span class="m" style="font-size:13px">Tell Blink, for example: When I start a game, set volume 40 and open Discord</span></div>`;
}
const SHEETS = {
  sessions(D) {
    const c = D.claude || { sessions: [], approvals: [] };
    const ss = c.sessions.filter((s) => !(D.ui.hiddenSessions || []).includes(s.id));
    const cards = ss.map((s) => {
      const [col, label] = STATE[s.state] || ["var(--mute)", s.state];
      const ap = c.approvals.find((a) => a.sessionId === s.id);
      const left = s.plan.filter((p) => p.status !== "completed").map((p) => p.text);
      const acts = ap
        ? `<button class="btn sm go" ${A("approve", { id: ap.id, decision: "allow" })}>Allow once</button><button class="btn sm" ${A("approve", { id: ap.id, decision: "deny" })}>Deny</button><button class="btn sm" ${A("approve", { id: ap.id, decision: null })}>Answer in terminal</button>`
        : s.source === "panel" ? `<button class="btn sm go" ${A("openThread", s.threadId)}>Open</button>${s.state !== "working" && s.state !== "waiting" ? `<button class="btn sm" ${A("hideSession", s.id)}>Hide</button>` : ""}`
        : `${s.source === "log" || s.source === "hook" ? `<button class="btn sm go" ${A("openLog", s.id)}>See it and reply</button>` : ""}<button class="btn sm" ${A("openSession", { project: s.project, app: /app/.test(s.provider), browser: s.source === "web" })}>Open on main screen</button>${s.summary && s.source !== "web" ? `<button class="btn sm" ${A("copy", s.summary)}>Copy summary</button>` : ""}${s.state !== "working" ? `<button class="btn sm" ${A("hideSession", s.id)}>Hide</button>` : ""}${s.source === "log" && s.state === "waiting" && !D.hooks.user ? `<span class="m" style="font-size:12px;align-self:center">Connect Claude Code to approve from here</span>` : ""}`;
      return `<div class="card${s.state === "waiting" ? " need" : ""}">
        <div style="display:flex;align-items:center;gap:10px">${s.source === "web" && !/Claude/.test(s.provider) ? `<span style="width:46px;display:flex;justify-content:center">${svg(/ChatGPT/.test(s.provider) ? "gpt" : "gem", 30)}</span>` : companion(D.cfg.companion, 46, s.state === "waiting" ? "asking" : s.state === "working" ? "working" : "done")}<div style="min-width:0"><div style="font-size:19px;font-weight:700">${esc(s.project)}</div><div class="m" style="font-size:13px">${esc(s.provider)}. Active ${ago(s.updated)}${ago(s.updated) === "now" ? "" : " ago"}${s.files ? ". " + s.files + (s.files === 1 ? " file" : " files") + " changed" : ""}</div></div><span style="margin-left:auto;font-size:14px;font-weight:700;color:${col}">${label}</span></div>
        ${s.ask ? `<div class="m" style="font-size:14px">You asked: ${esc(s.ask)}</div>` : ""}
        <div style="font-size:16px;line-height:1.35">${esc((s.state === "yourturn" || s.state === "done") && s.summary ? s.summary : s.now)}</div>
        ${ap ? `<div class="m" style="font-size:14px;font-family:Consolas,monospace;word-break:break-all">${esc(ap.detail)}</div>` : ""}
        ${s.total ? `<div style="display:flex;align-items:center;gap:10px"><span class="bar"><i style="width:${100 * s.done / s.total}%"></i></span><span class="n" style="font-size:17px">${s.done} of ${s.total}</span></div>${left.length ? `<div class="m" style="font-size:13px">Left: ${esc(left.slice(0, 3).join(", "))}</div>` : ""}` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto">${acts}</div>
      </div>`;
    }).join("");
    const chats = (D.threads || []).filter((t) => t.kind === "chat" && t.state !== "running");
    const chatList = chats.length ? `<div style="margin-top:18px"><span class="m" style="font-size:14px;font-weight:600">Recent chats on the panel</span><div style="display:flex;flex-direction:column;margin-top:6px">${chats.slice(0, 8).map((t) => `<button class="row" ${A("openThread", t.id)}>${svg("claude", 20)}<span class="grow"><b class="ell">${esc(t.title)}</b><span class="ell m" style="font-size:13px">${esc(t.summary)}</span></span><span class="t">${ago(t.updated)}</span></button>`).join("")}</div><span class="m" style="font-size:12px">Chats stay until the panel restarts.</span></div>` : "";
    const empty = `<div class="empty" style="font-size:17px">No AI sessions right now. ${D.hooks.user ? "Start one with New task, or from your terminal." : D.providers.some((p) => p.id === "claude-code") ? "Connect Claude Code in Settings to see its sessions here." : ""}</div>`;
    return sheetFrame("AI sessions", D.web && D.web.paired ? "Claude Code and your browser AI tabs." : "Live status works with Claude Code. Add the browser link in Settings for claude.ai and ChatGPT.", (ss.length ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">${cards}</div>` : empty) + chatList, `<button class="btn" style="height:46px" ${A("sheet", "ask")}>${svg("plus", 18)}New task</button>`);
  },

  ask(D) {
    const u = D.ui.ask;
    const provs = D.providers.filter((p) => u.mode === "task" ? p.caps.task || p.kind === "web" : p.caps.ask);
    if (!provs.find((p) => p.id === u.provider)) u.provider = (provs[0] || {}).id;
    const p = provs.find((x) => x.id === u.provider) || {};
    const projects = (D.cfg.projects || []);
    const projRow = u.mode === "task" && p.kind === "cli" ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="m" style="font-size:14px;font-weight:600">Folder</span>${projects.map((d) => `<button class="btn sm" style="${u.dir === d ? "box-shadow:inset 0 0 0 2px var(--live)" : ""}" ${A("askDir", d)}>${esc(d.split(/[\\/]/).pop())}</button>`).join("")}<button class="btn sm" ${A("pickFolder")}>${svg("folder", 16)}${u.dir && !projects.includes(u.dir) ? esc(u.dir.split(/[\\/]/).pop()) : "Pick a folder"}</button></div>` : "";
    const inPanel = p.id === "claude-code" || p.id === "codex";
    const hint = p.kind === "web" ? "Opens on your main screen with your words filled in. Nothing is kept here."
      : u.mode === "task" ? (inPanel ? "It works on this PC. You see every step, and it asks you before it changes anything." : "Opens a new session on your main screen with this already sent.")
      : inPanel ? "Blink answers here. It won't change anything on your PC." : "Blink answers here.";
    const th = u.thread && (D.ui.threadCache || {})[u.thread];
    const taskOpts = u.mode === "task" && inPanel ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><div class="seg"><button class="${u.taskMode !== "edit" ? "on" : ""}" ${A("askTaskMode", "ask")}>Ask me before changes</button><button class="${u.taskMode === "edit" ? "on" : ""}" ${A("askTaskMode", "edit")}>Change files without asking</button></div><button class="btn sm" ${A("askSendTerminal")}>${svg("term", 16)}Use a terminal instead</button></div>` : "";
    const answer = th ? `<div class="conv mini" id="conv">${convHTML(th)}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${lastAnswer(th) ? `<button class="btn sm" ${A("copy", lastAnswer(th))}>Copy answer</button>` : ""}<button class="btn sm" ${A("openThread", th.id)}>Full screen</button><button class="btn sm" ${A("newChat")}>${svg("plus", 16)}New chat</button><button class="btn sm" ${A("askToTask")}>Do it on this PC</button></div>`
      : u.busy ? `<div class="answer m">Thinking...</div>` : u.answer ? `<div class="answer">${esc(u.answer)}</div><div style="display:flex;gap:8px"><button class="btn sm" ${A("copy", u.answer)}>Copy</button><button class="btn sm" ${A("askToTask")}>Turn into a task</button></div>` : u.error ? `<div class="answer" style="color:var(--bad)">${esc(u.error)}</div>` : "";
    const quickActs = !th && u.mode === "quick" && inPanel ? `<div class="m" style="font-size:13px;font-weight:600">Or one tap</div>${aiActionsHTML(true)}` : "";
    return sheetFrame("Ask Blink", "", `
      <div style="display:grid;grid-template-columns:170px minmax(0,1fr);gap:22px">
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px">${companion(D.cfg.companion, 140, u.recording ? "asking" : u.busy ? "working" : "idle")}
          <button class="btn${u.recording ? " warn" : ""}" style="width:160px;height:72px;flex-direction:column;gap:2px;font-size:14px" ${A("voice")}>${svg("mic", 24)}${u.recording ? "Listening. Tap to stop" : "Tap to talk"}</button>
          <span class="m" style="font-size:13px;text-align:center">${D.voice ? "Speech becomes text on this PC. You check it first." : "No speech-to-text found. Press Windows key + H in the box to dictate."}</span></div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><div class="seg"><button class="${u.mode === "quick" ? "on" : ""}" ${A("askMode", "quick")}>Just answer</button><button class="${u.mode === "task" ? "on" : ""}" ${A("askMode", "task")}>Do it on this PC</button></div>
          <div class="seg">${provs.map((x) => `<button class="${x.id === u.provider ? "on" : ""}" ${A("askProvider", x.id)}>${esc(x.name)}</button>`).join("")}</div></div>
          <textarea id="askText" rows="${th ? 2 : 3}" placeholder="${th ? (th.state === "running" ? "Type your next question" : "Ask more about this") : u.mode === "task" ? "Describe the task" : "Type a question"}">${esc(u.text)}</textarea>
          ${projRow}${taskOpts}
          <div style="display:flex;gap:10px;align-items:center"><button class="btn go" ${A("askSend")}${u.busy || (th && th.state === "running") ? " disabled" : ""}>${th ? "Send" : u.mode === "task" ? (inPanel ? "Start task" : "Open on main screen") : p.kind === "web" ? "Open on main screen" : "Ask"}</button><span class="m" style="font-size:13px">${hint}</span></div>
          ${answer}${quickActs}
        </div></div>`);
  },

  layouts(D) {
    const sel = D.ui.layoutSel || D.cfg.activeLayout;
    const L = D.cfg.layouts.find((x) => x.name === sel) || D.cfg.layouts[0];
    const ruleRow = (r, i) => {
      const label = r.type === "fullscreen" ? "A game or app goes full screen" : r.type === "pc" ? "This PC is " + r.host : r.type === "time" ? "Time is " + r.from + " to " + r.to : r.type;
      const step = (which) => `<span style="display:inline-flex;align-items:center;gap:2px"><button class="ic" style="width:40px;height:40px" ${A("ruleTime", { layout: L.name, i, which, delta: -30 })} aria-label="Earlier">-</button><span class="n" style="font-size:20px;min-width:58px;text-align:center">${esc(r[which])}</span><button class="ic" style="width:40px;height:40px" ${A("ruleTime", { layout: L.name, i, which, delta: 30 })} aria-label="Later">+</button></span>`;
      if (r.type === "time") return `<div class="setrow"><span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">From ${step("from")} to ${step("to")}</span><span style="display:flex;gap:8px;align-items:center"><button class="sw${r.on ? " on" : ""}" ${A("ruleToggle", { layout: L.name, i })} aria-label="Rule on or off"></button><button class="ic" style="width:40px;height:40px" ${A("ruleRemove", { layout: L.name, i })} aria-label="Remove rule">${svg("x", 16)}</button></span></div>`;
      return `<div class="setrow"><span>${esc(label)}</span><span style="display:flex;gap:8px;align-items:center"><button class="sw${r.on ? " on" : ""}" ${A("ruleToggle", { layout: L.name, i })} aria-label="Rule on or off"></button><button class="ic" style="width:40px;height:40px" ${A("ruleRemove", { layout: L.name, i })} aria-label="Remove rule">${svg("x", 16)}</button></span></div>`;
    };
    return sheetFrame("Layouts", "Rules can switch layouts for you. Picking one by hand keeps it until a rule changes.", `
      <div style="display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px">
        <div style="display:flex;flex-direction:column;gap:6px">${D.cfg.layouts.map((x) => `<button class="row" style="padding:8px 10px;border-radius:10px;border:0;${x.name === sel ? "background:var(--key)" : ""}" ${A("layoutSel", x.name)}>${svg("layers", 20)}<span class="grow"><b>${esc(x.name)}</b><span class="m" style="font-size:13px">${x.name === D.cfg.activeLayout ? "Showing now" : ((n) => (n === 0 ? "No rules" : n === 1 ? "1 rule" : n + " rules"))((x.rules || []).filter((r) => r.on).length)}</span></span></button>`).join("")}
          <button class="btn sm" style="margin-top:6px" ${A("layoutNew")}>${svg("plus", 16)}New layout</button>
          ${D.ui.tplPick ? `<div class="tplpick"><span class="m" style="font-size:13px;font-weight:600">Start from</span>${(D.ui.templates || []).map((t) => `<button class="row" ${A("layoutTpl", t.id)}><span class="grow"><b>${esc(t.name)}</b><span class="m" style="font-size:12px">${esc(t.desc)}</span></span></button>`).join("")}<button class="row" ${A("layoutTpl", "blank")}><span class="grow"><b>Blank</b><span class="m" style="font-size:12px">Add widgets yourself</span></span></button></div>` : ""}</div>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="font-size:22px;font-weight:700">${esc(L.name)}</span><button class="btn sm go" ${A("setLayout", L.name)}>Show it now</button><button class="btn sm" ${A("editLayout", L.name)}>${svg("edit", 16)}Edit widgets</button>${D.cfg.layouts.length > 1 ? `<button class="btn sm${D.ui.armed === "del:" + L.name ? " warn" : ""}" style="margin-left:auto" ${A("layoutDelete", L.name)}>${D.ui.armed === "del:" + L.name ? "Tap again to delete" : "Delete"}</button>` : ""}</div>
          ${routinesHTML(D)}
          <span class="m" style="font-size:14px;font-weight:600">Switch to ${esc(L.name)} when</span>
          ${(L.rules || []).map(ruleRow).join("") || `<div class="empty">No rules. It only shows when you pick it.</div>`}
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" ${A("ruleAdd", { layout: L.name, type: "fullscreen" })}>+ Full-screen game</button><button class="btn sm" ${A("ruleAdd", { layout: L.name, type: "pc" })}>+ This PC (${esc(D.host)})</button><button class="btn sm" ${A("ruleAdd", { layout: L.name, type: "time" })}>+ Time of day</button></div>
          <span class="m" style="font-size:14px;font-weight:600;margin-top:8px">Start again from a template</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${["Developer", "Gamer", "Office", "Creator", "Focus"].map((t) => `<button class="btn sm${D.ui.armed === "tpl:" + L.name + ":" + t ? " warn" : ""}" ${A("applyTemplate", { layout: L.name, template: t })}>${D.ui.armed === "tpl:" + L.name + ":" + t ? "Tap again: replaces widgets" : t}</button>`).join("")}</div>
        </div></div>`);
  },

  settings(D) {
    const c = D.cfg;
    const sw = (key, on, label, sub) => `<div class="setrow"><span>${label}${sub ? `<span class="sub">${sub}</span>` : ""}</span><button class="sw${on ? " on" : ""}" ${A("setFlag", key)} aria-label="${esc(label)}"></button></div>`;
    const seg = (key, val, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${val === v ? "on" : ""}" ${A("setVal", { key, val: v })}>${l}</button>`).join("")}</div>`;
    const conn = D.providers.map((p) => `<div class="setrow"><span>${esc(p.name)}<span class="sub">${p.kind === "web" ? "Opens in your browser with your words filled in" : [p.caps.status ? "live status" : "", p.caps.approvals ? "approvals" : "", p.caps.ask ? "quick answers" : "", p.caps.task ? "new tasks" : ""].filter(Boolean).join(", ")}</span></span><span style="font-weight:700;color:${p.level === "Full" ? "var(--ok)" : p.level === "Partial" ? "var(--live)" : "var(--mute)"}">${p.level}</span></div>`).join("");
    const cc = D.providers.find((p) => p.id === "claude-code");
    const speak = c.replyWork === "listen" ? "always" : c.replyHome === "read" ? "never" : "home";
    const update = ((u) => `<div class="setrow"><span>Side Panel ${esc(D.version || "")}<span class="sub">${!u || u.status === "off" ? "Installed on this PC" : u.status === "available" ? u.latest + " is ready" : u.status === "downloading" ? "Downloading " + (u.progress || 0) + "%" : u.status === "installing" ? "Installing. It restarts by itself" : u.status === "current" ? "Up to date" : u.status === "checking" ? "Checking..." : u.status === "error" ? u.error : ""}</span></span>${u && u.status === "available" ? `<button class="btn sm go" ${A("updateNow")}>Update</button>` : u && u.status !== "off" && !["downloading", "installing", "checking"].includes(u.status) ? `<button class="btn sm" ${A("updateCheck")}>Check</button>` : ""}</div>`)(D.update);
    const head = (t) => `<span class="m" style="font-size:14px;font-weight:600;display:block;margin-top:6px">${t}</span>`;
    // the few things most people change
    const basics = `
      <div class="setcols">
        <div>
          <div class="setrow"><span>Your name<span class="sub">Blink uses it now and then</span></span><span style="display:flex;gap:6px"><input type="text" id="setName" dir="auto" maxlength="30" value="${esc(c.userName || "")}" placeholder="Your first name" style="height:40px;width:150px;font-size:15px"><button class="btn sm" ${A("setNameSettings")}>Save</button></span></div>
          <div class="setrow"><span>Theme</span>${seg("theme", c.theme, [["light", "Light"], ["dark", "Dark"], ["auto", "Auto"]])}</div>
          <div class="setrow"><span>Companion<span class="sub">The character that talks to you</span></span>${seg("companion", c.companion || "blink", [["blink", "Blink"], ["pip", "Pip"], ["clawd", "Clawd"], ["none", "None"]])}</div>
          <div class="setrow"><span>Blink reads answers aloud<span class="sub">${D.voices && D.voices.lastError ? "Natural voice didn't play: " + esc(D.voices.lastError.plain) : D.voices && (D.voices.voices || []).some((x) => x.id === "en" && x.installed) ? "Natural voice ready. Never in meetings, Focus or games" : "Natural voice is downloading. Never in meetings, Focus or games"}</span></span><button class="btn sm" style="margin-right:8px" ${A("voiceTest")}>Test</button><div class="seg">${[["never", "Never"], ["home", "At home"], ["always", "Home and work"]].map(([v, l]) => `<button class="${speak === v ? "on" : ""}" ${A("setSpeak", v)}>${l}</button>`).join("")}</div></div>
          <div class="setrow"><span>Screen<span class="sub">${D.sideScreen ? "On its own screen" : "Running as a window"}</span></span><button class="btn sm" ${A("sheet", "screens")}>Change</button></div>
          ${D.canMini ? `<div class="setrow"><span>Mini panel on top<span class="sub">Small, in a corner, never takes focus</span></span><button class="sw${D.mini ? " on" : ""}" ${A(D.mini ? "expand" : "shrink")} aria-label="Mini panel on top"></button></div>` : ""}
        </div>
        <div>
          ${cc ? `<div class="setrow"><span>Claude Code<span class="sub">${D.hooks.user === "stale" ? "Needs reconnecting: updates are being refused" : D.hooks.user ? "Connected. Sessions and approvals show live" : "Not connected. Connect to see it live and approve from here (your settings are backed up first)"}</span></span>${D.hooks.user === true ? `<button class="btn sm" ${A("disconnectClaude")}>Disconnect</button>` : `<button class="btn sm go" ${A("connectClaude")}>${D.hooks.user === "stale" ? "Reconnect" : "Connect"}</button>`}</div>` : ""}
          ${D.providers.some((p) => p.kind === "cli") ? sw("approvalsFromPanel", c.approvalsFromPanel, "Approve from the panel", "Never approves on its own") : ""}
          ${cc ? sw("autoDesktop", c.autoDesktop !== false, "Open finished tasks in the Claude app", "Keep going there or here, it's the same conversation") : ""}
          ${cc || D.providers.some((p) => p.id === "codex") ? `<div class="setrow"><span>AI on the panel<span class="sub">Model for chats and tasks</span></span>${seg("aiModel", c.aiModel && c.aiModel !== "default" ? c.aiModel : "sonnet", [["haiku", "Fast"], ["sonnet", "Balanced"], ["opus", "Best"]])}</div>` : ""}
          ${update}
        </div>
      </div>`;
    // everything else, one tap away
    const more = !D.ui.setMore ? `<button class="btn" style="align-self:flex-start;margin-top:12px" ${A("setMore")}>More settings ${svg("chev", 14)}</button>` : `
      <div class="setcols" style="margin-top:14px">
        <div>${head("Look and sound")}
          ${(c.companion || "blink") === "blink" ? `<div class="setrow"><span>Blink's bubbles<span class="sub">Short notes when something changes</span></span>${seg("companionTalk", c.companionTalk || "all", [["all", "All"], ["important", "Important"], ["off", "Off"]])}</div>` : ""}
          ${sw("quotes", c.quotes, "Daily quote", "Add the Quote widget to any layout. Tap it for another")}
          ${c.quotes ? sw("quoteInClock", c.quoteInClock !== false, "Quote under the clock", "When the clock has room") : ""}
          ${sw("chime", c.chime !== false, "Chime when AI needs you")}
          ${sw("ambient", c.ambient !== false, "Calm screen when you're away", "After " + (c.ambientAfterMin || 5) + " min idle")}
          ${sw("lyrics", c.lyrics !== false, "Song lyrics", "Looks up the song name on lrclib.net")}
          ${sw("startWithWindows", c.startWithWindows, "Start with Windows")}
          ${D.canMini ? `<div class="setrow"><span>Mini shows<span class="sub">${c.miniFollow === false ? "Your pick" : "Follows the layout: Work shows Focus and meetings, Gaming shows game stats"}</span></span><button class="sw${c.miniFollow === false ? "" : " on"}" ${A("miniFollow")} aria-label="Follow the layout"></button></div>
          ${c.miniFollow === false ? `<div class="chips" style="padding:8px 0">${MINI_PARTS.map(([k, l]) => `<button class="btn sm${miniParts().includes(k) ? " go" : ""}" ${A("miniPart", k)}>${l}</button>`).join("")}</div>` : ""}` : ""}
        </div>
        <div>${head("Blink")}
          ${sw("autoQuiet", c.autoQuiet !== false, "Stay quiet when it's awkward", "At work, in meetings, Focus and games")}
          ${sw("brief", c.brief !== false, "Morning brief", "Once a day, the first time you look")}
          ${sw("appChips", c.appChips !== false, "Suggestions for the app you're using")}
          <div class="setrow"><span>Music<span class="sub">Where "play ..." plays. Automatic uses the music app on this PC</span></span>${seg("musicSource", c.musicSource || "auto", [["auto", "Automatic"], ["spotify", "Spotify"], ["ytmusic", "YouTube Music"], ["apple", "Apple Music"]])}</div>
          <div class="setrow"><span>Apps Blink can use<span class="sub">${Object.keys(c.appAllow || {}).length ? "Tap one to take it back" : "Blink asks the first time it needs an app"}</span></span></div>
          ${Object.keys(c.appAllow || {}).length ? `<div class="chips" style="padding:0 0 8px">${Object.keys(c.appAllow).map((k) => `<button class="btn sm" ${A("appForget", k)} aria-label="Stop Blink using ${esc(k)}">${esc(k)} ${svg("x", 12)}</button>`).join("")}</div>` : ""}
          <div class="setrow"><span>Microphone<span class="sub">Only records after you tap it. Stops after 30 seconds</span></span></div>
          ${voicesHTML(D)}
        </div>
        <div>${head("AI and work")}
          ${sw("holdInGame", c.holdInGame, "Hold AI updates in games")}
          ${sw("hideMeetingTitles", c.hideMeetingTitles, "Hide meeting titles", "Shows Busy instead")}
          <div class="setrow"><span>Browser AI tabs<span class="sub">${D.web && D.web.paired ? "Connected. claude.ai, ChatGPT and Gemini tabs show when they finish" : "See when claude.ai or ChatGPT finishes a reply"}</span></span><button class="btn sm${D.web && D.web.paired ? "" : " go"}" ${A("sheet", "browser")}>${D.web && D.web.paired ? "Details" : "Set up"}</button></div>
          <div class="setrow"><span>Build a widget<span class="sub">Say what you want; Claude builds it here</span></span><button class="btn sm" ${A("sheet", "build")}>${svg("wand", 16)}Build</button></div>
          ${head("AI tools found on this PC")}${conn}
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" ${A("rediscover")}>Look again</button><button class="btn sm" ${A("sheet", "setup")}>Run setup again</button></div>
        </div>
      </div>`;
    return sheetFrame("Settings", "", `<div style="display:flex;flex-direction:column">${basics}${more}<button class="btn sm quit" style="margin-top:24px;align-self:flex-start" ${A("quit")}>Quit Side Panel</button></div>`);
  },

  music(D) {
    const ss = (D.live.media && D.live.media.sessions) || [];
    const cur = curMedia(D);
    const a = D.live.audio || { volume: 0, apps: [] };
    const pl = D.cfg.playlists || [];
    const big = cur && imgSrc(cur.art) ? `<img src="${imgSrc(cur.art)}" style="width:200px;height:200px;border-radius:12px;object-fit:cover" alt="Album cover">` : `<span style="width:200px;height:200px;border-radius:12px;background:var(--rule);display:flex;align-items:center;justify-content:center">${svg("music", 70)}</span>`;
    const pct = cur && cur.dur > 0 ? Math.min(100, 100 * cur.pos / cur.dur) : 0;
    const now = cur ? `<div style="display:flex;gap:20px;align-items:center">${big}<div style="min-width:0;flex:1 1 auto;display:flex;flex-direction:column;gap:10px"><div style="font-size:26px;font-weight:700;line-height:1.2">${esc(cur.title || "Unknown")}</div><div class="m" style="font-size:17px">${esc([cur.artist, cur.album].filter(Boolean).join(". "))}</div><div class="m" style="font-size:14px">From ${esc(cur.name)}</div>${cur.dur > 0 ? `<div style="display:flex;align-items:center;gap:8px"><span class="n m" style="font-size:15px">${mmss(cur.pos)}</span><span class="bar" style="height:6px"><i style="width:${pct}%"></i></span><span class="n m" style="font-size:15px">${mmss(cur.dur)}</span></div>` : ""}<div style="display:flex;gap:14px;align-items:center"><button class="ic" ${A("media", { action: "prev", app: cur.app })} aria-label="Previous">${svg("prev", 24)}</button><button class="ic big" ${A("media", { action: "toggle", app: cur.app })} aria-label="Play or pause">${svg(cur.playing ? "pause" : "pp", 28, 2.2)}</button><button class="ic" ${A("media", { action: "next", app: cur.app })} aria-label="Next">${svg("next", 24)}</button></div></div></div>` : `<div class="empty" style="font-size:17px">Nothing is playing. Tap a playlist, or start music in any app.</div>`;
    const sources = ss.length ? ss.map((s) => `<button class="row${cur && s.app === cur.app ? " sel" : ""}" style="padding:10px;border-radius:10px" ${A("mediaSource", s.app)}>${imgSrc(s.art) ? `<img src="${imgSrc(s.art)}" style="width:40px;height:40px;border-radius:6px;object-fit:cover" alt="">` : svg("music", 22)}<span class="grow"><b>${esc(s.name)}</b><span class="m" style="font-size:13px">${esc(s.title || "")}${s.artist ? ". " + esc(s.artist) : ""}</span></span><span style="font-size:13px;font-weight:700;color:${s.playing ? "var(--ok)" : "var(--mute)"}">${s.playing ? "Playing" : "Paused"}</span></button>`).join("") : `<div class="empty">No app is playing right now.</div>`;
    const vols = (a.apps || []).slice(0, 6).map((x) => `<label style="display:grid;grid-template-columns:110px 1fr 34px;align-items:center;gap:8px;font-size:14px"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(prettyProc(x.name))}</span><input type="range" min="0" max="100" value="${x.volume}" data-range="app" data-pid="${x.pid}"><span class="n" style="font-size:17px;text-align:right">${x.volume}</span></label>`).join("");
    const list = pl.map((p) => `<div class="row" style="padding:6px 8px;border-radius:10px"><button class="plain grow" style="display:flex;gap:10px;align-items:center;text-align:left;min-height:44px" ${A("playlist", p.id)}>${svg("pp", 20)}<span><b>${esc(p.label)}</b><span class="m" style="font-size:13px;display:block">${esc(p.kindLabel || "")}</span></span></button><button class="ic" style="width:44px;height:44px" ${A("removePlaylist", p.id)} aria-label="Remove ${esc(p.label)}">${svg("x", 16, 2.4)}</button></div>`).join("");
    const u = D.ui.pl || {};
    const add = `<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px"><input type="text" id="plUrl" placeholder="Paste a playlist link (Spotify, YouTube Music, any site)" value="${esc(u.url || "")}"><div style="display:flex;gap:8px"><input type="text" id="plName" placeholder="Name (optional)" value="${esc(u.name || "")}" style="flex:1 1 auto"><button class="btn go" ${A("addPlaylist")}>Add</button></div><span class="m" style="font-size:12px">Tip: drag a playlist link from your browser onto this screen.</span></div>`;
    return sheetFrame("Music", "", `<div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:26px"><div style="display:flex;flex-direction:column;gap:18px">${now}<div><span class="m" style="font-size:14px;font-weight:600">Playing from</span><div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${sources}</div></div>${vols ? `<div style="display:flex;flex-direction:column;gap:8px"><span class="m" style="font-size:14px;font-weight:600">App volume</span>${vols}</div>` : ""}</div><div><span class="m" style="font-size:14px;font-weight:600">Your playlists</span><div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${list || `<div class="empty">No playlists yet.</div>`}</div>${add}</div></div>`);
  },

  browser(D) {
    const w = D.web || {};
    const st = !w.listening ? `<span style="color:var(--wait);font-weight:700">The panel's browser port is busy. Restart the panel.</span>` : w.paired ? `<span style="color:var(--ok);font-weight:700">Connected.${w.tabs ? " " + w.tabs + " AI tab" + (w.tabs > 1 ? "s" : "") + " open." : ""}</span>` : `<span class="m">Not connected yet.</span>`;
    const step = (n, t, extra) => `<div style="display:flex;gap:14px;align-items:flex-start"><span class="n" style="font-size:26px;width:30px">${n}</span><div style="flex:1 1 auto;font-size:17px;line-height:1.45">${t}${extra ? `<div style="margin-top:8px">${extra}</div>` : ""}</div></div>`;
    const b = D.browsers || {};
    const started = D.ui.linkSetup;
    const btns = `<div style="display:flex;gap:10px;flex-wrap:wrap">${b.chrome ? `<button class="btn go" ${A("setupLink", "chrome")}>${svg("globe", 18)}Set up in Chrome</button>` : ""}${b.edge ? `<button class="btn${b.chrome ? "" : " go"}" ${A("setupLink", "edge")}>${svg("globe", 18)}Set up in Edge</button>` : ""}${!b.chrome && !b.edge ? `<span class="empty">Chrome or Edge isn't installed.</span>` : ""}</div>`;
    const name = started === "edge" ? "edge://extensions" : "chrome://extensions";
    return sheetFrame("Browser AI tabs", "For claude.ai, chatgpt.com and Gemini in Chrome or Edge.", `<div style="display:flex;flex-direction:column;gap:18px;max-width:860px">${st}
      ${w.paired ? "" : btns}
      ${started && !w.paired ? `<div class="card" style="gap:14px"><b style="font-size:18px">Two clicks on your main screen and it's done</b>
        ${step(1, `In the extensions page that just opened, switch on <b>Developer mode</b> (top right).`, `<span class="m" style="font-size:13px">Didn't open? Type ${name} in the address bar.</span>`)}
        ${step(2, `Drag the <b>Side Panel link</b> folder from the Explorer window onto that page.`, `<span class="m" style="font-size:13px">Or click <b>Load unpacked</b> and paste the folder path, it's already copied.</span>`)}
        <span class="m" style="font-size:14px">It connects by itself; no need to click anything else. This screen turns green when it's linked.</span></div>` : ""}
      ${w.paired ? "" : `<div class="m" style="font-size:13px;line-height:1.5">Why two clicks: Chrome and Edge only let add-ons from their stores install silently on a personal PC, even with admin rights.</div>`}
      <div class="m" style="font-size:14px;line-height:1.5">What it sends: the tab title and whether a reply is being written. Never your messages. It only talks to this PC. Sites change their pages, so if a tab stops showing, the extension may need an update.</div></div>`);
  },

  screens(D) {
    const ds = D.ui.displays || [];
    const here = D.sideScreen ? "screen" : D.mini ? "mini" : "window";
    const opt = (id, icon, title, sub, on) => `<button class="row${on ? " sel" : ""}" style="padding:10px;border-radius:10px" ${A("moveToDisplay", id)}>${svg(icon, 22)}<span class="grow"><b>${title}</b><span class="m" style="font-size:13px">${sub}</span></span>${on ? "<b>Now</b>" : ""}</button>`;
    return sheetFrame("Where the panel lives", "Change it any time.", `<div style="display:flex;flex-direction:column;gap:8px;max-width:720px">${opt("window", "monitor", "A normal window", "Move and size it like any app.", here === "window")}${opt("mini", "shrink", "Mini, in a corner", "Small and always on top. Expand it any time.", here === "mini")}<span class="m" style="font-size:13px;margin-top:6px">Or full screen on a screen (best for a small touch screen):</span>${ds.map((d) => `<button class="row" style="padding:10px;border-radius:10px" ${A("moveToDisplay", d.id)}>${svg("monitor", 22)}<span class="grow"><b>${esc(d.label)}</b><span class="m" style="font-size:13px">${d.w} x ${d.h}${d.primary ? ". Main screen" : ""}${d.touch === "available" ? ". Touch" : ""}</span></span></button>`).join("") || `<div class="empty">Looking for screens...</div>`}</div>`);
  },

  addKey(D) {
    const u = D.ui.addKey;
    const tabs = [["apps", "Apps"], ["people", "People"], ["links", "Links"], ["shortcuts", "Shortcuts"], ["folder", "Folders"], ["games", "Games"], ["outlook", "Outlook"], ["ai", "AI"], ["combo", "Combo"], ["inapps", "In apps"], ["actions", "Actions"]];
    let inner = "";
    if (typeof KEY_TABS !== "undefined" && KEY_TABS[u.tab]) inner = KEY_TABS[u.tab](D);
    else if (u.tab === "apps") {
      const q = (u.q || "").toLowerCase();
      const list = (D.ui.apps || []).filter((a) => !q || a.name.toLowerCase().includes(q)).slice(0, 48);
      Icons.want(list);
      inner = `<input type="text" id="appSearch" placeholder="Search your apps" value="${esc(u.q || "")}"><div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-top:12px">${list.map((a) => `<button class="tile" ${A("pickKey", { label: a.name, action: { type: "app", appId: a.appId, path: a.path }, iconFrom: a.iconFrom })}>${a.icon ? `<img src="${a.icon}" alt="">` : svg(guessGlyph(a.name), 26)}<span class="l">${esc(a.name)}</span></button>`).join("") || `<div class="empty">Loading apps...</div>`}</div>`;
    } else if (u.tab === "games") {
      inner = `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">${(D.ui.games || []).map((g) => `<button class="tile" ${A("pickKey", { label: g.name, action: { type: "game", target: g.url }, glyph: "game" })}>${svg("game", 26)}<span class="l">${esc(g.name)}</span></button>`).join("") || `<div class="empty">No Steam or Epic games found.</div>`}</div>`;
    } else if (u.tab === "web") {
      inner = `<div style="display:flex;flex-direction:column;gap:10px;max-width:720px"><input type="text" id="webUrl" placeholder="Web address, like youtube.com"><input type="text" id="webName" placeholder="Name on the key"><button class="btn go" style="align-self:flex-start" ${A("pickWeb")}>Add key</button></div>`;
    } else if (u.tab === "folder") {
      inner = `<div style="display:flex;flex-direction:column;gap:10px;max-width:720px"><span class="empty">Local or shared network folders, like \\\\server\\share.</span><input type="text" id="folderPath" placeholder="Folder path"><div style="display:flex;gap:8px"><button class="btn" ${A("browseFolder")}>Browse</button><button class="btn go" ${A("pickFolderKey")}>Add key</button></div></div>`;
    } else if (u.tab === "actions") {
      const acts = [["mic-toggle", "Mic on or off", "mic"], ["mute-toggle", "Mute all sound", "mute"], ["screenshot", "Screenshot to clipboard", "camera"]];
      inner = `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">${acts.map(([n, l, g]) => `<button class="tile" ${A("pickKey", { label: l, action: { type: "builtin", name: n }, glyph: g, live: n === "mic-toggle" ? "mic" : n === "mute-toggle" ? "mute" : undefined })}>${svg(g, 26)}<span class="l">${l}</span></button>`).join("")}</div>`;
    } else if (u.tab === "ai") {
      inner = `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">${D.providers.map((p) => p.kind === "web"
        ? `<button class="tile" ${A("pickKey", { label: p.name.replace(" (web)", ""), sub: "Web", action: { type: "url", target: p.id === "claude-web" ? "https://claude.ai/new" : p.id === "chatgpt-web" ? "https://chatgpt.com/" : "https://gemini.google.com/app" }, glyph: p.id === "chatgpt-web" ? "gpt" : p.id === "gemini-web" ? "gem" : "claude" })}>${svg("globe", 26)}<span class="l">${esc(p.name)}</span></button>`
        : `<button class="tile" ${A("pickKey", { label: p.name, sub: "New session", action: { type: "ai-task", provider: p.id }, glyph: "term" })}>${svg("term", 26)}<span class="l">${esc(p.name)}</span></button>`).join("")}</div>
      <div class="kform" style="margin-top:16px"><span class="m" style="font-size:14px;font-weight:600">A task you run often, one tap. It runs on the panel and asks before changing anything</span><textarea id="aiPrompt" rows="2" placeholder="Like: Check my inbox folder for anything urgent and summarise it"></textarea><div style="display:flex;gap:8px"><input type="text" id="aiName" placeholder="Name on the key"><button class="btn go" ${A("pickAiTask")}>Add</button></div></div>`;
    }
    return sheetFrame("Add a key", "Or drag any app, file, folder or link from your main screen onto this screen.", `<div class="seg" style="margin-bottom:12px">${tabs.map(([t, l]) => `<button class="${u.tab === t ? "on" : ""}" ${A("addKeyTab", t)}>${l}</button>`).join("")}</div>${inner}`);
  },

  library(D) {
    return sheetFrame("Add a widget", "Only widgets that work on this PC are listed.", `<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px">${Object.entries(W).filter(([t]) => t !== "custom").filter(([t]) => t !== "meeting" || D.discOutlook).filter(([t]) => t !== "aitoday" || D.providers.some((p) => p.kind === "cli")).map(([t, def]) => `<button class="tile" ${A("addWidget", t)}>${svg(def.icon, 26)}<span class="l">${def.title}</span></button>`).join("")}${Object.values(D.custom || {}).map((c) => `<button class="tile" ${A("addWidget", "custom:" + c.name)}>${svg("wand", 26)}<span class="l">${esc(c.title)}</span><span class="i">Your widget</span></button>`).join("")}${D.providers.some((p) => p.id === "claude-code") ? `<button class="tile sel" ${A("sheet", "build")}>${svg("wand", 26)}<span class="l">Build your own</span><span class="i">Describe it, Claude makes it</span></button>` : ""}</div>${Object.keys(D.custom || {}).length ? `<div style="margin-top:12px"><button class="btn sm" ${A("openWidgetsFolder")}>${svg("folder", 16)}Open widgets folder</button></div>` : ""}`);
  },

  build(D) {
    const cc = D.providers.find((p) => p.id === "claude-code");
    const ideas = ["Free space on every drive, warn under 10%", "How many unread emails in Outlook", "Bitcoin price, updated every 5 minutes", "Today's prayer times for your city, next one big", "My GitHub notifications count with a link", "How long until my next calendar event"];
    return sheetFrame("Build a widget", cc ? "Say what you want. Claude builds it right here, checks it works, and puts it on your screen." : "Needs Claude Code on this PC.", `
      <div style="display:flex;flex-direction:column;gap:12px;max-width:900px">
        <textarea id="buildText" rows="3" placeholder="For example: show how many files are in my Downloads folder"></textarea>
        <button class="btn go" style="align-self:flex-start" ${A("buildWidget")}${cc ? "" : " disabled"}>${svg("wand", 18)}Build it</button>
        <div class="m" style="font-size:14px;font-weight:600">Ideas</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${ideas.map((i) => `<button class="btn sm" ${A("buildIdea", i)}>${esc(i)}</button>`).join("")}</div>
        <div class="empty">You watch each step as it builds. It can run commands inside its own widget folder only to test itself, and the finished widget runs only the command it shows you.</div>
      </div>`);
  },

  game() {
    return `<div class="sheet" style="top:0;border-radius:0;padding:0 20px 20px"><div class="top" style="padding:0"><span class="pix" style="font-size:22px">Crab Stack</span><span class="m" style="font-size:14px">Tap anywhere to drop. Overhang falls off.</span><span style="margin-left:auto" class="stat">Score <b id="gScore" style="font-size:30px">0</b></span><span class="stat">Best <b id="gBest">0</b></span><button class="btn" ${A("closeSheet")}>Close</button></div><button class="gamearea" id="gArea" aria-label="Drop the crate"><div id="gStack" style="position:absolute;inset:0"></div><div id="gMsg" class="hide" style="position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);background:var(--ink);color:var(--bg);padding:16px 22px;border-radius:12px;font-size:20px;font-weight:700"></div></button></div>`;
  },

  setup(D) {
    const u = D.ui.setup;
    const steps = 3;
    const dots = `<div style="display:flex;gap:6px">${[1, 2, 3].map((i) => `<span style="width:40px;height:6px;border-radius:3px;background:${i <= u.step ? "var(--ink)" : "var(--rule)"}"></span>`).join("")}</div>`;
    let inner = "";
    const disc = D.ui.disc;
    if (u.step === 1) {
      inner = `<div style="display:flex;gap:22px;align-items:center">${companion(D.cfg.companion === "none" ? "pip" : D.cfg.companion, 120, "idle")}<div><div style="font-size:30px;font-weight:700">A side screen for your PC</div><div class="m" style="font-size:17px;line-height:1.5;max-width:640px">It shows what your AI tools are doing, your keys, music and the things that need you. It never replaces your main screen: anything long opens there.</div></div></div>
        <div style="margin-top:22px"><span class="m" style="font-size:14px;font-weight:600">Pick a starting layout</span><div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:8px">${[["Developer", "AI sessions, keys, music"], ["Gamer", "Game stats, mic, music"], ["Office", "Meetings, keys, focus"], ["Creator", "Music, sound, keys"], ["Focus", "Keys and a timer"]].map(([t, d]) => `<button class="tile${u.template === t ? " sel" : ""}" ${A("setupTemplate", t)}><span class="l" style="font-size:17px">${t}</span><span class="i">${d}</span></button>`).join("")}</div></div>`;
    } else if (u.step === 2) {
      const found = (icon, n, d, st) => `<div class="setrow"><span style="display:flex;gap:10px;align-items:center">${svg(icon, 20)}<span>${esc(n)}<span class="sub">${esc(d)}</span></span></span><span style="font-weight:700;color:${st === "Full" || st === "Ready" ? "var(--ok)" : st === "Partial" ? "var(--live)" : "var(--mute)"}">${st}</span></div>`;
      inner = !disc ? `<div class="empty">Looking around this PC...</div>` : `<div style="font-size:26px;font-weight:700;margin-bottom:10px">Here is what I found on this PC</div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px">
        <div><span class="m" style="font-size:14px;font-weight:600">Screens and sound</span>${disc.displays.map((d) => found("monitor", d.label || "Screen", d.w + " x " + d.h + (d.primary ? ", main" : "") + (d.touch === "available" ? ", touch" : ""), "Ready")).join("")}${found("music", "Music controls", "Any player", "Ready")}</div>
        <div><span class="m" style="font-size:14px;font-weight:600">AI tools</span>${D.providers.map((p) => found(p.kind === "web" ? "globe" : "term", p.name, p.kind === "web" ? "Opens with your words filled in" : "On this PC", p.level)).join("")}</div>
        <div><span class="m" style="font-size:14px;font-weight:600">Apps and games</span>${found("layers", disc.appCount + " apps", "Ready to use as keys", "Ready")}${disc.steam.installed ? found("game", "Steam", disc.steam.games.length + " games", "Ready") : ""}${disc.epic.installed ? found("game", "Epic Games", disc.epic.games.length + " games", "Ready") : ""}${disc.outlook ? found("people", "Outlook (classic)", "Next meeting", "Ready") : found("people", "Calendar", "Classic Outlook not found", "Off")}${disc.extras.whisper ? found("mic", "Speech to text", "Local", "Ready") : found("mic", "Speech to text", "Not found. Windows dictation works", "Off")}</div></div>`;
    } else {
      const cc = D.providers.find((p) => p.id === "claude-code");
      inner = `<div style="font-size:26px;font-weight:700;margin-bottom:8px">Connect your AI tools</div>${cc ? `<div class="setrow"><span>Claude Code<span class="sub">Live steps, approvals from the panel. Adds hooks to your Claude settings after a backup. They do nothing when the panel is closed.</span></span>${D.hooks.user ? `<span style="color:var(--ok);font-weight:700">Connected</span>` : `<button class="btn go" ${A("connectClaude")}>Connect</button>`}</div>` : `<div class="empty">No Claude Code here. Ask still works with web AI and any other tool found.</div>`}<div class="empty" style="margin-top:10px">You can change all of this later in Settings.</div>`;
    }
    return `<div class="sheet" style="top:0;border-radius:0"><div class="head"><h2>Set up your panel</h2><span class="m" style="font-size:14px">Step ${u.step} of ${steps}. About a minute.</span><span style="margin-left:auto">${dots}</span></div><div class="body">${inner}</div><div style="display:flex;gap:10px;justify-content:flex-end">${u.step > 1 ? `<button class="btn" ${A("setupBack")}>Back</button>` : ""}<button class="btn go" ${A("setupNext")}>${u.step < steps ? "Next" : "Done"}</button></div></div>`;
  }
};
