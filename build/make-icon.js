// Draws the app icon (Pip on a dark tile) as PNG and ICO, with no image tools needed.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function png(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => { const i = (y * size + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3]; };
  const bg = [17, 22, 29, 255], blue = [134, 168, 255, 255], eye = [17, 22, 29, 255];
  const r = size * 0.18;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = Math.max(0, Math.max(r - x, x - (size - 1 - r))), dy = Math.max(0, Math.max(r - y, y - (size - 1 - r)));
    set(x, y, dx * dx + dy * dy <= r * r ? bg : [0, 0, 0, 0]);
  }
  const u = size / 16;
  const rect = (gx, gy, gw, gh, c) => { for (let y = Math.round(gy * u); y < Math.round((gy + gh) * u); y++) for (let x = Math.round(gx * u); x < Math.round((gx + gw) * u); x++) set(x, y, c); };
  rect(3, 3.5, 10, 8, blue); rect(4, 11.5, 2, 2, blue); rect(10, 11.5, 2, 2, blue);
  rect(5, 5.5, 2, 3, eye); rect(9, 5.5, 2, 3, eye);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const sizes = [16, 32, 48, 256];
const pngs = sizes.map(png);
const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => { const e = Buffer.alloc(16); e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12); offset += pngs[i].length; return e; });
fs.writeFileSync(path.join(__dirname, "icon.ico"), Buffer.concat([head, ...dir, ...pngs]));
fs.writeFileSync(path.join(__dirname, "..", "src", "renderer", "icon.png"), png(32));
console.log("icons written");
