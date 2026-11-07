// Same as media-cmd.js but sends commands BEFORE asking for media info (no album art read first).
const { spawn } = require("child_process");
const path = require("path");
const p = spawn(path.join(__dirname, "..", "bin", "helper", "PanelHost.exe"));
p.stdout.on("data", (d) => process.stdout.write(String(d).replace(/"art":"[^"]+"/g, '"art":"..."')));
const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
setTimeout(() => send({ id: 1, cmd: "media.cmd", arg: { action: "pause" } }), 800);
setTimeout(() => send({ id: 2, cmd: "media.cmd", arg: { action: "play" } }), 1800);
setTimeout(() => send({ id: 3, cmd: "media.get" }), 2600);
setTimeout(() => send({ id: 4, cmd: "media.cmd", arg: { action: "pause" } }), 3400);
setTimeout(() => p.kill(), 5000);
