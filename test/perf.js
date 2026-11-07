// How light the panel is: CPU and memory while it sits idle for a minute, and how often the screen redraws.
// Usage: node test/perf.js   (PANEL_EXE=<path> for the packaged app)
const { _electron: electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, note) => { log.push((cond ? "PASS " : "FAIL ") + name + (note ? " - " + String(note).slice(0, 200) : "")); console.log(log[log.length - 1]); };
(async () => {
  const exe = process.env.PANEL_EXE;
  const app = await electron.launch({ env: Object.assign({}, process.env, { SP_HOOK_PORT: "47831", SP_WEB_PORT: "47832" }), executablePath: exe || undefined, args: (exe ? [] : [path.join(__dirname, "..")]).concat(["--test", "--windowed"]), cwd: path.join(__dirname, "..") });
  const page = await app.firstWindow();
  await page.waitForSelector(".top", { timeout: 30000 });
  await page.evaluate(() => window.panel.testLive({ fg: { fullscreen: false, app: "explorer", title: "" } }));
  await wait(20000); // let discovery and first polls settle
  await page.evaluate(() => { window.__redraws = 0; new MutationObserver((ms) => { for (const m of ms) if (m.target.id === "app" && m.type === "childList") window.__redraws++; }).observe(document.getElementById("app"), { childList: true }); });
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await wait(5000);
    samples.push(await app.evaluate(({ app }) => app.getAppMetrics().map((m) => ({ type: m.type, cpu: m.cpu.percentCPUUsage, mem: m.memory.workingSetSize, priv: m.memory.privateBytes || m.memory.workingSetSize }))));
  }
  const redraws = await page.evaluate(() => window.__redraws);
  console.log("by process:", JSON.stringify(samples[samples.length - 1].map((m) => m.type + " " + Math.round(m.priv / 1024) + "MB private, " + Math.round(m.mem / 1024) + "MB set, " + m.cpu.toFixed(2) + "%")));
  const cpu = samples.map((s) => s.reduce((n, m) => n + m.cpu, 0));
  const avgCpu = cpu.reduce((a, b) => a + b, 0) / cpu.length, peakCpu = Math.max(...cpu);
  const memMB = Math.round(samples[samples.length - 1].reduce((n, m) => n + m.priv, 0) / 1024);
  const helperMB = await app.evaluate(async () => { try { const { execSync } = require("child_process"); const o = execSync('tasklist /FI "IMAGENAME eq PanelHost.exe" /FO CSV /NH').toString(); const m = o.match(/"([\d,.]+) K"/); return m ? Math.round(Number(m[1].replace(/[,.]/g, "")) / 1024) : 0; } catch { return -1; } });
  console.log("avg CPU %", avgCpu.toFixed(2), "peak", peakCpu.toFixed(2), "| memory MB (app)", memMB, "| helper MB", helperMB, "| redraws/min", redraws);
  ok("idle CPU stays low (under 2% on average)", avgCpu < 2, avgCpu.toFixed(2) + "%");
  ok("no idle CPU spikes over 10%", peakCpu < 10, peakCpu.toFixed(2) + "%");
  ok("memory stays modest (under 400 MB for the app)", memMB < 400, memMB + " MB");
  ok("the screen doesn't redraw constantly when idle (under 40 a minute)", redraws < 40, redraws + " per minute");
  // nobody at the PC: idle animations rest
  await page.evaluate(() => window.panel.testLive({ idleSec: 600 })); await wait(4000);
  const rest = [];
  for (let i = 0; i < 6; i++) { await wait(5000); rest.push((await app.evaluate(({ app }) => app.getAppMetrics())).reduce((n, m) => n + m.cpu.percentCPUUsage, 0)); }
  const restCpu = rest.reduce((a, b) => a + b, 0) / rest.length;
  console.log("resting CPU %", restCpu.toFixed(2), "calm:", await page.evaluate(() => document.body.classList.contains("calm")));
  ok("when nobody is at the PC, the panel rests (under 1% CPU)", restCpu < 1, restCpu.toFixed(2) + "%");
  await app.close();
  fs.mkdirSync(path.join(__dirname, "shots", "perf"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "shots", "perf", "results.txt"), log.join("\n") + "\navg CPU " + avgCpu.toFixed(2) + "% peak " + peakCpu.toFixed(2) + "% memory " + memMB + " MB helper " + helperMB + " MB redraws/min " + redraws);
})().catch((e) => { console.error("TEST CRASH", e); process.exit(1); });
