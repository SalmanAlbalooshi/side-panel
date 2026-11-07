// Makes the two files a GitHub release needs for in-app updates:
//   dist/Side-Panel-<version>-win32-x64.zip  and  dist/SHA256SUMS.txt
// Then create a release on GitHub tagged v<version> and upload both. Installed panels see it within 12 hours
// (or at once with Settings > Check) and update with one tap. Run: npm run release
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pkg = require("../package.json");

const root = path.join(__dirname, "..");
const app = path.join(root, process.env.SP_RELEASE_DIR || "release", "Side Panel-win32-x64");
if (!fs.existsSync(path.join(app, "Side Panel.exe"))) { console.error("Build first: npm run package"); process.exit(1); }
const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });
const name = "Side-Panel-" + pkg.version + "-win32-x64.zip";
// a one-click installer for people (updates ignore it): no admin rights, it installs for the current user only
fs.copyFileSync(path.join(__dirname, "Install.cmd"), path.join(app, "Install.cmd"));
const zip = path.join(dist, name);
if (fs.existsSync(zip)) fs.unlinkSync(zip);
execFileSync("powershell.exe", ["-NoProfile", "-Command", "Compress-Archive -Path (Join-Path $env:SP_APP '*') -DestinationPath $env:SP_ZIP -CompressionLevel Optimal"], { env: Object.assign({}, process.env, { SP_APP: app, SP_ZIP: zip }), stdio: "inherit" });
const hash = crypto.createHash("sha256").update(fs.readFileSync(zip)).digest("hex");
fs.writeFileSync(path.join(dist, "SHA256SUMS.txt"), hash + "  " + name + "\n");
console.log("Ready in dist/:\n  " + name + "\n  SHA256SUMS.txt\nCreate a GitHub release tagged v" + pkg.version + " in " + (pkg.updateRepo || "<set updateRepo in package.json>") + " and upload both files.");
