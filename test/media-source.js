// A near-silent music source for QA: plays a tone at very low volume and announces title, artist and cover art
// to Windows media controls, exactly like Spotify or a browser would. Run: npx electron test/media-source.js [title] [artist]
const { app, BrowserWindow } = require("electron");
const path = require("path");
const title = process.argv[2] || "Low Tide";
const artist = process.argv[3] || "QA Test Artist";
app.whenReady().then(() => {
  const w = new BrowserWindow({ show: false, webPreferences: { autoplayPolicy: "no-user-gesture-required", backgroundThrottling: false } });
  // Serve the cover over a tiny local http server, like a streaming app's image URL.
  const http = require("http");
  const png = require("fs").readFileSync(path.join(__dirname, "..", "build", "cover.png"));
  http.createServer((q, r) => { r.writeHead(200, { "Content-Type": "image/png" }); r.end(png); }).on("error", () => { }).listen(47899, "127.0.0.1");
  const art = "http://127.0.0.1:47899/cover.png";
  const html = `<!doctype html><html><body><audio id="a" loop></audio><script>
    const ctx = new AudioContext(); const sr = 8000, secs = 210; const buf = new Float32Array(sr * secs);
    for (let i = 0; i < buf.length; i++) buf[i] = Math.sin(2 * Math.PI * 220 * i / sr) * 0.003;
    // build a WAV blob so a real <audio> element plays (media sessions need one)
    const dv = new DataView(new ArrayBuffer(44 + buf.length * 2)); const s = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
    s(0, "RIFF"); dv.setUint32(4, 36 + buf.length * 2, true); s(8, "WAVE"); s(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); s(36, "data"); dv.setUint32(40, buf.length * 2, true);
    for (let i = 0; i < buf.length; i++) dv.setInt16(44 + i * 2, buf[i] * 32767, true);
    const a = document.getElementById("a"); a.src = URL.createObjectURL(new Blob([dv], { type: "audio/wav" })); a.volume = 0.05;
    navigator.mediaSession.metadata = new MediaMetadata({ title: ${JSON.stringify(title)}, artist: ${JSON.stringify(artist)}, album: "QA", artwork: [{ src: ${JSON.stringify(art)}, sizes: "512x512", type: "image/png" }] });
    navigator.mediaSession.setActionHandler("play", () => a.play());
    navigator.mediaSession.setActionHandler("pause", () => a.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => { document.title = "next"; navigator.mediaSession.metadata = new MediaMetadata({ title: "Next Song", artist: ${JSON.stringify(artist)}, artwork: [{ src: ${JSON.stringify(art)}, sizes: "512x512", type: "image/png" }] }); });
    navigator.mediaSession.setActionHandler("previoustrack", () => { navigator.mediaSession.metadata = new MediaMetadata({ title: ${JSON.stringify(title)}, artist: ${JSON.stringify(artist)}, album: "QA", artwork: [{ src: ${JSON.stringify(art)}, sizes: "512x512", type: "image/png" }] }); a.currentTime = 0; });
    navigator.mediaSession.setActionHandler("seekto", (d) => { a.currentTime = d.seekTime; document.title = "seek " + Math.round(d.seekTime); upd(); });
    const upd = () => { try { navigator.mediaSession.setPositionState({ duration: 202.7, position: Math.min(a.currentTime, 202.7), playbackRate: 1 }); } catch (e) { } };
    a.addEventListener("loadedmetadata", upd); a.addEventListener("play", upd); a.addEventListener("pause", upd);
    a.play();
  </script></body></html>`;
  w.loadURL("data:text/html;base64," + Buffer.from(html).toString("base64"));
});
