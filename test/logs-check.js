// Prints what the log reader sees on this PC right now.
const L = require("../src/claude-logs");
const s = L.recentSessions(new Set());
console.log(s.length, "recent sessions");
for (const x of s.slice(0, 5)) console.log([x.project, x.entry, x.state, String(x.now).slice(0, 60), String(x.ask || "").slice(0, 50)].join(" | "));
L.today().then((t) => console.log("today", JSON.stringify(t)));
