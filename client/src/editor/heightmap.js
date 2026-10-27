import { unzlibSync, zlibSync } from "fflate";
import { LAND_FT, LandGrid, SEA_FLOOR_FT, landBounds } from "../world/landGrid.js";

// The land grid as a 16-bit grayscale PNG, the heightmap format terrain tools share: one pixel per
// grid point (LAND_FT ft), north at the top, black at the lowest height and white at the highest.
// An exported map keeps where it sits and its height range in a "delve3d" text chunk, so it comes
// back exactly where it was; a map from another tool needs its range given, and is put down
// centred where asked.

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const KEY = "delve3d";

// { bytes, low, high } for the land, or null when there's none.
export function exportHeightmap(land) {
  const bounds = landBounds(land);
  if (!bounds) return null;
  const [gx0, gz0] = [bounds[0] / LAND_FT, bounds[1] / LAND_FT];
  const [width, height] = [(bounds[2] - bounds[0]) / LAND_FT, (bounds[3] - bounds[1]) / LAND_FT];
  let [low, high] = [Infinity, -Infinity];
  for (const block of land.blocks.values()) {
    for (const h of block) [low, high] = [Math.min(low, h), Math.max(high, h)];
  }
  if (high <= low) high = low + 1;
  const values = new Uint16Array(width * height);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) values[z * width + x] = Math.round(((land.point(gx0 + x, gz0 + z) - low) / (high - low)) * 65535);
  }
  const text = JSON.stringify({ gx: gx0, gz: gz0, low, high, ft: LAND_FT });
  return { bytes: encodePng(width, height, values, { [KEY]: text }), low, high };
}

// A land grid from a heightmap PNG. `range` ([low, high] in ft) and `centre` ([x, z] in continent
// feet) are for maps without our text chunk.
export function importHeightmap(bytes, { range, centre } = {}) {
  const png = decodePng(bytes);
  const ours = png.text[KEY] ? JSON.parse(png.text[KEY]) : null;
  const [low, high] = ours ? [ours.low, ours.high] : range;
  const gx0 = ours ? ours.gx : Math.round(centre[0] / LAND_FT - png.width / 2);
  const gz0 = ours ? ours.gz : Math.round(centre[1] / LAND_FT - png.height / 2);
  const step = (high - low) / 65535;
  const land = new LandGrid();
  for (let z = 0; z < png.height; z++) {
    for (let x = 0; x < png.width; x++) {
      const h = low + png.values[z * png.width + x] * (high - low);
      // Sea floor is what the grid holds anyway, so it's left out to keep the grid sparse.
      if (Math.abs(h - SEA_FLOOR_FT) > step) land.set(gx0 + x, gz0 + z, h);
    }
  }
  return land;
}

// Whether a heightmap needs its height range given: it isn't one of ours.
export function needsRange(bytes) {
  return !decodePng(bytes).text[KEY];
}

// --- PNG ---

export function encodePng(width, height, values, text = {}) {
  const raw = new Uint8Array(height * (1 + width * 2));
  for (let z = 0; z < height; z++) {
    const row = z * (1 + width * 2);
    for (let x = 0; x < width; x++) {
      const v = values[z * width + x];
      raw[row + 1 + x * 2] = v >> 8;
      raw[row + 2 + x * 2] = v & 255;
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([16, 0, 0, 0, 0], 8); // 16-bit grayscale, not interlaced
  const chunks = [chunk("IHDR", header)];
  for (const [key, value] of Object.entries(text)) chunks.push(chunk("tEXt", new TextEncoder().encode(`${key}\0${value}`)));
  chunks.push(chunk("IDAT", zlibSync(raw)), chunk("IEND", new Uint8Array(0)));
  return concat([new Uint8Array(SIGNATURE), ...chunks]);
}

// { width, height, values, text }: values the first channel of each pixel, 0 to 1. Takes grayscale,
// RGB, and either with alpha, at 8 or 16 bits; not palettes, low bit depths or interlacing.
export function decodePng(bytes) {
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error("it isn't a PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let header = null;
  const data = [];
  const text = {};
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") header = { width: view.getUint32(at + 8), height: view.getUint32(at + 12), depth: body[8], color: body[9], interlace: body[12] };
    else if (type === "IDAT") data.push(body);
    else if (type === "tEXt") {
      const nul = body.indexOf(0);
      text[new TextDecoder().decode(body.subarray(0, nul))] = new TextDecoder().decode(body.subarray(nul + 1));
    } else if (type === "IEND") break;
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header?.color];
  if (!channels || ![8, 16].includes(header.depth)) throw new Error("only grayscale or RGB PNGs at 8 or 16 bits work");
  if (header.interlace) throw new Error("interlaced PNGs don't work");
  const { width, height, depth } = header;
  const pixel = (channels * depth) / 8;
  const stride = width * pixel;
  const raw = unzlibSync(concat(data));
  const out = new Uint8Array(height * stride);
  for (let z = 0; z < height; z++) {
    const filter = raw[z * (stride + 1)];
    const line = raw.subarray(z * (stride + 1) + 1, (z + 1) * (stride + 1));
    const row = z * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= pixel ? out[row + i - pixel] : 0;
      const b = z ? out[row - stride + i] : 0;
      const c = i >= pixel && z ? out[row - stride + i - pixel] : 0;
      out[row + i] = (line[i] + [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]) & 255;
    }
  }
  const values = new Float32Array(width * height);
  for (let k = 0; k < width * height; k++) values[k] = depth === 16 ? ((out[k * pixel] << 8) | out[k * pixel + 1]) / 65535 : out[k * pixel] / 255;
  return { width, height, values, text };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function chunk(type, body) {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set([...type].map((ch) => ch.charCodeAt(0)), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)));
  return out;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
