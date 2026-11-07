// Asks the helper what Windows media controls see, then presses pause and next, and checks the result.
const { Helper } = require("../src/helper");
const path = require("path");
const h = new Helper(path.join(__dirname, "..", "bin", "helper", "PanelHost.exe"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await wait(1000);
  const show = (m) => (m.sessions || []).map((s) => `${s.name} | ${s.title} | ${s.artist} | playing=${s.playing} | art=${s.art ? s.art.length + " chars" : "none"} | current=${s.current}`).join("\n");
  let m = await h.call("media.get"); console.log("BEFORE\n" + show(m));
  const qa = (m.sessions || []).find((s) => /electron/i.test(s.app) || s.title === "Low Tide");
  if (!qa) { console.log("QA source not found"); h.stop(); return; }
  await h.call("media.cmd", { action: "pause", app: qa.app }); await wait(1200);
  m = await h.call("media.get"); console.log("AFTER PAUSE\n" + show(m));
  await h.call("media.cmd", { action: "play", app: qa.app }); await wait(800);
  await h.call("media.cmd", { action: "next", app: qa.app }); await wait(1200);
  m = await h.call("media.get"); console.log("AFTER NEXT\n" + show(m));
  h.stop();
})();
