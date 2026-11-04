import { existsSync, readFileSync, readdirSync } from "fs";
import { strToU8 } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { iconNames, iconUrl, setWorldIcons } from "./icons.js";
import ICON_NAMES from "./icons.json";

const dir = new URL("../../../public/icons/", import.meta.url);

describe("stock icons", () => {
  it("has a file and a credit for every name", () => {
    const credits = readFileSync(new URL("credits.txt", dir), "utf8");
    for (const name of ICON_NAMES) {
      expect(existsSync(new URL(`${name}.svg`, dir))).toBe(true);
      expect(credits).toMatch(new RegExp(`[:,] ${name}(,|\\n)`));
    }
  });

  it("names every file", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4));
    expect(files.sort()).toEqual([...ICON_NAMES].sort());
  });

  it("leaves out the backgrounds", () => {
    for (const name of ICON_NAMES) expect(readFileSync(new URL(`${name}.svg`, dir), "utf8")).not.toContain("M0 0h512v512H0z");
  });

  it("knows only its own names", () => {
    expect(iconUrl(ICON_NAMES[0])).toBe(`/icons/${ICON_NAMES[0]}.svg`);
    expect(iconUrl("no-such-icon")).toBe(null);
  });
});

describe("a world's icons", () => {
  afterEach(() => setWorldIcons([]));
  const svg = strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>');

  it("come from icons/ and read as images, first in the list", () => {
    setWorldIcons([["icons/my-icon.svg", svg], ["objects/abcd1234.json", svg], ["icons/deep/no.svg", svg]]);
    expect(iconUrl("my-icon")).toBe(`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`);
    expect(iconUrl("no")).toBe(null);
    expect(iconNames()[0]).toBe("my-icon");
    expect(iconNames()).toHaveLength(ICON_NAMES.length + 1);
  });

  it("win over a stock icon of the same name, listed once", () => {
    const name = ICON_NAMES[0];
    setWorldIcons([[`icons/${name}.svg`, svg]]);
    expect(iconUrl(name)).toMatch(/^data:/);
    expect(iconNames().filter((n) => n === name)).toHaveLength(1);
  });
});
