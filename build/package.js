// Builds the app from a clean copy that holds only what it runs: src/, package.json, README.md, plus the helper
// and the browser add-on as resources. Nothing else (tests, screenshots, old builds, your settings) can end up
// in a build, so a published release never carries personal data.
// Usage: node build/package.js [--out=release]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { packager } = require("@electron/packager");

const root = path.join(__dirname, "..");
const out = path.join(root, (process.argv.find((a) => a.startsWith("--out=")) || "--out=release").slice(6));
const stage = path.join(os.tmpdir(), "side-panel-stage");
const pkg = require(path.join(root, "package.json"));

(async () => {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  fs.cpSync(path.join(root, "src"), path.join(stage, "src"), { recursive: true });
  fs.copyFileSync(path.join(root, "README.md"), path.join(stage, "README.md"));
  const slim = { name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, main: pkg.main, author: pkg.author, license: pkg.license, updateRepo: pkg.updateRepo || "" };
  fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(slim, null, 2));

  // nothing personal in what ships: no screenshots, logs, configs or tokens
  const bad = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(png|jpe?g|log|jsonl)$|config\.json$|token/i.test(f) && !/[\\/]renderer[\\/](fonts|img|icons)[\\/]/i.test(p) && !/[\\/]renderer[\\/]icon\.png$/i.test(p)) bad.push(p); } };
  walk(stage);
  if (bad.length) { console.error("Refusing to build: personal-looking files in the app:\n" + bad.join("\n")); process.exit(1); }

  const electronVersion = require(path.join(root, "node_modules", "electron", "package.json")).version;
  const [dir] = await packager({
    dir: stage, name: "Side Panel", platform: "win32", arch: "x64", electronVersion, out, overwrite: true, prune: false,
    icon: path.join(root, "build", "icon.ico"),
    extraResource: [path.join(root, "bin", "helper"), path.join(root, "extension")],
    appCopyright: "Side Panel"
  });
  fs.rmSync(stage, { recursive: true, force: true });
  console.log("Built " + dir + " (version " + pkg.version + ")");
  console.log("App contents: " + fs.readdirSync(path.join(dir, "resources", "app")).join(", "));
})().catch((e) => { console.error("BUILD FAILED", e); process.exit(1); });
