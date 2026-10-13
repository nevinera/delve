import {describe, expect, it, vi} from "vitest";
import {bakeStamps, drawStamps, isShareAlike, loadStampSheets, shareAlikeSetsUsed, stampFeet, stampFor, stampFrame, variantIndex} from "../stamps";

const logs = [{x: 0, y: 0, width: 40, height: 20}, {x: 40, y: 0, width: 40, height: 20}, {x: 80, y: 0, width: 40, height: 20}];
const sets = {
  camp: {imageUrl: "camp.png", stamps: {log: {feetWidth: 6, frames: logs}, pond: {feetWidth: 20}}},
};
const sheet = {naturalWidth: 200, naturalHeight: 100};

function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {get: (_, name) => (...args) => calls.push([name, ...args])});
  return {ctx, calls};
}

describe("stampFor", () => {
  it("finds a placed stamp's set and stamp", () => {
    expect(stampFor(sets, {stamp: "camp/log"})).toEqual({set: "camp", key: "log", stamp: sets.camp.stamps.log});
  });

  it("is null for a stamp the zone doesn't have", () => {
    expect(stampFor(sets, {stamp: "camp/tent"})).toBeNull();
    expect(stampFor(null, {stamp: "camp/log"})).toBeNull();
  });
});

describe("variantIndex", () => {
  it("uses the placed variant", () => {
    expect(variantIndex({x: 1, y: 2, variant: 2}, 3)).toBe(2);
  });

  it("picks the same frame for the same position, and varies across positions", () => {
    const picks = Array.from({length: 30}, (_, i) => variantIndex({x: i * 3.1, y: i * 1.7}, 3));
    expect(picks).toEqual(Array.from({length: 30}, (_, i) => variantIndex({x: i * 3.1, y: i * 1.7}, 3)));
    expect(new Set(picks).size).toBe(3);
  });
});

describe("stampFrame and stampFeet", () => {
  it("uses the whole sheet for a stamp with no frames", () => {
    expect(stampFrame(sets.camp.stamps.pond, {x: 0, y: 0}, sheet)).toEqual({x: 0, y: 0, width: 200, height: 100});
  });

  it("sizes by feetWidth and scale, keeping the frame's aspect", () => {
    expect(stampFeet(sets.camp.stamps.log, {scale: 2}, logs[0])).toEqual({width: 12, height: 6});
  });
});

describe("drawStamps", () => {
  it("draws each stamp centered on its spot, rotated and sized in pixels, in order", () => {
    const {ctx, calls} = recorder();
    drawStamps(ctx, [{stamp: "camp/log", x: 10, y: 5, rotation: 90, variant: 1}, {stamp: "camp/pond", x: 0, y: 0}], sets, {camp: sheet}, 2);
    expect(calls).toEqual([
      ["save"], ["translate", 20, 10], ["rotate", Math.PI / 2],
      ["drawImage", sheet, 40, 0, 40, 20, -6, -3, 12, 6], ["restore"],
      ["save"], ["translate", 0, 0], ["drawImage", sheet, 0, 0, 200, 100, -20, -10, 40, 20], ["restore"],
    ]);
  });

  it("skips stamps the zone doesn't have, or whose sheet didn't load", () => {
    const {ctx, calls} = recorder();
    drawStamps(ctx, [{stamp: "camp/tent", x: 0, y: 0}, {stamp: "camp/log", x: 0, y: 0}], sets, {}, 2);
    expect(calls).toEqual([]);
  });
});

describe("bakeStamps", () => {
  it("draws at the canvas's pixels per foot", () => {
    const {ctx, calls} = recorder();
    const canvas = {width: 400, getContext: () => ctx};
    expect(bakeStamps(canvas, {width: 100, height: 50}, [{stamp: "camp/pond", x: 50, y: 25}], sets, {camp: sheet})).toBe(canvas);
    expect(calls[1]).toEqual(["translate", 200, 100]);
  });
});

describe("loadStampSheets", () => {
  it("loads each set's sheet, leaving out ones that fail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = vi.fn(async (url) => {
      if (url.includes("bad")) throw new Error("404");
      return {url};
    });
    const sheets = await loadStampSheets({...sets, broken: {imageUrl: "bad.png", stamps: {}}}, (u) => `https://x/${u}`, load);
    expect(sheets).toEqual({camp: {url: "https://x/camp.png"}});
  });
});

describe("share-alike sets", () => {
  it("knows a share-alike license", () => {
    expect(isShareAlike({license: "CC-BY-SA-4.0"})).toBe(true);
    expect(isShareAlike({license: "CC-BY-4.0"})).toBe(false);
    expect(isShareAlike({license: "CC0-1.0"})).toBe(false);
  });

  it("lists the share-alike sets a map's stamps use", () => {
    const licensed = {...sets, wilds: {license: "CC-BY-SA-4.0", stamps: {}}, other: {license: "CC-BY-SA-3.0", stamps: {}}};
    expect(shareAlikeSetsUsed(licensed, [{stamp: "camp/log"}, {stamp: "wilds/rock"}])).toEqual(["wilds"]);
  });
});
