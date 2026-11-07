// Prints the raw helper reply for each media command so failures show their real message.
const { spawn } = require("child_process");
const path = require("path");
const p = spawn(path.join(__dirname, "..", "bin", "helper", "PanelHost.exe"));
p.stdout.on("data", (d) => process.stdout.write(String(d).replace(/"art":"[^"]+"/g, '"art":"..."')));
const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
setTimeout(() => send({ id: 1, cmd: "media.get" }), 800);
setTimeout(() => send({ id: 2, cmd: "media.cmd", arg: { action: "pause" } }), 1600);
setTimeout(() => send({ id: 3, cmd: "media.cmd", arg: { action: "toggle" } }), 2600);
setTimeout(() => send({ id: 4, cmd: "media.cmd", arg: { action: "next" } }), 3600);
setTimeout(() => p.kill(), 5000);
