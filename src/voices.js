// Human-sounding voices that run on this PC. Nothing is sent anywhere.
// Light by design: nothing downloads until the person turns a voice on, downloads pause during games and calls,
// the voice engine runs only while it is speaking, at below-normal priority, and finished lines are cached.
// Without a downloaded voice, the panel uses the Windows voices that every PC already has.
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");

const GH = "https://github.com/k2-fsa/sherpa-onnx/releases/download/";
const CATALOG = {
  // 1.12.40 on purpose: 2.0 removed the built-in English pronunciation these voices need
  engine: { label: "Voice engine", what: "The small program that turns text into speech (sherpa-onnx, Apache 2.0).", url: GH + "v1.12.40/sherpa-onnx-v1.12.40-win-x64-shared-MT-Release.tar.bz2", bytes: 23272584, sha256: "7555e9fa5e30e5b47feea1700090086c0fa2a91dd09754922ac7d79a72f46f91", dir: "sherpa-onnx-v1.12.40-win-x64-shared-MT-Release" },
  en: { label: "Natural voice", what: "Cori, a natural English voice that runs well on any PC (public domain).", url: GH + "tts-models/vits-piper-en_GB-cori-high-int8.tar.bz2", bytes: 35038210, sha256: "115adb9000159c3a90076fff8ba75ae4d26ccbbc749a444a24dc277b0dad872b", dir: "vits-piper-en_GB-cori-high-int8", lang: "en", kind: "vits", model: "en_GB-cori-high.onnx" },
  best: { label: "Most human voice", what: "Heart (Kokoro), the most human-sounding voice. For PCs with 4+ cores and 8 GB+ (Apache 2.0).", url: GH + "tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2", bytes: 132353410, sha256: "72c347230107ef8a31098ec4d468a605244beef5f1ed00db97efa13518800653", dir: "kokoro-int8-multi-lang-v1_0", lang: "en", kind: "kokoro10", heavy: true },
  ears: { hidden: true, label: "Blink's ears", what: "Moonshine, fast speech recognition on this PC (MIT).", url: GH + "asr-models/sherpa-onnx-moonshine-tiny-en-int8.tar.bz2", bytes: 107600538, sha256: "d5fe6ec4334fef36255b2a4010412cad4c007e33103fec62fb5d17cad88086f2", dir: "sherpa-onnx-moonshine-tiny-en-int8" },
  earsPro: { hidden: true, label: "Blink's ears (best)", what: "NVIDIA Parakeet TDT 0.6B v2, the most accurate English speech recognition that runs on this PC (CC-BY-4.0).", url: GH + "asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2", bytes: 482440461, sha256: "6fc4426b54aa549a0019b8a75b8dea59164e71790a37ac56a045ad57f915f714", dir: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8", kind: "nemo", heavy: true },
  earsBase: { hidden: true, label: "Blink's ears (accurate)", what: "Moonshine Base, accurate speech recognition on this PC (MIT).", url: GH + "asr-models/sherpa-onnx-moonshine-base-en-int8.tar.bz2", bytes: 250807309, sha256: "21870cecaa2e44e4e2bf63e02d1072bed183ccd10284871353bd9d24dad14e5e", dir: "sherpa-onnx-moonshine-base-en-int8" },
  bestOld: { hidden: true, label: "Kokoro 0.19", url: GH + "tts-models/kokoro-int8-en-v0_19.tar.bz2", bytes: 103248205, sha256: "c9f0dd393615805b0bab050c340834d5e684e732aec91c0e860cd30e982c08bd", dir: "kokoro-int8-en-v0_19", lang: "en", kind: "kokoro", heavy: true },
  ar: { label: "Arabic voice", what: "Piper Arabic voice (Jordanian accent). Its licence is not confirmed yet.", url: GH + "tts-models/vits-piper-ar_JO-SA_miro_V2-high-int8.tar.bz2", bytes: 21875982, sha256: "20f4db99d450986716ea9149a4df068158f69c91bde3859ab28d537ddfc57ce6", dir: "vits-piper-ar_JO-SA_miro_V2-high-int8", lang: "ar", kind: "vits", model: "ar_JO-SA_miro_V2-high.onnx", licenceUnclear: true }
};
const MB = (b) => Math.round(b / 1048576);

class Voices {
  constructor(root, o) {
    this.root = root; this.o = o || {}; // o.busy(): true during games and calls; o.onChange(): progress for the screen
    this.jobs = {}; this.queue = Promise.resolve();
    try { fs.mkdirSync(path.join(root, "cache"), { recursive: true }); } catch { }
    try { for (const d of fs.readdirSync(root)) if (/^sherpa-onnx-v/.test(d) && d !== CATALOG.engine.dir) fs.rmSync(path.join(root, d), { recursive: true, force: true }); } catch { }
    try { const e = path.join(root, CATALOG.engine.dir); if (fs.existsSync(path.join(e, ".ok")) && (!fs.existsSync(path.join(e, "bin", "sherpa-onnx-offline.exe")) || !fs.existsSync(path.join(e, "bin", "sherpa-onnx-offline-websocket-server.exe")) || !fs.existsSync(path.join(e, "bin", "sherpa-onnx-c-api.dll")))) fs.rmSync(e, { recursive: true, force: true }); } catch { }
  }
  // a PC with 4+ cores and 8 GB+ can run the natural English voice without slowing down; others keep Windows voices
  capable() { return os.cpus().length >= 4 && os.totalmem() >= 8 * 1024 ** 3; }
  // the best recognizer this PC has (the accurate one on capable PCs)
  // the best hearing this PC has (Parakeet unless it failed to start here before), then Moonshine Base, then Tiny
  earsId() { return this.has("earsPro") && !this.proBroken() ? "earsPro" : this.has("earsBase") ? "earsBase" : "ears"; }
  earsPreferred() { return this.strong() && !this.proBroken() ? "earsPro" : this.capable() ? "earsBase" : "ears"; }
  strong() { return os.cpus().length >= 6 && os.totalmem() >= 12 * 1024 ** 3; }
  proBroken() { try { return fs.existsSync(path.join(this.root, "ears-pro-failed")); } catch { return false; } }
  // the recognizer's files, by model kind
  earsArgs(id) {
    const c = CATALOG[id], d = path.join(this.root, c.dir);
    return c.kind === "nemo"
      ? ["--encoder=" + path.join(d, "encoder.int8.onnx"), "--decoder=" + path.join(d, "decoder.int8.onnx"), "--joiner=" + path.join(d, "joiner.int8.onnx"), "--tokens=" + path.join(d, "tokens.txt"), "--model-type=nemo_transducer"]
      : ["--moonshine-preprocessor=" + path.join(d, "preprocess.onnx"), "--moonshine-encoder=" + path.join(d, "encode.int8.onnx"), "--moonshine-uncached-decoder=" + path.join(d, "uncached_decode.int8.onnx"), "--moonshine-cached-decoder=" + path.join(d, "cached_decode.int8.onnx"), "--tokens=" + path.join(d, "tokens.txt")];
  }
  preferred() { return this.capable() ? "best" : "en"; }
  ready() { return this.has("engine") && (this.has("best") && this.capable() || this.has("en")); }
  has(id) { const c = CATALOG[id]; return !!c && fs.existsSync(path.join(this.root, c.dir, ".ok")); }
  exe() { return path.join(this.root, CATALOG.engine.dir, "bin", "sherpa-onnx-offline-tts.exe"); }
  list() {
    return Object.entries(CATALOG).filter(([id, c]) => id !== "engine" && !c.hidden).map(([id, c]) => {
      const need = this.has("engine") ? 0 : CATALOG.engine.bytes;
      const j = this.jobs[id];
      return { id, label: c.label, what: c.what, mb: MB(c.bytes + need), installed: this.has(id) && this.has("engine"), heavy: !!c.heavy, tooHeavy: !!c.heavy && !this.capable(), licenceUnclear: !!c.licenceUnclear, job: j ? { pct: j.pct, state: j.state, error: j.error } : null };
    });
  }
  view() { return { capable: this.capable(), voices: this.list(), cores: os.cpus().length, ramGB: Math.round(os.totalmem() / 1024 ** 3), lastError: this.lastError || null, lastOk: this.lastOk || null }; }
  changed() { try { this.o.onChange && this.o.onChange(this.view()); } catch { } }

  // download + check + unpack, one at a time, so a weak connection or PC is never swamped
  install(id) {
    if (!CATALOG[id] || id === "engine") return { error: "Unknown voice" };
    if (this.jobs[id] && !["failed", "done"].includes(this.jobs[id].state)) return { ok: true };
    if (this.has(id) && this.has("engine")) return { ok: true };
    const job = this.jobs[id] = { pct: 0, state: "waiting" };
    this.changed();
    this.queue = this.queue.then(async () => {
      try {
        const parts = (this.has("engine") ? [] : ["engine"]).concat(this.has(id) ? [] : [id]);
        const total = parts.reduce((n, p) => n + CATALOG[p].bytes, 0); let doneBytes = 0;
        for (const p of parts) {
          job.state = "downloading";
          const file = await this.fetch(CATALOG[p], (got) => { job.pct = Math.min(99, Math.round(((doneBytes + got) / total) * 100)); this.changed(); }, job);
          job.state = "unpacking"; this.changed();
          await this.unpack(p, file);
          doneBytes += CATALOG[p].bytes;
        }
        job.state = "done"; job.pct = 100; this.changed();
        setTimeout(() => { delete this.jobs[id]; this.changed(); }, 4000);
      } catch (e) { job.state = "failed"; job.error = String(e.message || e); this.changed(); }
    });
    return { ok: true };
  }
  fetch(c, onProgress, job) {
    const tmp = path.join(this.root, path.basename(c.url) + ".part");
    return new Promise((resolve, reject) => {
      const get = (url, hops) => {
        const req = https.get(url, { headers: { "User-Agent": "Side-Panel" }, timeout: 30000 }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) { res.resume(); return get(new URL(res.headers.location, url).toString(), hops + 1); }
          if (res.statusCode !== 200) { res.resume(); return reject(new Error("Download failed (" + res.statusCode + "). Check the internet and try again.")); }
          const out = fs.createWriteStream(tmp), hash = crypto.createHash("sha256"); let got = 0;
          // pause while a game or a call is on, so the download never costs a frame or a word
          const pauser = setInterval(() => { const busy = this.o.busy && this.o.busy(); if (busy && !res.isPaused()) { res.pause(); job.state = "paused"; this.changed(); } else if (!busy && res.isPaused()) { res.resume(); job.state = "downloading"; this.changed(); } }, 2000);
          res.on("data", (d) => { got += d.length; hash.update(d); onProgress(got); });
          res.pipe(out);
          out.on("finish", () => {
            clearInterval(pauser);
            if (hash.digest("hex") !== c.sha256) { fs.rm(tmp, { force: true }, () => { }); return reject(new Error("The download was damaged. Try again.")); }
            resolve(tmp);
          });
          res.on("error", () => { clearInterval(pauser); fs.rm(tmp, { force: true }, () => { }); reject(new Error("The download stopped. Check the internet and try again.")); });
        });
        req.on("timeout", () => req.destroy(new Error("The download timed out. Try again.")));
        req.on("error", (e) => reject(new Error(/timed out/.test(e.message) ? e.message : "Couldn't reach GitHub. Check the internet and try again.")));
      };
      get(c.url, 0);
    });
  }
  unpack(id, file) {
    const c = CATALOG[id];
    return new Promise((resolve, reject) => {
      // Windows 10 and 11 ship tar.exe, which reads .tar.bz2
      const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
      execFile(fs.existsSync(tar) ? tar : "tar", ["-xjf", file, "-C", this.root], { windowsHide: true, timeout: 300000 }, (err) => {
        fs.rm(file, { force: true }, () => { });
        if (err) return reject(new Error("Couldn't unpack the voice."));
        const dir = path.join(this.root, c.dir);
        if (id === "engine") { // keep only what speaking needs (about 30 MB instead of 49)
          try { fs.copyFileSync(path.join(dir, "lib", "sherpa-onnx-c-api.dll"), path.join(dir, "bin", "sherpa-onnx-c-api.dll")); } catch { }
          for (const sub of ["include", "lib"]) fs.rmSync(path.join(dir, sub), { recursive: true, force: true });
          const bin = path.join(dir, "bin");
          for (const f of fs.readdirSync(bin)) if (/\.exe$/i.test(f) && !["sherpa-onnx-offline-tts.exe", "sherpa-onnx-offline.exe", "sherpa-onnx-offline-websocket-server.exe"].includes(f)) fs.rmSync(path.join(bin, f), { force: true });
        }
        fs.writeFileSync(path.join(dir, ".ok"), new Date().toISOString());
        resolve();
      });
    });
  }
  remove(id) {
    const c = CATALOG[id]; if (!c || id === "engine") return { error: "Unknown voice" };
    fs.rmSync(path.join(this.root, c.dir), { recursive: true, force: true });
    if (!["en", "best", "ar"].some((v) => this.has(v))) fs.rmSync(path.join(this.root, CATALOG.engine.dir), { recursive: true, force: true });
    fs.rmSync(path.join(this.root, "cache"), { recursive: true, force: true }); fs.mkdirSync(path.join(this.root, "cache"), { recursive: true });
    this.changed(); return { ok: true };
  }

  // speak: returns a WAV file path, or null so the panel uses the Windows voice
  say(text, lang, enabled) {
    let id = lang === "ar" ? "ar" : "en";
    if (id === "en" && this.has("best") && this.capable() && (!enabled || enabled.best !== false)) id = "best";
    if (!this.has(id) || !this.has("engine")) return Promise.resolve(null);
    text = String(text || "").replace(/\s+/g, " ").replace(/%/g, " percent").replace(/"/g, "'").trim().replace(/^-+\s*/, "").slice(0, 600);
    if (!text) return Promise.resolve(null);
    const c = CATALOG[id], d = path.join(this.root, c.dir);
    const wav = path.join(this.root, "cache", crypto.createHash("sha1").update(id + "|" + text).digest("hex") + ".wav");
    if (fs.existsSync(wav)) return Promise.resolve(wav);
    const threads = String(Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))));
    // the kept-loaded voice first; if it ever fails, this sentence (and later ones after 3 failures) use the old way
    if (this.useHost()) return this.sayHost(id, c, d, text, wav, threads).catch((e) => { this.hostFails = (this.hostFails || 0) + 1; this.note(id, "voice host: " + (e && e.message), ""); return this.sayCli(id, c, d, text, wav, threads); });
    return this.sayCli(id, c, d, text, wav, threads);
  }
  useHost() { return !!(this.o.hostExe && (this.hostFails || 0) < 3 && fs.existsSync(path.join(this.root, CATALOG.engine.dir, "bin", "sherpa-onnx-c-api.dll")) && fs.existsSync(this.o.hostExe())); }
  host() {
    if (this.h && this.h.p.exitCode === null && !this.h.dead) return this.h.ready;
    const p = spawn(this.o.hostExe(), ["--tts", path.join(this.root, CATALOG.engine.dir, "bin")], { windowsHide: true });
    const h = { p, buf: "", wait: new Map(), n: 0 };
    h.ready = new Promise((res) => { h.onReady = res; setTimeout(() => res(false), 10000); });
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (x) => {
      h.buf += x; let i;
      while ((i = h.buf.indexOf("\n")) >= 0) {
        const l = h.buf.slice(0, i); h.buf = h.buf.slice(i + 1); let j; try { j = JSON.parse(l); } catch { continue; }
        if (j.ready !== undefined) { if (!j.ready) this.note("voice host", j.error || "didn't start", ""); h.onReady(!!j.ready); continue; }
        const w = h.wait.get(j.id); if (w) { h.wait.delete(j.id); w(j); }
      }
    });
    p.stderr.on("data", () => { });
    p.on("error", () => { h.dead = true; h.onReady(false); });
    p.on("exit", () => { h.dead = true; h.onReady(false); for (const w of h.wait.values()) w({ error: "the voice stopped" }); h.wait.clear(); });
    this.h = h;
    return h.ready;
  }
  async sayHost(id, c, d, text, wav, threads) {
    if (!(await this.host())) throw new Error("the voice host didn't start");
    const h = this.h, n = ++h.n, started = Date.now();
    const r = await new Promise((res) => {
      h.wait.set(n, res);
      h.p.stdin.write(JSON.stringify({ id: n, voice: id, kind: c.kind || "vits", dir: d, model: c.model || "", sid: c.kind === "kokoro10" ? 3 : c.kind === "kokoro" ? 1 : 0, threads: Number(threads), text, out: wav }) + "\n");
      setTimeout(() => { if (h.wait.has(n)) { h.wait.delete(n); res({ error: "took too long" }); } }, 20000);
    });
    if (!r.ok || !fs.existsSync(wav) || fs.statSync(wav).size < 1000) throw new Error(r.error || "no audio");
    this.lastOk = { id, ms: Date.now() - started, kept: true }; this.lastError = null; this.trim();
    return wav;
  }
  stopHost() { if (this.h) { try { this.h.p.stdin.end(); this.h.p.kill(); } catch { } this.h = null; } }
  // the old way: start the engine for this one sentence
  sayCli(id, c, d, text, wav, threads) {
    const args = (c.kind === "kokoro10"
      ? ["--kokoro-model=" + path.join(d, "model.int8.onnx"), "--kokoro-voices=" + path.join(d, "voices.bin"), "--kokoro-tokens=" + path.join(d, "tokens.txt"), "--kokoro-data-dir=" + path.join(d, "espeak-ng-data"), "--kokoro-dict-dir=" + path.join(d, "dict"), "--kokoro-lexicon=" + path.join(d, "lexicon-us-en.txt") + "," + path.join(d, "lexicon-zh.txt"), "--sid=3"]
      : c.kind === "kokoro"
      ? ["--kokoro-model=" + path.join(d, "model.int8.onnx"), "--kokoro-voices=" + path.join(d, "voices.bin"), "--kokoro-tokens=" + path.join(d, "tokens.txt"), "--kokoro-data-dir=" + path.join(d, "espeak-ng-data"), "--sid=1"]
      : ["--vits-model=" + path.join(d, c.model), "--vits-tokens=" + path.join(d, "tokens.txt"), "--vits-data-dir=" + path.join(d, "espeak-ng-data")]
    ).concat(["--num-threads=" + threads, "--output-filename=" + wav, text]);
    return new Promise((resolve) => {
      let child;
      // non-English text goes through a UTF-8 console, as the sherpa-onnx FAQ advises for Windows
      if (/[^\x00-\x7f]/.test(text)) {
        const q = (s) => '"' + String(s).replace(/"/g, "'") + '"';
        child = spawn("cmd.exe", ["/d", "/s", "/c", '"chcp 65001 >nul & ' + [this.exe()].concat(args).map(q).join(" ") + '"'], { windowsHide: true, windowsVerbatimArguments: true });
      } else child = spawn(this.exe(), args, { windowsHide: true });
      try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { }
      let err = "";
      if (child.stderr) child.stderr.on("data", (d) => { err = (err + d).slice(-4000); });
      if (child.stdout) child.stdout.on("data", (d) => { err = (err + d).slice(-4000); });
      const started = Date.now();
      const t = setTimeout(() => { err += "\n[stopped after 25 s]"; try { child.kill(); } catch { } }, 25000);
      child.on("error", (e) => { clearTimeout(t); this.note(id, "couldn't start: " + e.message, err); resolve(null); });
      child.on("exit", (code) => {
        clearTimeout(t);
        const okWav = fs.existsSync(wav) && fs.statSync(wav).size > 1000;
        if (okWav) { this.lastOk = { id, ms: Date.now() - started }; this.lastError = null; } else this.note(id, "exit code " + code, err);
        resolve(okWav ? wav : null); this.trim();
      });
    });
  }
  // what you said, as text: a short 16 kHz WAV in, words out (about half a second on most PCs)
  hear(wav) {
    const exe = path.join(this.root, CATALOG.engine.dir, "bin", "sherpa-onnx-offline.exe");
    if (!this.has(this.earsId()) || !fs.existsSync(exe)) return Promise.resolve({ error: "not ready" });
    const threads = String(Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))));
    const args = this.earsArgs(this.earsId()).concat(["--num-threads=" + threads, wav]);
    return new Promise((resolve) => {
      const child = spawn(exe, args, { windowsHide: true });
      try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { }
      let out = ""; const started = Date.now();
      child.stdout.on("data", (x) => { out += x; }); child.stderr.on("data", (x) => { out += x; });
      const t = setTimeout(() => { try { child.kill(); } catch { } }, 20000);
      child.on("error", (e) => { clearTimeout(t); this.note("ears", "couldn't start: " + e.message, out); resolve({ error: "couldn't start" }); });
      child.on("exit", (code) => {
        clearTimeout(t);
        const all = [...out.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
        if (all.length) { let text = all[all.length - 1][1]; try { text = JSON.parse('"' + text + '"'); } catch { } return resolve({ text: text.trim(), ms: Date.now() - started }); }
        this.note("ears", "exit code " + code, out); resolve({ error: "didn't understand" });
      });
    });
  }
  // during a call the recognizer stays loaded and answers over a local socket in a fraction of a second
  startEars() {
    if (this.earsProc && this.earsProc.exitCode === null) return Promise.resolve(this.earsPort);
    const id = this.earsId(), exe = path.join(this.root, CATALOG.engine.dir, "bin", "sherpa-onnx-offline-websocket-server.exe");
    if (!this.has(id) || !fs.existsSync(exe)) return Promise.resolve(null);
    const port = 47900 + Math.floor(Math.random() * 90);
    const threads = String(Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))));
    const p = spawn(exe, ["--port=" + port, "--max-batch-size=1", "--num-work-threads=1", "--num-io-threads=1"].concat(this.earsArgs(id), ["--num-threads=" + threads]), { windowsHide: true });
    // normal priority: during a call, hearing you comes first, even with a game running
    let out = ""; p.stdout.on("data", (x) => { out = (out + x).slice(-3000); }); p.stderr.on("data", (x) => { out = (out + x).slice(-3000); });
    this.earsProc = p; this.earsPort = port;
    return new Promise((resolve) => {
      const t0 = Date.now();
      const check = () => {
        // Parakeet didn't start on this PC: remember that and use the next best ears, right now
        const fallback = (why) => { this.note("ears", why, out); if (id === "earsPro") { try { fs.writeFileSync(path.join(this.root, "ears-pro-failed"), new Date().toISOString() + " " + why); } catch { } try { p.kill(); } catch { } this.earsProc = null; return resolve(this.startEars()); } resolve(null); };
        if (p.exitCode !== null) return fallback("the listening server stopped (exit " + p.exitCode + ")");
        const s = require("net").connect(port, "127.0.0.1", () => { s.destroy(); resolve(port); });
        s.on("error", () => { s.destroy(); if (Date.now() - t0 > 25000) fallback("the listening server didn't start"); else setTimeout(check, 250); });
      };
      setTimeout(check, 300);
    });
  }
  stopEars() { if (this.earsProc) { try { this.earsProc.kill(); } catch { } this.earsProc = null; } }
  prewarm(lines) {
    if (this.warming) { this.warmNext = lines; return; }
    this.warming = true;
    (async () => {
      for (const t of (lines || []).slice(0, 40)) { if (this.o.busy && this.o.busy()) break; await this.say(t, /[\u0600-\u06FF]/.test(t) ? "ar" : "en"); }
      this.warming = false;
      if (this.warmNext) { const n = this.warmNext; this.warmNext = null; this.prewarm(n); }
    })();
  }
  // why the natural voice didn't play, in a file and for the Settings screen
  note(id, what, err) {
    const plain = /0xc0000135|dll/i.test(what + err) ? "a file the voice needs is missing"
      : /access is denied|blocked|0x800700e1|virus|smartscreen|5$/i.test(what + err) ? "Windows blocked the voice program (antivirus or a company policy)"
      : /stopped after 25 s/.test(err) ? "it took too long on this PC"
      : /couldn't start/.test(what) ? "the voice program couldn't start"
      : "the voice program stopped with an error";
    this.lastError = { id, plain, what, at: Date.now() };
    try { fs.appendFileSync(path.join(this.root, "voice-log.txt"), new Date().toISOString() + " " + id + " " + what + "\n" + String(err || "").trim().slice(-2000) + "\n\n"); } catch { }
    this.changed();
  }
  // the cache stays small: newest 200 lines
  trim() {
    try {
      const dir = path.join(this.root, "cache");
      const fsx = fs.readdirSync(dir).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      for (const x of fsx.slice(200)) fs.rmSync(path.join(dir, x.f), { force: true });
    } catch { }
  }
}
module.exports = { Voices, CATALOG };
