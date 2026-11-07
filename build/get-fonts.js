// Downloads the panel's fonts once so the app works offline and loads nothing from the internet.
// Output: src/renderer/fonts/*.woff2 + fonts.css. Run: node build/get-fonts.js
const https = require("https");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "src", "renderer", "fonts");
const CSS_URL = "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Archivo:wdth,wght@75,600;75,700&family=Silkscreen&display=swap";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { "User-Agent": UA } }, (r) => {
    if (r.statusCode !== 200) return rej(new Error(url + " " + r.statusCode));
    const c = []; r.on("data", (d) => c.push(d)); r.on("end", () => res(Buffer.concat(c)));
  }).on("error", rej));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let css = (await get(CSS_URL)).toString("utf8");
  // keep only the latin subsets (the panel's text is English)
  const blocks = css.split(/(?=\/\* )/).filter((b) => /^\/\* latin \*\//.test(b));
  let out = "", n = 0;
  for (const b of blocks) {
    const url = (b.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
    if (!url) continue;
    const fam = (b.match(/font-family: '([^']+)'/) || [])[1].replace(/\s+/g, "");
    const w = (b.match(/font-weight: (\d+)/) || [])[1];
    const file = fam + "-" + w + "-" + (n++) + ".woff2";
    fs.writeFileSync(path.join(OUT, file), await get(url));
    out += b.replace(url, "fonts/" + file).replace(/\/\* latin \*\/\s*/, "");
  }
  fs.writeFileSync(path.join(OUT, "..", "fonts.css"), "/* Bundled from Google Fonts (OFL). Made by build/get-fonts.js */\n" + out);
  console.log("fonts:", n);
})().catch((e) => { console.error(e.message); process.exit(1); });
