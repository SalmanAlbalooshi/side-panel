// This round: Silero speech detection loads under the app's page rules; everyday asks answered on the PC; call text shows as it's spoken.
// Never uses the real mic, speakers, volume or music. Usage: node test/round7.js
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
(async () => {
  try { fs.rmSync(path.join(os.tmpdir(), "side-panel-test"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { }
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832", SP_CLAUDE: path.join(__dirname, "fake-claude.cmd"), SP_CODEX: "none" }), executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed", "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding"]), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.waitForSelector(".top", { timeout: 30000 }); await wait(1500);
  const sent = async () => (await page.evaluate(() => window.panel.testState())).sent;

  // Silero: the library, the WebAssembly runtime and the model all load inside the app's page rules
  const sil = await page.evaluate(async () => {
    try {
      const load = (src) => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("couldn't load " + src)); document.head.appendChild(s); });
      await load("vendor/vad/ort.wasm.min.js"); await load("vendor/vad/bundle.min.js");
      ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = new URL("vendor/vad/", location.href).href;
      const s = await ort.InferenceSession.create("vendor/vad/silero_vad_v5.onnx");
      return { ok: true, inputs: s.inputNames.join(","), micVad: typeof vad.MicVAD };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  ok("Silero speech detection loads in the app (runtime + model)", sil.ok && sil.micVad === "function", JSON.stringify(sil));

  // everyday asks, answered without the AI
  const ask = (t) => page.evaluate((x) => window.panel.act("command", x), t);
  let r = await ask("minimise everything"); ok("minimise everything", /desktop/i.test(r.say) && (await sent()).some((x) => /^showDesktop/.test(x)), r.say);
  r = await ask("open my downloads"); ok("open my Downloads", /downloads/i.test(r.say) && (await sent()).some((x) => /^folder downloads/.test(x)), r.say);
  r = await ask("how much battery do I have"); ok("battery", /percent|battery/i.test(r.say), r.say);
  r = await ask("what time is it in London?"); ok("time in another city", /in London/.test(r.say), r.say);
  r = await ask("turn on dark mode"); ok("dark mode", /Dark mode is on/.test(r.say) && (await sent()).some((x) => /^theme dark/.test(x)), r.say);
  r = await ask("what time is it"); ok("local time still works", /\d/.test(r.say) && !/ in /.test(r.say), r.say);

  // call: Blink's words appear when they're said, with "Try saying" examples at the start
  await page.evaluate(() => H.callStart()); await wait(700);
  ok("call shows 'Try saying' examples at the start", /Try saying/.test(await page.textContent(".callsheet")));
  await page.evaluate(() => Call.handle("volume 30")); await wait(600);
  ok("call: the reply text appears with the voice", await page.evaluate(() => Call.lines.some((l) => l.who === "blink" && /Volume/.test(l.text))));
  ok("call: nothing else talks during a call", await page.evaluate(() => { D.ui.lastSpoken = ""; speak("This should stay silent", true, true); return D.ui.lastSpoken === "" || !/stay silent/.test(D.ui.lastSpoken); }));
  await page.click("[data-act=callMute]"); await wait(300);
  ok("call: Mute stops listening and says so", await page.evaluate(() => Call.muted && /Muted/.test(document.querySelector(".callsheet").textContent) && /Unmute/.test(document.querySelector("[data-act=callMute]").textContent)));
  ok("call: while muted, talking over Blink does nothing", await page.evaluate(() => { Call.playing = { pause() { } }; Call.queue = [{}]; Call.heardStart(); const kept = !!Call.playing; Call.playing = null; Call.queue = []; return kept; }));
  await page.click("[data-act=callMute]"); await wait(300);
  ok("call: Unmute listens again", await page.evaluate(() => !Call.muted && /Listening/.test(document.querySelector(".callsheet").textContent)));
  ok("call: a voice from across the room is ignored", await page.evaluate(async () => { Call.myLevel = 0.2; const quiet = new Float32Array(16000).fill(0.02); const before = Call.lines.length; await Call.heardEnd([quiet]); return Call.lines.length === before; }));
  await page.evaluate(() => Call.end(true)); await wait(400);
  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await app.close();
  fs.mkdirSync(path.join(__dirname, "shots", "round7"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "round7", "results.txt"), log.join("\n"));
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
