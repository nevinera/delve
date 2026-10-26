import { describe, it, expect } from "vitest";
import { gzipSync } from "fflate";
import { chunkOf, fingerprint, shrinkRgba, thumbChanges } from "./thumbPixels.js";

describe("chunkOf", () => {
  it("finds a tile's chunk and its place in it, west and north of the origin too", () => {
    expect(chunkOf(17, 3)).toEqual({ cx: 1, cz: 0, i: 1, j: 3 });
    expect(chunkOf(-1, -16)).toEqual({ cx: -1, cz: -1, i: 15, j: 0 });
  });
});

describe("shrinkRgba", () => {
  it("averages each block of pixels", () => {
    // 4×4: left half black, right half white, shrunk to 2×2.
    const rgba = Uint8ClampedArray.from({ length: 64 }, (_, k) => ((k >> 2) % 4 < 2 ? 0 : 255));
    expect(Array.from(shrinkRgba(rgba, 4, 2))).toEqual([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
    rgba[0] = 200; // one pixel of four
    expect(shrinkRgba(rgba, 4, 2)[0]).toBe(50);
  });
});

describe("thumbChanges", () => {
  it("redraws tiles whose file changed or that have no picture, and drops pictures of tiles that are gone", () => {
    const a = gzipSync(new Uint8Array([1, 2, 3]));
    const b = gzipSync(new Uint8Array([1, 2, 4]));
    expect(fingerprint(a)).not.toBe(fingerprint(b));
    const saved = { "0,0": { print: fingerprint(a) }, "1,0": { print: fingerprint(a) }, "5,5": { print: fingerprint(a) } };
    const tiles = [
      { key: "0,0", gz: a },
      { key: "1,0", gz: b },
      { key: "2,0", gz: a },
    ];
    const { stale, gone } = thumbChanges(tiles, saved);
    expect(stale.map((t) => t.key)).toEqual(["1,0", "2,0"]);
    expect(gone).toEqual(["5,5"]);
  });
});
