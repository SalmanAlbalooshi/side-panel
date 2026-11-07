// Synced lyrics from LRCLIB (free, no key). Only the song title, artist, album and length are sent.
// Results are cached per song for the session; a miss is cached too so we never hammer the service.
const https = require("https");

const cache = new Map();
let netFail = false;
function get(url) {
  return new Promise((resolve) => {
    const q = https.get(url, { headers: { "User-Agent": "SidePanel/1.3 (personal desktop panel)" }, timeout: 8000 }, (r) => {
      if (r.statusCode !== 200) { if (r.statusCode !== 404) netFail = true; r.resume(); resolve(null); return; }
      let t = ""; r.setEncoding("utf8");
      r.on("data", (d) => { t += d; if (t.length > 2e6) q.destroy(); });
      r.on("end", () => { try { resolve(JSON.parse(t)); } catch { resolve(null); } });
    });
    q.on("timeout", () => q.destroy());
    q.on("error", () => { netFail = true; resolve(null); });
  });
}
// "[01:23.45] line" -> [[83.45, "line"], ...]
function parseLrc(lrc) {
  const out = [];
  for (const line of String(lrc || "").split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g)];
    if (!tags.length) continue;
    const text = line.replace(/\[[^\]]*\]/g, "").trim();
    for (const t of tags) out.push([Number(t[1]) * 60 + Number(t[2]), text]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
// Strip the bits streaming apps add to titles ("- Remastered 2011", "(feat. X)") so the lookup matches.
const clean = (s) => String(s || "").replace(/\s*[-(\[](\s*)(remaster|feat\.|ft\.|live|radio edit|official|lyrics|audio|video|explicit)[^)\]]*[)\]]?/gi, "").trim();

async function find(song) {
  const key = [song.title, song.artist].join("|").toLowerCase();
  if (cache.has(key)) return cache.get(key);
  cache.set(key, null);
  netFail = false;
  const p = new URLSearchParams({ track_name: song.title, artist_name: song.artist || "" });
  if (song.album) p.set("album_name", song.album);
  if (song.dur > 0) p.set("duration", String(Math.round(song.dur)));
  let j = await get("https://lrclib.net/api/get?" + p.toString());
  if (!j || (!j.syncedLyrics && !j.plainLyrics)) {
    const s = await get("https://lrclib.net/api/search?" + new URLSearchParams({ track_name: clean(song.title), artist_name: clean(song.artist || "") }).toString());
    const near = Array.isArray(s) ? s.filter((x) => !(song.dur > 0) || Math.abs((x.duration || 0) - song.dur) <= 3) : [];
    j = near.find((x) => x.syncedLyrics) || near[0] || null;
  }
  if (!j && netFail) { cache.delete(key); return { key, none: true, retry: true }; }
  const res = j ? { key, synced: parseLrc(j.syncedLyrics).slice(0, 400), plain: j.syncedLyrics ? "" : String(j.plainLyrics || "").slice(0, 8000), instrumental: !!j.instrumental } : { key, none: true };
  cache.set(key, res);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return res;
}
module.exports = { find, parseLrc };
