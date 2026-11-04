import { describe, expect, it, vi } from "vitest";
import { LastingAuras } from "./lastingAuras.js";

describe("LastingAuras", () => {
  const stage = () => ({ aura: vi.fn((unit, aura) => ({ unit, aura })), endAura: vi.fn() });
  const aura = { effect: "shield", duration: "status" };
  const [one, other] = [{ mesh: {} }, { mesh: {} }];

  it("starts each once", () => {
    const s = stage();
    const auras = new LastingAuras(s);
    auras.sync(new Map([["1/a/2", { unit: one, aura }]]));
    auras.sync(new Map([["1/a/2", { unit: one, aura }]]));
    expect(s.aura).toHaveBeenCalledTimes(1);
    expect(s.endAura).not.toHaveBeenCalled();
  });

  it("ends one no longer wanted", () => {
    const s = stage();
    const auras = new LastingAuras(s);
    auras.sync(new Map([["1/a/2", { unit: one, aura }]]));
    auras.sync(new Map());
    expect(s.endAura).toHaveBeenCalledTimes(1);
    expect(auras.shown.size).toBe(0);
  });

  it("starts again on a new body when someone's has changed", () => {
    const s = stage();
    const auras = new LastingAuras(s);
    auras.sync(new Map([["1/a/2", { unit: one, aura }]]));
    auras.sync(new Map([["1/a/2", { unit: other, aura }]]));
    expect(s.endAura).toHaveBeenCalledTimes(1);
    expect(s.aura).toHaveBeenCalledTimes(2);
    expect(s.aura.mock.calls[1][0]).toBe(other);
  });
});
