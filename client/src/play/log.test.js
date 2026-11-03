import { describe, expect, it } from "vitest";
import { readLine } from "./log.js";

describe("readLine", () => {
  it("sends a command, tidied", () => expect(readLine("  /teleport spawn ")).toEqual({ send: "/teleport spawn" }));
  it("says nothing of an empty line", () => expect(readLine("   ")).toEqual({}));
  it("says what a command looks like otherwise", () => expect(readLine("hello").error).toMatch(/start with/));
});
