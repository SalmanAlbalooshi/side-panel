// Proves typed text can't escape into cmd.exe: runs `cmd /c echo` with a hostile string through the same quoting.
const { execFile } = require("child_process");
const fs = require("fs");
const src = fs.readFileSync(require("path").join(__dirname, "..", "src", "ai.js"), "utf8");
const cmdQuote = new Function(src.match(/function cmdQuote[\s\S]*?\n\}/)[0] + "; return cmdQuote;")();
const hostile = 'what & echo PWNED | echo "hi" %PATH% ^ (a) !b';
const line = "\"" + ["echo", hostile].map((a, i) => (i === 0 ? a : cmdQuote(a))).join(" ") + "\"";
execFile("cmd.exe", ["/d", "/s", "/c", line], { windowsVerbatimArguments: true }, (e, out) => {
  const injected = /^PWNED/m.test(out);
  console.log(injected ? "FAIL injection ran" : "PASS text stayed text");
  console.log(out.trim());
});
