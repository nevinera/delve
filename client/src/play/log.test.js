import { describe, expect, it } from "vitest";
import { Typed, logRoom, readLine, typeOf } from "./log.js";

describe("readLine", () => {
  it("sends a command, tidied", () => expect(readLine("  /teleport spawn ")).toEqual({ send: "/teleport spawn" }));
  it("says nothing of an empty line", () => expect(readLine("   ")).toEqual({}));
  it("runs the page's own commands itself, with their words", () => {
    const debug = () => [];
    expect(readLine("/debug  show-boundaries tile", { debug })).toEqual({ run: debug, args: ["show-boundaries", "tile"] });
    expect(readLine("/debugging", { debug })).toEqual({ send: "/debugging" });
  });
  it("says what a command looks like otherwise", () => expect(readLine("hello").error).toMatch(/start with/));
});

describe("Typed", () => {
  it("goes back through what you typed, and forward to what you'd started", () => {
    const typed = new Typed(["/help", "/spar on"]);
    expect(typed.up("/lev")).toBe("/spar on");
    expect(typed.up()).toBe("/help");
    expect(typed.up()).toBe("/help");
    expect(typed.down()).toBe("/spar on");
    expect(typed.down()).toBe("/lev");
  });

  it("keeps the newest, without the same line twice running", () => {
    const typed = new Typed();
    for (let n = 0; n < 60; n++) typed.add(`/level ${n}`);
    typed.add("/level 59");
    typed.add("");
    expect(typed.lines).toHaveLength(50);
    expect(typed.lines.at(-1)).toBe("/level 59");
    expect(typed.lines.at(-2)).toBe("/level 58");
  });

  it("gives back what you're typing when there's nothing before it", () => {
    expect(new Typed().up("/he")).toBe("/he");
  });
});

describe("logRoom", () => {
  it("reaches to just short of the bars", () => expect(logRoom(12, 600)).toEqual({ width: 580, hidden: false }));
  it("hides where that's narrower than its least width", () => expect(logRoom(12, 200).hidden).toBe(true));
  it("has no limit with no bars", () => expect(logRoom(12, NaN)).toEqual({ width: Infinity, hidden: false }));
});

describe("typeOf", () => {
  it("knows each type, takes the old system as a status, and anything else as one too", () => {
    expect(typeOf("reply")).toBe("reply");
    expect(typeOf("error")).toBe("error");
    expect(typeOf("system")).toBe("status");
    expect(typeOf("shout")).toBe("status");
  });
});
