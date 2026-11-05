import { describe, expect, it } from "vitest";
import { VISUALS } from "../abilities/stock.js";
import { abilityFields } from "./fields.js";
import { timingStrip } from "./abilityChoices.js";
import { auraStrip, colorStrip, momentsOf, motionStrip, setSound, sizeStrip, soundStrip, suggestLook, toggleVisual, visualStrip, weightStrip } from "./lookChoices.js";

describe("an ability's moments", () => {
  const whens = (a) => momentsOf(a).map((m) => m.when);

  it("go by how it's used", () => {
    expect(whens({ range: "melee" })).toEqual(["launch", "impact"]);
    expect(whens({ castTime: 2, range: 30 })).toEqual(["cast", "launch", "impact"]);
    expect(whens({ speed: 50, target: "enemy", range: 30 })).toEqual(["launch", "flight", "impact"]);
    expect(whens({ channel: { duration: 3 } })).toEqual(["cast", "launch", "channel"]);
  });
});

describe("visuals", () => {
  it("layer at a moment, and come off again", () => {
    const a = {};
    toggleVisual(a, "impact", "burst");
    toggleVisual(a, "impact", "sparks");
    expect(a.visuals).toEqual([{ effect: "burst", when: "impact" }, { effect: "sparks", when: "impact" }]);
    expect(visualStrip(a, "impact").many).toEqual(["burst", "sparks"]);
    toggleVisual(a, "impact", "burst");
    toggleVisual(a, "impact", "sparks");
    expect(a).not.toHaveProperty("visuals");
  });

  it("write a shot on its way as what's let go, and a trail as what follows it", () => {
    const a = { speed: 50, target: "enemy" };
    toggleVisual(a, "flight", "bolt");
    toggleVisual(a, "flight", "ribbon");
    expect(a.visuals).toEqual([{ effect: "bolt", when: "launch" }, { effect: "ribbon", when: "flight" }]);
    expect(visualStrip(a, "flight").many).toEqual(["bolt", "ribbon"]);
    expect(visualStrip(a, "launch").many).toEqual([]);
    toggleVisual(a, "flight", "bolt");
    expect(a.visuals).toEqual([{ effect: "ribbon", when: "flight" }]);
  });

  it("last through a cast if they can, until there's no cast", () => {
    const a = { castTime: 2 };
    toggleVisual(a, "cast", "glow");
    toggleVisual(a, "cast", "burst");
    expect(a.visuals[0].duration).toBe("cast");
    expect(a.visuals[1]).not.toHaveProperty("duration");
    timingStrip(a).pick(0);
    expect(a.visuals[0]).toEqual({ effect: "glow", when: "launch" });
  });

  it("offer every stock effect at every moment", () => {
    for (const when of ["cast", "launch", "flight", "impact", "channel"]) {
      const strip = visualStrip({}, when);
      expect([...strip.options, ...strip.more].map((o) => o.value).sort()).toEqual([...VISUALS].sort());
    }
  });

  it("size and color all of them, new ones taking the same colors", () => {
    const a = {};
    toggleVisual(a, "impact", "burst");
    colorStrip(a).pick(colorStrip(a).options.find((o) => o.label === "Fire").value);
    toggleVisual(a, "launch", "flare");
    expect(a.visuals[1].colors).toEqual(a.visuals[0].colors);
    expect(a.visuals[0].colors).toHaveLength(2);
    colorStrip(a).pick("");
    expect(a.visuals[1]).not.toHaveProperty("colors");
    sizeStrip(a, "impact").pick(2.2);
    expect(a.visuals[0].scale).toBe(2.2);
    sizeStrip(a, "impact").pick(1);
    expect(a.visuals[0]).not.toHaveProperty("scale");
    expect(sizeStrip({}, "impact")).toBeNull();
  });
});

describe("sounds", () => {
  it("keep one to a moment here, and silence clears the moment", () => {
    const a = {};
    setSound(a, "impact", "impact");
    setSound(a, "impact", "fire");
    expect(a.sounds).toEqual([{ sound: "fire", when: "impact" }]);
    setSound(a, "launch", "whoosh");
    setSound(a, "impact", "");
    expect(a.sounds).toEqual([{ sound: "whoosh", when: "launch" }]);
  });

  it("offer the school's own first, and none while it flies", () => {
    expect(soundStrip({ school: "frost" }, "impact").options[1].value).toBe("frost");
    expect(soundStrip({}, "flight")).toBeNull();
  });

  it("still show one that's not on offer", () => {
    expect(soundStrip({ sounds: [{ sound: "ui-click", when: "impact" }] }, "impact").options.at(-1).value).toBe("ui-click");
  });
});

describe("the body", () => {
  it("offers every animation", () => {
    const field = abilityFields({}).find((f) => f.key === "animation");
    const strip = motionStrip({ range: "melee" });
    expect([...strip.options, ...strip.more].map((o) => o.value).filter(Boolean).sort()).toEqual([...field.options, ...field.more].sort());
  });

  it("sets a swing's feel in one pick, for melee swings only", () => {
    const a = { range: "melee" };
    expect(weightStrip(a).value).toBe("");
    weightStrip(a).pick("weighty");
    expect(a).toMatchObject({ clipSpeed: 0.85, pause: 0.1, shake: 0.15 });
    expect(weightStrip(a).value).toBe("weighty");
    weightStrip(a).pick("");
    expect(a).toEqual({ range: "melee" });
    expect(weightStrip({ range: 30 })).toBeNull();
    expect(weightStrip({ range: "melee", animation: "kick" })).toBeNull();
    expect(weightStrip({ range: "melee", shake: 3 }).value).toBeUndefined();
  });
});

describe("a look to start from", () => {
  it("fits what the ability is", () => {
    const melee = { range: "melee", effects: [{ type: "damage", affects: "target" }] };
    suggestLook(melee);
    expect(melee.visuals).toEqual([{ effect: "sparks", when: "impact" }]);
    expect(melee.sounds).toEqual([{ sound: "whoosh", when: "launch" }, { sound: "hit-metal", when: "impact" }]);
    const bolt = { range: 40, speed: 50, castTime: 2, school: "frost", target: "enemy", effects: [{ type: "damage", affects: "target" }] };
    suggestLook(bolt);
    expect(bolt.visuals.map((v) => v.effect)).toEqual(["glow", "bolt", "burst"]);
    expect(bolt.sounds.map((s) => s.sound)).toEqual(["cast", "frost", "frost"]);
    const heal = { range: 40, effects: [{ type: "heal", affects: "target" }] };
    suggestLook(heal);
    expect(heal.visuals).toEqual([{ effect: "motes", when: "impact" }]);
  });
});

describe("a status's aura", () => {
  it("lasts as long as the status, and keeps what's been set on it", () => {
    const s = {};
    auraStrip(s).pick("glow");
    expect(s.aura).toEqual({ duration: "status", effect: "glow" });
    s.aura.scale = 2;
    auraStrip(s).pick("swirl");
    expect(s.aura).toEqual({ duration: "status", scale: 2, effect: "swirl" });
    auraStrip(s).pick("");
    expect(s).toEqual({});
  });
});
