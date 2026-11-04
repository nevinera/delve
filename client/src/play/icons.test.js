import { existsSync, readFileSync, readdirSync } from "fs";
import { describe, expect, it } from "vitest";
import { ICON_NAMES, iconUrl } from "./icons.js";

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
