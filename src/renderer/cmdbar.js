// Blink assistant: the command bar (type, or tap the mic), replies you read or read and hear, a morning brief,
// suggestions for the app you're using, and routines. The mic only records after you tap it, and stops by itself.
const CMD_ICON = {
  mic: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
  read: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  listen: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>'
};
D.ui.cmd = { text: "", rec: false, answer: null, thread: null };
const cmdHist = () => { try { return JSON.parse(localStorage.getItem("cmdHistory") || "[]"); } catch { return []; } };
const isWork = () => /work|office/i.test(activeLayout().name);
const replyMode = () => (isWork() ? D.cfg.replyWork || "read" : D.cfg.replyHome || "listen");
// Blink stays silent where talking would be awkward, even when listening is on
function quietWhy() {
  if (D.cfg.autoQuiet === false) return D.live.audio && D.live.audio.muted ? "Sound is off" : "";
  if (isWork()) return "Quiet at work";
  const ms = (D.live.meeting && D.live.meeting.meetings) || [];
  if (ms.some((m) => new Date(m.start) <= Date.now() && new Date(m.end) > Date.now())) return "In a meeting";
  if (D.ui.focus && D.ui.focus.running) return "Focus is on";
  if (D.live.inGame) return "You're in a game";
  if (D.live.audio && D.live.audio.muted) return "Sound is off";
  return "";
}
let speakAudio = null, arVoiceWarned = false, speakRun = 0;
const talking = (on) => document.querySelectorAll(".bk").forEach((b) => b.classList.toggle("bk-talking", on));
// the most human Windows voice on this PC, while the natural one isn't there
function bestVoice(ar) {
  const vs = speechSynthesis.getVoices();
  if (ar) return vs.find((x) => /^ar/i.test(x.lang) && /natural|online/i.test(x.name)) || vs.find((x) => /^ar/i.test(x.lang)) || null;
  const en = vs.filter((x) => /^en/i.test(x.lang));
  return en.find((x) => /natural|online/i.test(x.name)) || en.find((x) => /aria|jenny|guy|ava|andrew|emma|brian|sonia|libby/i.test(x.name)) || en.find((x) => /zira/i.test(x.name)) || en[0] || null;
}
// the first time Blink talks on a PC that can run it, the natural voice downloads by itself (once, with a clear note)
function getNaturalVoice(ar) {
  const v = D.voices; if (!v || D.ui.voiceFetching) return;
  const want = (v.voices || []).find((x) => x.id === (ar ? "ar" : "en"));
  if (!want || want.installed || want.tooHeavy || want.job) return;
  D.ui.voiceFetching = true;
  act("voiceInstall", want.id).then((r) => { if (!r || r.error) return; toast("Getting Blink's natural voice (" + want.mb + " MB, once). Until then, the Windows voice."); });
}
// sentences, joined while short (fewer pauses), long ones cut at a comma; the first one stays short so speaking starts fast
function speechParts(t) {
  const out = [];
  for (const sent of String(t).split(/(?<=[.!?؟])\s+/)) {
    const pieces = sent.length > 140 ? sent.split(/(?<=,)\s+/) : [sent];
    for (const piece of pieces) { const last = out[out.length - 1]; if (last && out.length > 1 && (last + " " + piece).length < 90) out[out.length - 1] = last + " " + piece; else out.push(piece); }
  }
  return out.map((x) => x.trim()).filter(Boolean);
}
// what Blink says out loud: how a person would say it, not the text on screen read word for word
const nameBit = () => (D.cfg.userName && Math.random() < 0.35 ? ", " + D.cfg.userName : "");
function talkify(t) {
  let s = String(t || "");
  s = s.replace(/```[\s\S]*?```/g, " I've put the code on screen. ").replace(/`([^`]+)`/g, "$1");
  s = s.replace(/https?:\/\/\S+/g, "the link on screen").replace(/[*_#>|]+/g, " ").replace(/^\s*[-•]\s+/gm, "");
  s = s.replace(/\b([A-Z]):\s*drive\b/g, "$1 drive").replace(/\b([A-Z]):(?=\s|$)/g, "$1 drive").replace(/&/g, " and ");
  s = s.replace(/\b(\d{1,2}):(\d{2})\s?(AM|PM)\b/gi, (m, h, mm, ap) => Number(h) + (mm === "00" ? "" : ":" + mm) + " " + ap.toUpperCase());
  // CamelCase names and tags read as words: SetupBackupSyncRepeat -> setup backup sync repeat, MorningReport-7AM -> morning report 7 AM
  s = s.replace(/\b([A-Za-z]+[a-z][A-Z][A-Za-z]*|[A-Z][a-z]+(?:[A-Z][a-z]+)+)(-\w+)?\b/g, (m) => m.replace(/-/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/(\d)(AM|PM)/gi, "$1 $2").toLowerCase());
  s = s.replace(/\b([a-z]+)-([a-z]+)\b/g, "$1 $2");
  return s.replace(/\s+/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}
// the short replies Blink gives to PC commands, said the way a person would
const HUMAN = [
  [/^Switched to (.+)\.$/, (m) => pick(["Okay, you're in " + m[1] + " mode.", "Done, " + m[1] + " mode is on.", m[1] + " mode, coming up."])],
  [/^Opening (.+)\.$/, (m) => pick(["Opening " + m[1] + nameBit() + ".", "Sure, here's " + m[1] + ".", "On it, opening " + m[1] + "."])],
  [/^Okay, in (\d+) minutes?\.?$/, (m) => pick(["Got it, I'll remind you in " + m[1] + " minutes.", "Sure" + nameBit() + ". I'll remind you in " + m[1] + " minutes."])],
  [/^Focus on for (\d+) minutes/, (m) => "Focus is on for " + m[1] + " minutes. I'll keep things quiet."],
  [/^Focus stopped/, () => "Okay, focus is off."],
  [/^Volume (\d+)\.$/, (m) => "Volume's at " + m[1] + "."],
  [/^Mic off/, () => pick(["You're muted.", "Mic's off."])], [/^Mic on/, () => "Mic's back on."],
  [/^Playing (.+)\.$/, (m) => pick(["Playing " + m[1] + ".", "Here's " + m[1] + "."])],
  [/^Calling (.+)\.$/, (m) => "Calling " + m[1] + " now."], [/^Opening a chat with (.+)\.$/, (m) => "Opening your chat with " + m[1] + "."],
  [/^No more meetings today/, () => pick(["You're free for the rest of the day.", "Nothing else on the calendar today."])],
  [/^Searching the web/, () => "Looking it up."], [/^Screenshot copied/, () => "Got it, the screenshot's copied."],
  [/^Routine saved/, () => "Done. I'll take care of that from now on."]
];
function humanize(t) { const s = String(t || ""); for (const [re, f] of HUMAN) { const m = s.match(re); if (m) return f(m); } return talkify(s); }
async function speak(text, whole, asked) {
  if (typeof Call !== "undefined" && Call.on) return; // during a call only the call speaks
  text = humanize(text);
  // asked: the person tapped "read it to me", so it reads whatever the reply setting or quiet rules say
  if (!text || (!asked && (replyMode() !== "listen" || quietWhy()))) return;
  // tests run on real PCs: they never talk out loud
  if (D.test) { D.ui.lastSpoken = text; return; }
  const first = whole ? String(text).slice(0, 900) : String(text).split(/(?<=[.!?؟])\s/)[0].slice(0, 220);
  D.ui.voiceHeard = null;
  const ar = /[\u0600-\u06FF]/.test(first);
  try { speechSynthesis.cancel(); if (speakAudio) speakAudio.pause(); } catch { }
  const run = ++speakRun; // a newer speak() stops this one
  // the natural voice, one sentence at a time: sentence 1 plays while sentence 2 is being made
  const parts = speechParts(first);
  const make = (t) => act("voiceSay", { text: t, lang: ar ? "ar" : "en" }).catch(() => null);
  const toUrl = (wav) => { const bin = atob(wav), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" })); };
  try {
    let next = make(parts[0]);
    for (let i = 0; i < parts.length; i++) {
      const r = await next;
      if (run !== speakRun) return;
      if (!r || !r.wav) { if (i === 0) break; talking(false); return; }
      next = i + 1 < parts.length ? make(parts[i + 1]) : null;
      D.ui.voiceHeard = "natural";
      if (speakAudio && speakAudio.__url) URL.revokeObjectURL(speakAudio.__url);
      const url = toUrl(r.wav); speakAudio = new Audio(url); speakAudio.__url = url; talking(true);
      await new Promise((done) => { speakAudio.onended = speakAudio.onerror = done; speakAudio.play().catch(done); });
      if (run !== speakRun) return;
    }
    if (D.ui.voiceHeard === "natural") { talking(false); return; }
  } catch { }
  getNaturalVoice(ar);
  try {
    const u = new SpeechSynthesisUtterance(first); u.rate = 0.95 * (D.cfg.voiceRate || 10) / 10;
    const v = bestVoice(ar);
    if (ar && !v) { if (!arVoiceWarned) { arVoiceWarned = true; toast("Getting an Arabic voice. Blink will read Arabic once it's ready."); } return; }
    if (v) { u.voice = v; u.lang = v.lang; }
    D.ui.voiceHeard = "windows"; talking(true); u.onend = u.onerror = () => talking(false);
    speechSynthesis.speak(u);
  } catch { }
}
let warmedFor = "";
window.panel.onTick(() => {
  const v = D.voices; if (!v || D.test || !(v.voices || []).some((x) => x.installed)) return;
  const n = D.cfg.userName || "", key = n + "|" + (v.voices || []).filter((x) => x.installed).map((x) => x.id).join(",") + "|" + (D.cfg.layouts || []).map((l) => l.name).join(",");
  if (key === warmedFor) return; warmedFor = key;
  const withName = (s) => [s, s.replace(/\.$/, ", " + n + ".")].filter((x, i) => i === 0 || n);
  const lines = [].concat(...["Sure, one sec.", "On it.", "Let me check.", "Give me a second.", "Okay, focus is off.", "Looking it up.", "Mic's off.", "You're muted.", "Mic's back on."].map(withName),
    ["Good morning", "Good afternoon", "Good evening"].map((g) => g + (n ? ", " + n : "") + "."),
    ...(D.cfg.layouts || []).map((l) => ["Okay, you're in " + l.name + " mode.", "Done, " + l.name + " mode is on.", l.name + " mode, coming up."]));
  act("voicePrewarm", lines.map((x) => humanize(x)));
});
// suggestions: the app you're using first (when an AI is around), then what fits the layout
const APP_CHIPS = [
  [/outlook|olk/i, ["Summarise this email", "Draft a reply to this email"]],
  [/teams/i, ["Mute me", "Summarise this chat"]],
  [/^(code|cursor|devenv|idea64|pycharm64)$/i, ["Explain the error on screen"]],
  [/chrome|msedge|firefox|brave|opera|arc/i, ["Summarise this page"]],
  [/excel/i, ["Explain this sheet"]],
  [/winword|powerpnt/i, ["Summarise this document"]]
];
function cmdChips() {
  const ai = D.providers.some((p) => p.id === "claude-code" || p.id === "codex");
  const fg = (D.live.fg && D.live.fg.app) || "";
  const out = [];
  if (D.cfg.appChips !== false && ai && !D.live.inGame) { const hit = APP_CHIPS.find(([re]) => re.test(fg)); if (hit) out.push(...hit[1]); }
  const people = Object.values(D.cfg.keySets).flat().filter((k) => k.action.type === "person");
  const pl = D.cfg.playlists || [];
  const base = isWork()
    ? ["Next meeting?", people[0] ? "Teams chat with " + people[0].label : "", "Mute me", "Focus 25 minutes", ai ? "Summarise what I copied" : "Remind me in 15 minutes to stretch"]
    : [pl[0] ? "Play " + pl[0].label : "Play music", people[0] ? "Chat with " + people[0].label : "", "Mute me", isWork() ? "" : "Work mode", ai ? "What's on my screen?" : "Set a timer for 10 minutes"];
  for (const c of base) if (c && !out.includes(c)) out.push(c);
  return out.slice(0, 5);
}
const nameAsked = () => { try { return !!localStorage.getItem("nameAsked"); } catch { return true; } };
function cmdAnswerHTML(c) {
  if (!c.answer && !c.thread && !D.cfg.userName && (D.ui.forceNameAsk || (!D.test && !nameAsked()))) return `<div class="cmd-answer name-ask"><span class="msg">Hi, I'm Blink. What should I call you?</span><span class="cmd-acts"><input type="text" id="nameText" dir="auto" placeholder="Your first name" maxlength="30" style="height:44px;width:180px;font-size:16px"><button class="btn sm go" ${A("setNameNow")}>Save</button><button class="btn sm" ${A("nameSkip")}>Not now</button></span></div>`;
  const th = c.thread && (D.ui.threadCache || {})[c.thread];
  if (th) {
    const ans = lastAnswer(th);
    const busy = th.state === "running";
    const ap = ((D.claude && D.claude.approvals) || []).find((a) => a.sessionId === th.id);
    return `${ap ? `<div class="cmd-confirm"><span style="flex:1"><b>Check before I do this</b><br>${esc(ap.what)}</span><button class="btn sm go" ${A("approve", { id: ap.id, decision: "allow" })}>Do it</button><button class="btn sm" ${A("approve", { id: ap.id, decision: "deny" })}>Cancel</button></div>` : ""}
      <div class="cmd-answer">${busy && !ans ? `<span class="m"><span class="spin">◌</span> ${esc(th.now || "Thinking")}</span>` : `<div class="msg ai">${md(ans || "")}</div>`}<span class="cmd-acts">${ans ? `<button class="btn sm" ${A("copy", ans)}>Copy</button>` : ""}<button class="btn sm" ${A("openThread", th.id)}>Open</button></span></div>`;
  }
  if (!c.answer) return "";
  const a = c.answer;
  return `<div class="cmd-answer"><span class="msg" dir="auto">${esc(a.say || "")}</span><span class="cmd-acts">${a.go ? `<button class="btn sm go" ${a.go.arg !== undefined ? A(a.go.act, a.go.arg) : A(a.go.act)}>${esc(a.go.label)}</button>` : ""}${a.join ? `<button class="btn sm go" ${A("openUrl", a.join)}>Join</button>` : ""}${a.web ? webAsk(a.web) : ""}</span></div>`;
}
const WEB_AI = [["claude-web", "Claude"], ["chatgpt-web", "ChatGPT"], ["copilot-web", "Copilot"], ["gemini-web", "Gemini"]];
function webAsk(q) {
  const cur = D.cfg.webAI || "claude-web", name = (WEB_AI.find((w) => w[0] === cur) || WEB_AI[0])[1];
  return `<button class="btn sm go" ${A("cmdWeb", { q, id: cur })}>Ask ${name}</button>${WEB_AI.filter((w) => w[0] !== cur).map(([id, l]) => `<button class="btn sm" ${A("cmdWeb", { q, id })}>${l}</button>`).join("")}`;
}
function cmdBarHTML(mini) {
  const c = D.ui.cmd;
  const mode = replyMode(), q = quietWhy();
  const reply = `<button class="cmd-reply" ${A("cmdReply")} title="Read answers aloud. Tap to turn on or off" aria-pressed="${mode === "listen"}">${mode === "listen" ? CMD_ICON.listen : CMD_ICON.read}${mini ? "" : `<span>${mode === "listen" ? "Aloud: on" : "Aloud: off"}${mode === "listen" && q ? `<span class="q">${esc(q)}</span>` : ""}</span>`}</button>`;
  const rec = c.rec ? `<div class="cmd-rec"><span class="recdot"></span>Listening. Tap the square to stop<span class="wave"><i></i><i></i><i></i><i></i></span><span class="n" id="recsec" style="margin-left:auto">0:00</span></div>` : c.transcribing ? `<div class="cmd-rec" style="color:var(--mute)"><span class="spin">◌</span> Turning your words into text...</div>` : "";
  const hist = cmdHist();
  const chips = !c.answer && !c.thread && !c.rec ? `<div class="cmd-chips">${cmdChips().slice(0, mini ? 3 : 5).map((x) => `<button class="cmd-chip" ${A("cmdRun", x)}>${esc(x)}</button>`).join("")}</div>` : "";
  return `${rec}${cmdAnswerHTML(c)}<div class="cmd-row"><input type="text" id="cmdText" dir="auto" placeholder="${mini ? "Ask Blink" : "Ask or tell Blink anything. Like: Teams chat with Sara"}" value="${esc(c.text)}" autocomplete="off"><button class="cmd-mic${c.rec ? " rec" : ""}" ${A("cmdMic")} aria-label="${c.rec ? "Stop recording" : "Talk to Blink (a hands-free call)"}" title="Talk to Blink: a hands-free call">${c.rec ? CMD_ICON.stop : CMD_ICON.mic}</button>${reply}${mini ? "" : `<button class="cmd-reply" ${A("chats")} title="Your chats with Blink">${svg("chat", 20)}<span>Chats</span></button>`}<button class="btn go cmd-send" ${A("cmdSend")}>Send</button></div>${chips}${!mini && hist.length && !c.rec ? `<div class="cmd-hist">Recent: ${hist.map((h) => `<button class="plain" ${A("cmdRun", h)}>${esc(h)}</button>`).join("")}</div>` : ""}`;
}
SHEETS.cmd = function (D) {
  return `<div class="shade" ${A("closeSheet")}></div><div class="cmdbar${D.ui.cmdFresh ? " opening" : ""}">${cmdBarHTML(false)}</div>`;
};

// ---------- morning brief ----------
function briefRows() {
  const rows = [];
  const ms = ((D.live.meeting && D.live.meeting.meetings) || []).filter((m) => new Date(m.end) > Date.now());
  if (ms.length) { const t = new Date(ms[0].start); rows.push({ tag: ms.length + (ms.length === 1 ? " meeting" : " meetings"), col: "var(--live)", text: "First: " + (D.cfg.hideMeetingTitles ? "Busy" : ms[0].subject) + ", " + t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), go: ms[0].join ? { label: "Join", act: "openUrl", arg: ms[0].join } : null }); }
  const done = ((D.claude && D.claude.sessions) || []).filter((s) => (s.state === "yourturn" || s.state === "done") && Date.now() - s.updated < 14 * 3600000);
  if (done.length) rows.push({ tag: "Done", col: "var(--ok)", text: done.slice(0, 2).map((s) => s.project).join(", ") + (done.length > 2 ? " and " + (done.length - 2) + " more" : "") + " finished", go: { label: "See them", act: "sheet", arg: "sessions" } });
  for (const a of (D.attention || []).filter((x) => x.kind === "task").slice(0, 2)) rows.push({ tag: "Failed", col: "var(--bad)", text: a.title, go: a.action ? { label: "Fix it", act: "attAction", arg: a.action } : null });
  for (const a of (D.attention || []).filter((x) => x.kind === "disk").slice(0, 1)) rows.push({ tag: "Low space", col: "var(--wait)", text: a.title, go: a.action ? { label: "Free up space", act: "attAction", arg: a.action } : null });
  if (D.update && D.update.status === "available") rows.push({ tag: "Update", col: "var(--live)", text: "Side Panel " + D.update.latest + " is ready", go: { label: "Update", act: "updateNow" } });
  return rows;
}
function briefSpeech() {
  const h = new Date().getHours(), hi = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const out = [hi + (D.cfg.userName ? ", " + D.cfg.userName : "") + "."];
  const ms = ((D.live.meeting && D.live.meeting.meetings) || []).filter((m) => new Date(m.end) > Date.now());
  if (ms.length) { const t = new Date(ms[0].start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(":00", ""); out.push((ms.length === 1 ? "You've got one meeting today: " : "You've got " + ms.length + " meetings. The first is ") + (D.cfg.hideMeetingTitles ? "at " + t : talkify(ms[0].subject) + " at " + t) + "."); }
  else out.push(pick(["Your calendar's clear.", "No meetings today."]));
  const done = ((D.claude && D.claude.sessions) || []).filter((s) => (s.state === "yourturn" || s.state === "done") && Date.now() - s.updated < 14 * 3600000);
  if (done.length) out.push(done.length === 1 ? "Your " + talkify(done[0].project) + " task finished." : done.length + " AI tasks finished while you were away.");
  const failed = (D.attention || []).filter((x) => x.kind === "task").map((a) => talkify(a.title.replace(/\s*failed$/i, "")));
  if (failed.length) out.push((failed.length === 1 ? "Heads up, " + failed[0] + " didn't run." : "Heads up, " + failed.length + " scheduled jobs didn't run: " + failed.slice(0, 2).join(" and ") + "."));
  const disk = (D.attention || []).find((x) => x.kind === "disk");
  if (disk) out.push("And your " + talkify(disk.title).replace(/ is almost full/i, "") + " is almost full.");
  if (D.update && D.update.status === "available") out.push("There's a Side Panel update ready too.");
  if (out.length === 2 && !done.length) out.push("Nothing needs you. Enjoy the day.");
  return out.join(" ");
}
function briefHTML() {
  const rows = briefRows();
  const h = new Date().getHours(), hi = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `<div class="brief">${blinkFace(84, rows.some((r) => r.tag === "Failed") ? "asking" : "done")}<div style="min-width:0"><div class="brief-h">${hi}. ${rows.length ? "Here's your day." : "Nothing needs you. Enjoy the day."}</div><div class="brief-rows">${rows.map((r) => `<div class="brief-row"><span class="brief-tag" style="color:${r.col};border-color:${r.col}">${esc(r.tag)}</span><span class="ell" style="flex:1 1 auto;min-width:0">${esc(r.text)}</span>${r.go ? `<button class="btn sm" ${r.go.arg !== undefined ? A(r.go.act, r.go.arg) : A(r.go.act)}>${esc(r.go.label)}</button>` : ""}</div>`).join("")}</div></div><div class="brief-btns"><button class="btn go" ${A("briefDone")}>Got it</button><button class="btn" ${A("briefRead")}>${CMD_ICON.listen}Read it to me</button></div></div>`;
}
const briefSeenToday = () => { try { return localStorage.getItem("briefSeen") === new Date().toDateString(); } catch { return true; } };
// shown over the layout until Got it; once a day, after the panel has its data
const renderBase = render;
render = function () {
  renderBase();
  if (!D.cfg || D.mini || D.ui.editing || D.ui.sheet) { const b = document.getElementById("briefWrap"); if (b && !D.ui.briefOpen) b.remove(); return; }
  const want = D.ui.briefOpen || (D.cfg.brief !== false && !D.test && !briefSeenToday() && D.discReady && Date.now() - (D.ui.bootAt || (D.ui.bootAt = Date.now())) > 4000);
  let b = document.getElementById("briefWrap");
  if (!want) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement("div"); b.id = "briefWrap"; document.getElementById("app").appendChild(b); D.ui.briefOpen = true; }
  const h = briefHTML(); if (b.dataset.h !== h) { b.innerHTML = h; b.dataset.h = h; }
};

// ---------- the mic: tap to start, tap to stop, stops by itself after 30 s ----------
const CmdMic = {
  rec: null, chunks: [], t: null,
  async toggle() {
    const c = D.ui.cmd;
    if (c.rec) return this.stop();
    if (!D.voice) { toast("Type, or press Windows + H in the box to dictate"); const t = $("#cmdText"); if (t) { act("typing", true); t.focus(); } return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream; this.chunks = [];
      this.rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      this.rec.ondataavailable = (ev) => this.chunks.push(ev.data);
      this.rec.onstop = async () => {
        stream.getTracks().forEach((x) => x.stop());
        clearInterval(this.t); c.rec = false; c.transcribing = true; cmdRedraw();
        const buf = new Uint8Array(await new Blob(this.chunks).arrayBuffer());
        const r = await act("voice", buf);
        c.transcribing = false;
        if (r.text) { const said = (c.text ? c.text + " " : "") + r.text; c.text = ""; cmdSend(said); return; }
        toast(r.error);
        cmdRedraw(); setTimeout(() => { const i = $("#cmdText"); if (i) { act("typing", true); i.focus(); i.selectionStart = i.value.length; } }, 30);
      };
      this.rec.start(); c.rec = true; this.started = Date.now(); cmdRedraw();
      this.t = setInterval(() => { const s = Math.floor((Date.now() - this.started) / 1000); const el = $("#recsec"); if (el) el.textContent = "0:" + String(s).padStart(2, "0"); if (s >= 30) this.stop(); }, 500);
    } catch (e) { toast("Couldn't use the microphone: " + e.message); }
  },
  stop() { try { this.rec && this.rec.state !== "inactive" && this.rec.stop(); } catch { } clearInterval(this.t); }
};
function cmdRedraw() { if (D.ui.sheet === "cmd") drawSheet(); else if (D.mini) { lastAppHTML = ""; render(); } }

async function cmdSend(text) {
  const c = D.ui.cmd;
  text = String(text || "").trim();
  if (!text) { toast("Type or say something first"); return; }
  try { const h = [text].concat(cmdHist().filter((x) => x !== text)).slice(0, 3); localStorage.setItem("cmdHistory", JSON.stringify(h)); } catch { }
  const follow = c.thread; // a follow-up to an AI answer that's still showing continues that chat
  c.text = ""; c.answer = null; c.thread = null; cmdRedraw();
  const r = await act("command", { text, follow });
  if (r.name !== undefined) D.cfg.userName = r.name;
  if (r.ui && r.ui.focus) { D.ui.focus.left = r.ui.focus * 60; H.focus("start"); }
  if (r.ui && r.ui.focusStop) H.focus("reset");
  if (r.ui && r.ui.brief) { D.ui.briefOpen = true; closeSheet(); render(); speak(briefSpeech(), true); return; }
  if (r.thread) { c.thread = r.thread; spokenThreads.delete(r.thread); speak(pick(["Sure, one sec.", "On it.", "Let me check.", "Give me a second."]).replace(".", nameBit() + ".")); await loadThread(r.thread); cmdRedraw(); return; }
  c.answer = { say: r.say || r.error || "Done.", join: r.join, web: r.web, go: r.go };
  cmdRedraw();
  const bk = [...document.querySelectorAll(".bk")].find((x) => x.getBoundingClientRect().width > 0);
  if (bk && D.ui.sheet !== "cmd") bkSay(bk, c.answer.say);
  speak(c.answer.say);
}
// speak the AI's answer once it's finished
const spokenThreads = new Set();
window.panel.onTick(() => {
  const c = D.ui.cmd; if (!c.thread) return;
  const t = (D.ui.threadCache || {})[c.thread];
  if (t && t.state !== "running" && !spokenThreads.has(t.id + t.updated)) { spokenThreads.add(t.id + t.updated); const a = talkify(lastAnswer(t) || ""); speak(a.split(/(?<=[.!?])\s+/).slice(0, 3).join(" "), true); }
});
// keep the AI answer in the bar up to date
const syncBase = syncThreads;
syncThreads = function () {
  syncBase();
  const id = D.ui.cmd.thread; if (!id || (D.ui.sheet !== "cmd" && !D.mini)) return;
  const s = (D.threads || []).find((x) => x.id === id), have = (D.ui.threadCache || {})[id];
  if (s && (!have || have.updated !== s.updated || have.state !== s.state) && !D.ui["loading" + id]) { D.ui["loading" + id] = true; loadThread(id).then(() => { D.ui["loading" + id] = false; cmdRedraw(); }); }
};

document.addEventListener("input", (e) => { if (e.target.id === "cmdText") D.ui.cmd.text = e.target.value; });
document.addEventListener("keydown", (e) => { if (e.target && e.target.id === "cmdText" && e.key === "Enter") { e.preventDefault(); cmdSend(e.target.value); } if (e.target && e.target.id === "nameText" && e.key === "Enter") { e.preventDefault(); H.setNameNow(); } if (e.target && e.target.id === "setName" && e.key === "Enter") { e.preventDefault(); H.setNameSettings(); } });
Object.assign(H, {
  voiceTest: async () => { toast("Playing a test sentence..."); D.ui.voiceHeard = null; await speak("Hi, I'm Blink. This is how I sound when I read your answers.", true, true); setTimeout(() => { toast(D.ui.voiceHeard === "natural" ? "That was the natural voice" : "That was the Windows voice. Settings shows why"); drawSheet(); }, 500); },
  editCurrent: () => { closeSheet(); if (D.mini && H.expand) H.expand(); setTimeout(() => H.editLayout(D.cfg.activeLayout), D.mini ? 600 : 0); },
  setNameSettings: async () => { const v = (($("#setName") || {}).value || "").trim(); const r = await act("setName", v); D.cfg.userName = r.name; toast(r.name ? "Blink will call you " + r.name : "Okay, no name"); drawSheet(); },
  nameSkip: () => { try { localStorage.setItem("nameAsked", "1"); } catch { } D.ui.forceNameAsk = false; drawSheet(); },
  setNameNow: async () => { const v = (($("#nameText") || {}).value || "").trim(); if (!v) return toast("Type your name first"); try { localStorage.setItem("nameAsked", "1"); } catch { } D.ui.forceNameAsk = false; const r = await act("setName", v); D.cfg.userName = r.name; D.ui.cmd.answer = { say: "Nice to meet you, " + r.name + "." }; drawSheet(); speak("Nice to meet you, " + r.name + ".", false, false); },
  cmdOpen: () => { D.ui.cmd.answer = null; D.ui.cmd.thread = null; D.ui.cmdFresh = true; openSheet("cmd"); D.ui.cmdFresh = false; setTimeout(() => { const i = $("#cmdText"); if (i) i.focus(); }, 60); },
  cmdSend: () => cmdSend(($("#cmdText") || {}).value || D.ui.cmd.text),
  cmdRun: (t) => cmdSend(t),
  // the mic starts a hands-free call; typing stays for quiet places
  cmdMic: () => (typeof Call !== "undefined" ? Call.start() : CmdMic.toggle()),
  cmdReply: async () => { const k = isWork() ? "replyWork" : "replyHome"; const v = replyMode() === "listen" ? "read" : "listen"; D.cfg[k] = v; await act("saveSettings", { [k]: v }); if (v === "read") try { speechSynthesis.cancel(); } catch { } cmdRedraw(); toast(v === "listen" ? (quietWhy() ? "Read + listen. " + quietWhy() + ", so Blink stays quiet for now" : "Read + listen") : "Read only"); },
  cmdWeb: async (o) => { const r = await act("askWeb", o); if (o && o.id) D.cfg.webAI = o.id; toast(r.toast || r.error || "Opened in your browser"); drawSheet(); if (D.mini) { lastAppHTML = ""; render(); } },
  briefDone: () => { try { localStorage.setItem("briefSeen", new Date().toDateString()); } catch { } D.ui.briefOpen = false; try { speechSynthesis.cancel(); } catch { } lastAppHTML = ""; render(); },
  briefRead: () => { speak(briefSpeech(), true, true); },
  routineToggle: async (id) => { await act("toggleRoutine", id); const r = (D.cfg.routines || []).find((x) => x.id === id); if (r) r.on = !r.on; drawSheet(); },
  routineRemove: async (id) => { await act("removeRoutine", id); D.cfg.routines = (D.cfg.routines || []).filter((x) => x.id !== id); drawSheet(); }
});
// Focus starting is a routine trigger too
const focusBase = H.focus;
H.focus = (cmd) => { const r = focusBase(cmd); if (cmd === "start") act("routineEvent", "focus"); return r; };

// voices in Settings: add or remove; progress arrives with each update from the panel
Object.assign(H, {
  voiceInstall: async (id) => { const r = await act("voiceInstall", id); if (r && r.error) toast(r.error); else toast("Downloading the voice. You can keep using the panel."); drawSheet(); },
  voiceRemove: async (id) => { await act("voiceRemove", id); toast("Voice removed"); drawSheet(); }
});
let voicesSeen = "";
window.panel.onTick(() => { const v = JSON.stringify(D.voices ? { v: D.voices.voices, e: D.voices.lastError && D.voices.lastError.plain } : null); if (v !== voicesSeen) { voicesSeen = v; if (D.ui.sheet === "settings") { const sc = ($(".sheet .body") || {}).scrollTop; drawSheet(); const b = $(".sheet .body"); if (b && sc) b.scrollTop = sc; } } });
