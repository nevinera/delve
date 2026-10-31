import { beforeAll, describe, expect, it } from "vitest";
import { bytesToDigits, digitsToBytes } from "./digits.js";
import { decodeLine, decodeTile, encodeLine, encodeTile } from "./heights.js";
import { loadZipper } from "./zstd.js";

beforeAll(() => loadZipper());

const rows = (n, f) => Array.from({ length: n }, (_, k) => f(k));

describe("height lines", () => {
  it("picks the shortest format that holds them, and reads them back", () => {
    const cases = [
      [rows(64, () => 40), "f"],
      [rows(64, (k) => -400 + (k % 13)), "1"],
      [rows(64, (k) => 1000 + k * 9), "d"],
      // Jumps every height: d would be longer.
      [rows(64, (k) => (k % 2 ? 3000 : 0)), "2"],
      [rows(64, (k) => (k % 2 ? 20000 : -20000)), "3"],
    ];
    for (const [q, kind] of cases) {
      const line = encodeLine(q, 8);
      expect(line[0]).toBe(kind);
      expect([...decodeLine(line, 0, q.length)[0]]).toEqual(q);
    }
  });

  it("keeps d at 80 digits and two for each jump", () => {
    const q = rows(64, (k) => (k === 20 ? 900 : 100 + (k % 8)));
    expect(encodeLine(q, 8).length - 4).toBe(80 + 2 * 2);
  });
});

describe("tile heights", () => {
  const tile = (f) => Float32Array.from(rows(65 * 65, (k) => f(k % 65, Math.floor(k / 65))));

  it("zips tiles spanning under 1,024 ft, and reads them back", () => {
    const heights = tile((x, z) => 50 + Math.sin(x / 7) * 12 + z * 0.75);
    const back = decodeTile(encodeTile(heights));
    const lines = encodeTile(heights);
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith("h z ")).toBe(true);
    heights.forEach((h, k) => expect(back[k]).toBeCloseTo(Math.round(h * 4) / 4, 5));
  });

  it("keeps taller tiles as chunks and an edge", () => {
    const heights = tile((x, z) => (x > 40 ? 2000 : 0) + z * 0.25);
    const lines = encodeTile(heights);
    expect(lines[0]).toBe("h c");
    expect(lines).toHaveLength(66);
    expect([...decodeTile(lines)]).toEqual([...heights]);
  });
});

describe("digits", () => {
  it("writes bytes and reads them back", () => {
    for (let n = 0; n < 8; n++) {
      const bytes = Uint8Array.from(rows(n, (k) => (k * 97 + 13) & 255));
      expect([...digitsToBytes(bytesToDigits(bytes))]).toEqual([...bytes]);
    }
  });
});
