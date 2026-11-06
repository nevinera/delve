import { describe, expect, it } from "vitest";
import { readLine } from "./log.js";

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
