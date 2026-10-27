import { describe, expect, it } from "vitest";
import { zlibSync } from "fflate";
import { LandGrid } from "../world/landGrid.js";
import { decodePng, encodePng, exportHeightmap, importHeightmap, needsRange } from "./heightmap.js";

describe("heightmap", () => {
  it("round-trips the land to within a 16-bit step", () => {
    const land = new LandGrid();
    for (let gz = -20; gz < 40; gz++) for (let gx = 250; gx < 300; gx++) land.set(gx, gz, 300 * Math.sin(gx / 9) + gz);
    const { bytes, low, high } = exportHeightmap(land);
    expect(needsRange(bytes)).toBe(false);
    const back = importHeightmap(bytes);
    const step = (high - low) / 65535;
    for (const [gx, gz] of [[250, -20], [271, 3], [299, 39], [300, 0], [-5, -5]]) expect(Math.abs(back.point(gx, gz) - land.point(gx, gz))).toBeLessThanOrEqual(step);
  });

  it("puts down another tool's map centred, over the range given", () => {
    const values = new Uint16Array([0, 65535, 32768, 3277]);
    const bytes = encodePng(2, 2, values);
    expect(needsRange(bytes)).toBe(true);
    const land = importHeightmap(bytes, { range: [-100, 900], centre: [640, 320] });
    expect(land.point(19, 9)).toBeCloseTo(-100);
    expect(land.point(20, 9)).toBeCloseTo(900);
    expect(land.point(19, 10)).toBeCloseTo(400, 0);
  });

  it("reads filtered 8-bit RGBA", () => {
    // Two rows of two pixels: the first unfiltered, the second "up" filtered.
    const raw = new Uint8Array([0, 10, 0, 0, 255, 20, 0, 0, 255, 2, 5, 0, 0, 0, 5, 0, 0, 0]);
    const header = new Uint8Array(13);
    new DataView(header.buffer).setUint32(0, 2);
    new DataView(header.buffer).setUint32(4, 2);
    header.set([8, 6, 0, 0, 0], 8);
    const png = encodePng(1, 1, new Uint16Array(1));
    // Swap in our own header and data, keeping the signature and the encoder's chunk framing.
    const { values } = decodePng(rebuild(png, header, zlibSync(raw)));
    expect([...values].map((v) => Math.round(v * 255))).toEqual([10, 20, 15, 25]);
  });
});

// The PNG with its IHDR and IDAT bodies replaced.
function rebuild(png, header, data) {
  const parts = [png.subarray(0, 8)];
  const view = new DataView(png.buffer);
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const body = type === "IHDR" ? header : type === "IDAT" ? data : png.subarray(at + 8, at + 8 + length);
    const out = new Uint8Array(12 + body.length);
    new DataView(out.buffer).setUint32(0, body.length);
    out.set(png.subarray(at + 4, at + 8), 4);
    out.set(body, 8);
    parts.push(out);
    at += 12 + length;
  }
  return Uint8Array.from(parts.flatMap((p) => [...p]));
}
