import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STOCK_SHEET, readEffectSheet, setWorldEffectSheets, textureCell, textureNames } from "./effectTextures.js";

const words = (value) => new TextEncoder().encode(JSON.stringify(value));
const image = new Uint8Array(4);

describe("the stock sheet", () => {
  it("has room for its textures, at the size it says", () => {
    const png = fs.readFileSync(new URL("../../../public/effects/stock.png", import.meta.url));
    const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    expect(width / STOCK_SHEET.columns).toBe(height / STOCK_SHEET.rows);
    expect(STOCK_SHEET.textures.length).toBeLessThanOrEqual(STOCK_SHEET.columns * STOCK_SHEET.rows);
    expect(new Set(STOCK_SHEET.textures).size).toBe(STOCK_SHEET.textures.length);
  });

  it("still has every texture classes picked before it was art", () => {
    expect(STOCK_SHEET.textures).toEqual(expect.arrayContaining(["dot", "spark", "star", "smoke", "ring", "shard", "flame", "noise"]));
  });
});

describe("finding a texture", () => {
  afterEach(() => setWorldEffectSheets([]));

  it("counts cells from the top left", () => {
    const cell = STOCK_SHEET.textures.indexOf("fire");
    expect(textureCell("fire")).toEqual({ sheet: STOCK_SHEET, column: cell % STOCK_SHEET.columns, row: Math.floor(cell / STOCK_SHEET.columns) });
  });

  it("gives the dot for a name that isn't one", () => {
    expect(textureCell("nothing").sheet.textures[0]).toBe("dot");
  });

  it("prefers a world's texture over a stock one of the same name, and lists the world's first", () => {
    setWorldEffectSheets([["effects/mine.json", words({ columns: 2, rows: 2, textures: ["custom", "flame"] })], ["effects/mine.png", image]]);
    expect(textureCell("flame")).toMatchObject({ column: 1, row: 0 });
    expect(textureCell("flame").sheet).not.toBe(STOCK_SHEET);
    expect(textureCell("dot").sheet).toBe(STOCK_SHEET);
    expect(textureNames().slice(0, 2)).toEqual(["custom", "flame"]);
    expect(textureNames().filter((name) => name === "flame")).toHaveLength(1);
  });

  it("skips a sheet with no image, or that makes no sense, and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setWorldEffectSheets([["effects/lost.json", words({ columns: 1, rows: 1, textures: ["lost"] })], ["effects/bad.json", words({ columns: 1, rows: 1, textures: ["a", "b"] })], ["effects/bad.png", image]]);
    expect(textureNames()).not.toContain("lost");
    expect(textureNames()).not.toContain("a");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe("reading a sheet file", () => {
  it("takes columns, rows and textures", () => {
    expect(readEffectSheet(JSON.stringify({ columns: 2, rows: 1, textures: ["a"] }))).toEqual({ columns: 2, rows: 1, textures: ["a"] });
  });

  it("refuses what isn't one", () => {
    for (const text of ["not json", "{}", JSON.stringify({ columns: 0, rows: 1, textures: [] }), JSON.stringify({ columns: 1, rows: 1, textures: [3] })]) expect(readEffectSheet(text)).toBeNull();
  });
});
