import { describe, expect, it } from "vitest";
import { Waiting } from "./waiting.js";

const part = () => {
  const got = [];
  return { got, a: (m) => got.push(["a", m]), b: (m) => got.push(["b", m]), c: (m) => got.push(["c", m]) };
};

describe("Waiting", () => {
  it("keeps what's sent before the part arrives, in order, as each says", () => {
    const waiting = new Waiting();
    waiting.send("a", 1);
    waiting.send("b", 1, "last");
    waiting.send("a", 2);
    waiting.send("b", 2, "last");
    waiting.send("c", 1, "none");
    const p = part();
    waiting.arrive(p);
    expect(p.got).toEqual([["a", 1], ["a", 2], ["b", 2]]);
  });

  it("hands what's sent straight on once it has", () => {
    const waiting = new Waiting();
    const p = part();
    waiting.arrive(p);
    waiting.to("c", "none")(3);
    expect(p.got).toEqual([["c", 3]]);
  });
});
