// Talking to Blink like a call: tap once, then just talk. Blink hears when you stop, answers out loud straight away,
// starts speaking while the answer is still being written, and stops the moment you talk over it.
// The microphone is on only during a call, with a red bar the whole time; "bye", End, or a quiet minute ends it.
const Call = {
  on: false, state: "idle", lines: [], port: null, stream: null, ctx: null, node: null,
  noise: 0.004, inSpeech: false, loud: 0, quiet: 0, frames: [], pre: [], lastHeard: 0,
  queue: [], playing: null, run: 0, answer: "", spokenUpTo: 0, aiBusy: false, ackT: null,

  async start() {
    // one call at a time: a second tap while it opens does nothing
    if (this.on || this.starting) return;
    this.starting = true;
    try {
    if (D.mini && H.expand) { H.expand(); await new Promise((r) => setTimeout(r, 500)); }
    // the call screen opens straight away; the ears load behind it and anything you say meanwhile waits for them
    this.on = true; this.lines = []; this.state = "starting"; this.lastHeard = Date.now(); this.lastText = ""; this.port = null;
    openSheet("call");
    let ready; this.portReady = new Promise((res) => (ready = res));
    const r = await act("callStart");
    if (!this.on) return;
    if (!r.ears && !D.test) { this.end(true); toast("Getting Blink ready to listen (a one-time download). Try again in a minute."); return; }
    this.port = r.earsPort; this.brain = r.brain; ready(r.earsPort || null);
    this.setState("listening");
    if (!D.test && await this.startSilero()) { /* listening with Silero */ }
    else if (!D.test) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        this.ctx = new AudioContext({ sampleRate: 16000 });
        const src = this.ctx.createMediaStreamSource(this.stream);
        this.node = this.ctx.createScriptProcessor(1024, 1, 1); // 64 ms frames
        this.node.onaudioprocess = (e) => this.frame(new Float32Array(e.inputBuffer.getChannelData(0)));
        const mute = this.ctx.createGain(); mute.gain.value = 0;
        src.connect(this.node); this.node.connect(mute); mute.connect(this.ctx.destination);
      } catch (e) { toast("Couldn't use the microphone: " + e.message); this.end(true); return; }
    }
    if (!D.test) for (const f of FILLERS.concat(WORKING)) act("voiceSay", { text: humanize ? humanize(f) : f, lang: "en" }).catch(() => null); // made once, so "one sec" plays instantly
    this.say(pick(["Hey" + (D.cfg.userName ? " " + D.cfg.userName : "") + ", I'm listening.", "Go ahead, I'm listening.", "Hi" + (D.cfg.userName ? " " + D.cfg.userName : "") + ". What's up?"]));
    this.idle = setInterval(() => {
      if (!this.on) return;
      if (!this.inSpeech && this.state !== "hearing" && !this.playing && !this.aiBusy && Date.now() - this.lastHeard > 60000) { this.say("I'll hang up for now. Tap when you need me."); setTimeout(() => this.end(), 2500); }
      // thinking too long with nothing back: stop it and say so, instead of hanging
      if (this.aiBusy && !this.answer && Date.now() - (this.askedAt || 0) > 45000) { act("callInterrupt"); this.aiBusy = false; this.say("Sorry, that's taking too long. Try asking again?"); }
      if (this.state === "thinking" || this.aiBusy) this.paint(); // the seconds counter
    }, 1000);
    } finally { this.starting = false; }
  },
  // Stop: whatever Blink is saying or working on stops, and it listens again
  stopNow() { this.stopSpeaking(); if (this.aiBusy) { act("callInterrupt"); this.aiBusy = false; } this.run++; this.setState("listening"); },
  // a proper speech detector: tells talking from noise, a cough doesn't count, waits for you to finish a thought
  async startSilero() {
    try {
      const load = (src) => new Promise((ok, bad) => { if (document.querySelector('script[src="' + src + '"]')) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
      await load("vendor/vad/ort.wasm.min.js"); await load("vendor/vad/bundle.min.js");
      ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = new URL("vendor/vad/", location.href).href; ort.env.logLevel = "error";
      this.mic = await vad.MicVAD.new({
        model: "v5", baseAssetPath: new URL("vendor/vad/", location.href).href, onnxWASMBasePath: new URL("vendor/vad/", location.href).href,
        positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35, redemptionMs: 650, preSpeechPadMs: 450, minSpeechMs: 250,
        getStream: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }),
        onSpeechStart: () => { this.lastHeard = Date.now(); if (!this.playing) this.setState("hearing"); },
        // real speech (not a click or a cough): if Blink is talking, it stops right away
        onSpeechRealStart: () => { if (!this.muted) this.heardStart(); },
        onVADMisfire: () => { if (!this.playing && !this.aiBusy) this.setState("listening"); },
        onSpeechEnd: (audio) => this.heardEnd([audio])
      });
      this.mic.start();
      return true;
    } catch (e) { console.warn("Silero not available, using the simple detector:", e && e.message); this.mic = null; return false; }
  },
  muted: false,
  toggleMute() {
    this.muted = !this.muted;
    try { if (this.mic) { if (this.muted) this.mic.pause(); else this.mic.start(); } } catch { }
    if (this.muted) { this.inSpeech = false; this.frames = []; }
    this.lastHeard = Date.now(); this.setState(this.muted ? "muted" : "listening"); drawSheet();
  },
  end(silent) {
    if (!this.on) return;
    this.muted = false;
    this.on = false; this.state = "idle"; clearInterval(this.idle); clearTimeout(this.ackT);
    this.stopSpeaking();
    try { if (this.mic) { this.mic.pause(); this.mic.destroy && this.mic.destroy(); } } catch { } this.mic = null;
    try { this.node && this.node.disconnect(); this.ctx && this.ctx.close(); this.stream && this.stream.getTracks().forEach((t) => t.stop()); } catch { }
    this.node = this.ctx = this.stream = null;
    act("callEnd", { lines: this.lines.filter((l) => l.text).map((l) => ({ who: l.who, text: l.text, screen: l.screen || "" })) });
    if (D.ui.sheet === "call") closeSheet();
    if (!silent) toast(this.lines.some((l) => l.who === "you" && l.text) ? "Call ended. It's saved in Chats." : "Call ended. The microphone is off.");
  },

  // ---- hearing: a simple voice detector that adapts to the room ----
  frame(f) {
    if (!this.on || this.muted) return;
    let sum = 0; for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    const speakingNow = !!this.playing;
    const thr = Math.max(0.006, this.noise * 2.4) * (speakingNow ? 1.7 : 1); // a louder bar while Blink talks, so it doesn't hear itself
    if (!this.inSpeech) {
      this.pre.push(f); if (this.pre.length > 6) this.pre.shift();
      if (rms > thr) { if (++this.loud >= 2) { this.inSpeech = true; this.quiet = 0; this.frames = this.pre.slice(); this.pre = []; this.heardStart(); } }
      else { this.loud = 0; this.noise = this.noise * 0.97 + rms * 0.03; }
      return;
    }
    this.frames.push(f);
    if (rms < thr * 0.7) this.quiet++; else this.quiet = 0;
    // you've stopped: about half a second of quiet, like a person waiting for their turn
    if (this.quiet >= 11 || this.frames.length > 20 * 16) { this.inSpeech = false; this.loud = 0; const fr = this.frames; this.frames = []; this.heardEnd(fr); }
  },
  selfSaid: [], ducked: false, quietAt: 0, maybeBarge: false,
  heardSelf(t) { const now = Date.now(); this.selfSaid = this.selfSaid.filter((x) => now - x.at < 20000).concat({ at: now, words: words(t) }); },
  // Blink's own voice coming back through the mic: most of the words match what it just said
  isEcho(text) {
    const w = words(text); if (!w.length) return true;
    const mine = new Set(this.selfSaid.flatMap((x) => x.words));
    return w.filter((x) => mine.has(x)).length / w.length >= 0.6;
  },
  duck(on) { this.ducked = on; try { if (this.playing && "volume" in this.playing) this.playing.volume = on ? 0.3 : 1; } catch { } },
  heardStart() {
    if (this.muted) return;
    this.lastHeard = Date.now();
    // while Blink talks (or just after), it lowers its voice and listens; it stops once it's sure it's you
    if (this.playing || this.queue.length || Date.now() - this.quietAt < 800) { this.duck(true); this.maybeBarge = true; return; }
    // Blink is still thinking and you keep talking: the old answer is dropped
    if (this.aiBusy) { act("callInterrupt"); this.aiBusy = false; clearTimeout(this.ackT); }
    this.setState("hearing");
  },
  // you really talked over Blink
  barge() { this.stopSpeaking(); if (this.aiBusy) { act("callInterrupt"); this.aiBusy = false; } },
  myLevel: 0,
  async heardEnd(frames) {
    if (this.muted) return;
    const n = frames.reduce((a, f) => a + f.length, 0);
    // how strong this speech was (the loudest half-second), compared with how you usually sound
    let peak = 0; for (const f of frames) { let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i]; peak = Math.max(peak, Math.sqrt(s / f.length)); }
    const barge = this.maybeBarge; this.maybeBarge = false;
    const settle = () => { if (barge) this.duck(false); this.setState(this.playing ? "speaking" : this.aiBusy ? "thinking" : "listening"); };
    if (n < 16000 * 0.3) return settle(); // a cough or a click
    if (this.myLevel && peak < this.myLevel * 0.35 && !barge) return settle(); // someone further away
    if (!barge) this.myLevel = this.myLevel ? this.myLevel * 0.8 + peak * 0.2 : peak;
    const pcm = new Float32Array(n); let o = 0; for (const f of frames) { pcm.set(f, o); o += f.length; }
    if (!barge) this.setState("thinking");
    const text = await this.recognize(pcm);
    if (!this.on) return;
    if (!text || !/[a-z؀-ۿ]/i.test(text)) return settle();
    if (barge && this.isEcho(text)) return settle(); // that was Blink hearing itself
    const norm = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (norm && norm === this.lastText && Date.now() - (this.lastTextAt || 0) < 2500) return settle();
    this.lastText = norm; this.lastTextAt = Date.now();
    if (barge) { this.barge(); this.setState("thinking"); }
    this.handle(text);
  },
  recognize(pcm) {
    // the loaded recognizer over a local socket; if it isn't up, the one-off recognizer
    const viaSocket = () => new Promise((resolve) => {
      if (!this.port) return resolve(null);
      let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
      try {
        const ws = new WebSocket("ws://127.0.0.1:" + this.port); ws.binaryType = "arraybuffer";
        const t = setTimeout(() => { try { ws.close(); } catch { } fin(null); }, 4000);
        ws.onopen = () => { const head = new Int32Array([16000, pcm.byteLength]); const msg = new Uint8Array(8 + pcm.byteLength); msg.set(new Uint8Array(head.buffer), 0); msg.set(new Uint8Array(pcm.buffer), 8); ws.send(msg); };
        ws.onmessage = (e) => { clearTimeout(t); let text = ""; try { const j = JSON.parse(e.data); text = j.text || ""; } catch { text = String(e.data || ""); } try { ws.send("Done"); ws.close(); } catch { } fin(text.trim()); };
        ws.onerror = () => { clearTimeout(t); fin(null); };
      } catch { fin(null); }
    });
    const wait = this.port || !this.portReady ? Promise.resolve() : Promise.race([this.portReady, new Promise((r) => setTimeout(r, 30000))]);
    return wait.then(() => viaSocket()).then(async (t) => {
      if (t !== null) return t;
      const r = await act("hear", wavBytes(pcm));
      return (r && r.text) || "";
    });
  },

  // ---- talking back ----
  askShown: "",
  appAsk() { return ((D.claude && D.claude.approvals) || []).find((x) => x.source === "app"); },
  checkAsk() {
    const ask = this.appAsk(), id = ask ? ask.id : "";
    if (id === this.askShown) return;
    this.askShown = id; if (ask) this.say(ask.voice || "Can I use " + ask.app + "? Say yes, or tap Allow.");
    this.paint();
  },
  async handle(text) {
    this.add("you", text);
    const ask = this.appAsk(), t = text.trim();
    if (ask && /^(yes|yeah|yep|sure|ok(ay)?|allow( it)?|go ahead|do it|please)\b/i.test(t)) { act("approve", { id: ask.id, decision: "allow" }); return; }
    if (ask && /^(no|nope|not now|don'?t|cancel|never ?mind)\b/i.test(t)) { act("approve", { id: ask.id, decision: "deny" }); this.say("Okay, I won't."); return; }
    if (/^(bye|goodbye|bye bye|end( the)? call|hang up|that'?s all|stop listening)\b/i.test(text.trim())) { this.say(pick(["Talk soon" + (D.cfg.userName ? ", " + D.cfg.userName : "") + ".", "Okay, bye for now."])); setTimeout(() => this.end(), 1800); return; }
    const myRun = ++this.run; this.askedAt = Date.now(); this.usedTool = false; this.segStart = 0; this.spokenCount = 0; this.spokenWords = 0;
    const r = await act("callAsk", text);
    if (!this.on || myRun !== this.run) return;
    if (r.ui && r.ui.focus) { D.ui.focus.left = r.ui.focus * 60; H.focus("start"); }
    if (r.say) { this.add("blink", ""); this.enqueue(r.say, false, true); return; }
    if (r.ai) {
      this.aiBusy = true; this.answer = ""; this.spokenUpTo = 0; this.add("blink", "");
      // a quick "mm, one sec" if the answer isn't on its way yet, the way people fill a pause
      clearTimeout(this.ackT); this.ackT = setTimeout(() => { if (this.on && this.aiBusy && !this.answer && !this.playing) this.enqueue(pick(FILLERS), true); }, 400);
    }
  },
  // the spoken part ends where the on-screen details start
  // the part of the answer to say: after any tool use only the final result, and never the on-screen details
  final() { return this.answer.slice(this.segStart || 0); },
  spoken() { const a = this.final(), i = a.indexOf("[screen]"); return (i >= 0 ? a.slice(0, i) : a.replace(/\[s?c?r?e?e?n?$/, "")).replace(/```[\s\S]*?(```|$)/g, ""); },
  showScreen() { const a = this.final(), i = a.indexOf("[screen]"); if (i < 0) return; const l = this.lines.slice().reverse().find((x) => x.who === "blink"); if (l) { l.screen = a.slice(i + 8).trim(); this.paint(); } },
  delta(t) {
    if (!this.aiBusy) return;
    this.answer += t;
    this.showScreen();
    if (this.usedTool) return; // while it's doing things, it waits and then says the result once
    // speak each finished sentence as soon as it exists; the very first can be a short phrase, so speaking starts sooner
    for (;;) {
      const rest = this.spoken().slice(this.spokenUpTo);
      let m = rest.match(/^[\s\S]*?[.!?](?=\s|$)/);
      if (!m && this.spokenUpTo === 0) m = rest.match(/^(\S+\s+){4,}?\S+,(?=\s)/);
      if (!m || m[0].trim().length < 3) break;
      this.spokenUpTo += m[0].length;
      // spoken: at most about two sentences; anything longer is there to read
      this.spokenCount = (this.spokenCount || 0) + 1;
      if (this.spokenCount > 2 && (this.spokenWords || 0) > 25) { this.overflow(m[0].trim()); continue; }
      this.spokenWords = (this.spokenWords || 0) + m[0].trim().split(/\s+/).length;
      this.enqueue(m[0].trim(), false, true);
    }
  },
  done(t) {
    if (!this.aiBusy) return;
    this.aiBusy = false; if (t && !this.answer) this.answer = t;
    this.showScreen();
    const said = this.spoken(); let rest = (this.usedTool ? said : said.slice(this.spokenUpTo)).trim(); this.spokenUpTo = said.length;
    // after a tool: just the first two sentences out loud, the rest on screen
    if (rest && this.usedTool) { const parts = rest.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [rest]; rest = parts.slice(0, 2).join("").trim(); if (parts.length > 2) this.overflow(parts.slice(2).join("").trim()); }
    if (rest && (this.spokenCount || 0) <= 2) this.enqueue(rest, false, true); else if (rest) this.overflow(rest);
    if (!this.playing && !this.queue.length) this.setState("listening");
  },
  say(t) { this.add("blink", ""); this.enqueue(t, false, true); },
  // words that aren't spoken still show, under what Blink said
  overflow(t) { const l = this.lines.slice().reverse().find((x) => x.who === "blink"); if (!l || !t) return; l.more = ((l.more ? l.more + " " : "") + t).trim(); this.paint(); },
  // the AI is searching or doing something: say so once per answer, the way a person would ("let me look that up")
  working(name) {
    if (!this.aiBusy) return;
    // whatever it wrote before this step was a plan; only what comes after the last step is the answer
    this.usedTool = true; this.segStart = this.answer.length; this.spokenUpTo = 0;
    if (this.toldWorking === this.run || (this.spokenCount || 0) > 0) return;
    this.toldWorking = this.run; clearTimeout(this.ackT);
    if (this.queue.some((j) => j.filler)) return;
    this.enqueue(/search/i.test(name) ? "Let me look that up." : "On it.", true);
  },
  // each sentence is made while the one before it plays, so there are no gaps
  enqueue(text, filler, show) {
    const line = typeof humanize === "function" ? humanize(text) : text;
    const job = { text: line, filler, show, shown: text, ready: D.test ? Promise.resolve(null) : act("voiceSay", { text: line, lang: /[؀-ۿ]/.test(line) ? "ar" : "en" }).catch(() => null) };
    this.queue.push(job); if (!this.playing) this.next();
  },
  async next() {
    const job = this.queue.shift();
    if (!job) { this.playing = null; this.quietAt = Date.now(); talking(false); if (!this.aiBusy && this.on) this.setState("listening"); return; }
    const myRun = this.run;
    this.playing = { pause() { } }; // the speaker is taken now, so nothing else starts while this sentence's audio is made
    this.setState("speaking");
    // the words appear as they're said, not before
    if (job.show) { const l = this.lastLine(); if (l.who === "blink") { l.text = (l.text ? l.text + " " : "") + job.shown; this.paint(); } }
    let moved = false; const go = () => { if (moved) return; moved = true; if (myRun === this.run) this.next(); };
    if (D.test) { D.ui.lastSpoken = job.text; this.playing = { pause() { } }; setTimeout(go, 50); return; }
    const r = await job.ready;
    if (myRun !== this.run || !this.on) return;
    if (r && r.wav) {
      const bin = atob(r.wav), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      const a = new Audio(url); this.playing = a; talking(true); this.heardSelf(job.text);
      if (this.ducked) a.volume = 0.3;
      a.onended = a.onerror = () => { URL.revokeObjectURL(url); if (this.playing === a) go(); };
      a.play().catch(() => { if (this.playing === a) go(); });
    } else {
      const u = new SpeechSynthesisUtterance(job.text); const v = typeof bestVoice === "function" ? bestVoice(false) : null; if (v) u.voice = v;
      this.playing = { pause() { try { speechSynthesis.cancel(); } catch { } } }; talking(true); this.heardSelf(job.text);
      u.onend = u.onerror = () => go();
      speechSynthesis.speak(u);
    }
  },
  stopSpeaking() { this.run++; this.queue = []; this.ducked = false; this.maybeBarge = false; try { this.playing && this.playing.pause(); speechSynthesis.cancel(); } catch { } this.playing = null; talking(false); clearTimeout(this.ackT); },

  // ---- screen ----
  add(who, text) { this.lines.push({ who, text }); if (this.lines.length > 6) this.lines.shift(); this.paint(); },
  lastLine() { return this.lines[this.lines.length - 1] || { text: "" }; },
  setState(s) { if (this.state !== s) { this.state = s; this.paint(); } },
  paint() {
    if (D.ui.sheet !== "call") return;
    // never redraw under your finger, or the tap is lost
    if (typeof pointerDown !== "undefined" && pointerDown) { clearTimeout(this.paintT); this.paintT = setTimeout(() => this.paint(), 120); return; }
    const el = $("#callBody"), h = callBodyHTML(); if (el) { if (el.__h !== h) { el.innerHTML = h; el.__h = h; const L = el.querySelector(".call-lines"); if (L) L.scrollTop = L.scrollHeight; } } else drawSheet();
  }
};
const FILLERS = ["One sec.", "Let me check.", "Sure, one moment.", "Okay, one sec."];
const WORKING = ["Let me look that up.", "On it."];
const CALL_WORDS = { starting: "Getting ready", listening: "Listening", hearing: "Listening", thinking: "Thinking", speaking: "Talking", muted: "Muted. Blink can't hear you", idle: "" };
function callBodyHTML() {
  const face = typeof blinkFace === "function" ? blinkFace(150, Call.state === "thinking" ? "working" : Call.state === "speaking" ? "done" : "idle") : "";
  return `<div class="call-face${Call.state === "hearing" ? " hearing" : ""}">${face}</div>
    <div class="call-state">${esc(CALL_WORDS[Call.state] || "")}${Call.state === "hearing" || Call.state === "starting" ? `<span class="call-dots"><i></i><i></i><i></i></span>` : ""}${(Call.state === "thinking" || Call.aiBusy) && Call.askedAt ? `<span class="call-secs">${Math.round((Date.now() - Call.askedAt) / 1000)} s</span>` : ""}</div>
    ${Call.state === "thinking" || Call.state === "speaking" || Call.aiBusy ? `<button class="btn call-stop" ${A("callStop")}>${svg("x", 18)}Stop</button>` : ""}
    ${Call.lines.length <= 1 ? `<div class="call-try"><span class="m">Try saying</span>${["play some music", "what's on today?", "open my Downloads", "remind me in 10 minutes to stretch", "how do I add a key?"].map((t) => `<span class="call-chip">"${t}"</span>`).join("")}</div>` : ""}
    <div class="call-lines">${Call.lines.filter((l, i, a) => l.text || l.screen || l.more || (i === a.length - 1 && l.who === "blink" && Call.aiBusy)).slice(-6).map((l) => `<div class="call-line ${l.who}" dir="auto">${esc(l.text || "...")}${l.more ? `<div class="call-more">${esc(l.more)}</div>` : ""}${l.screen ? `<div class="call-screen">${typeof md === "function" ? md(l.screen) : esc(l.screen)}</div>` : ""}</div>`).join("")}</div>
    ${(() => { const ask = Call.appAsk(); return ask ? `<div class="call-ask"><b>${esc(ask.app ? "Let Blink use " + ask.app + "?" : ask.what)}</b>${ask.app ? "" : `<span class="m" style="font-size:14px">${esc(ask.detail || "")}</span>`}<div style="display:flex;gap:8px;justify-content:center"><button class="btn go" ${A("approve", { id: ask.id, decision: "allow" })}>Allow</button><button class="btn" ${A("approve", { id: ask.id, decision: "deny" })}>Not now</button></div></div>` : ""; })()}`;
}
SHEETS.call = function () {
  return `<div class="shade"></div><div class="callsheet">
    <div class="call-mic${Call.muted ? " off" : ""}">${Call.muted ? "Microphone muted" : `<span class="recdot"></span>Microphone on, only during this call`}</div>
    <div id="callBody">${callBodyHTML()}</div>
    <div class="call-hint m">${Call.muted ? "Tap Unmute when you want Blink to listen again." : "Just talk. Interrupt any time. Say \"bye\" to hang up."}</div>
    <div style="display:flex;gap:10px"><button class="btn call-end${Call.muted ? " go" : ""}" ${A("callMute")}>${svg(Call.muted ? "mic" : "micoff", 20)}${Call.muted ? "Unmute" : "Mute"}</button><button class="btn warn call-end" ${A("callEnd")}>End call</button></div>
  </div>`;
};
function words(t) { return String(t || "").toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter((w) => w.length > 2); }
function wavBytes(pcm) {
  const n = pcm.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Uint8Array(buf);
}
window.panel.onCall((m) => { if (!Call.on) return; if (m.type === "taskDone") { Call.say(m.ok ? "Your Claude setup finished " + m.title + ". It's in Chats, and in the Claude app." : "Your Claude setup hit a problem with " + m.title + ". It's in Chats."); return; } if (m.type === "tool") Call.working(m.name); else if (m.type === "delta") Call.delta(m.text); else if (m.type === "done") Call.done(m.text); else if (m.type === "error") { Call.aiBusy = false; Call.say("Sorry, I lost my train of thought. Say that again?"); } });
Object.assign(H, { callStart: () => Call.start(), callEnd: () => Call.end(), callMute: () => Call.toggleMute(), callStop: () => Call.stopNow() });
// closing the call screen any other way ends the call too
const closeSheetBeforeCall = closeSheet;
closeSheet = function () { const was = D.ui.sheet; closeSheetBeforeCall(); if (was === "call" && Call.on) Call.end(); };
