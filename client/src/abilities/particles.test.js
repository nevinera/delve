import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PARTICLE_EFFECTS, PARTICLE_STOCK, aimed, dueBy, emitsFor, particleSpec } from "./particleStock.js";
import { STOCK_SHEET, setWorldEffectSheets } from "./effectTextures.js";
import { ParticleField } from "./particles.js";

describe("particleSpec", () => {
  it("takes the stock effect's values, with parameters over them", () => {
    const spec = particleSpec("sparks", { count: 7, texture: "dot", effect: "sparks", when: "impact" });
    expect(spec.count).toBe(7);
    expect(spec.texture).toBe("dot");
    expect(spec.lifetime).toBe(PARTICLE_STOCK.sparks.lifetime);
    expect(spec.effect).toBeUndefined();
  });

  it("scales sizes, speeds and reach together, and not how many", () => {
    const [one, two] = [particleSpec("embers"), particleSpec("embers", { scale: 2 })];
    for (const key of ["speed", "gravity", "size", "sizeEnd", "radius"]) expect(two[key]).toBe(one[key] * 2);
    expect(two.rate).toBe(one.rate);
  });

  it("lets a parameter be 0", () => {
    expect(particleSpec("sparks", { gravity: 0 }).gravity).toBe(0);
  });

  it("uses only textures on the sheet", () => {
    for (const name of PARTICLE_EFFECTS) expect(STOCK_SHEET.textures).toContain(PARTICLE_STOCK[name].texture);
  });
});

describe("how many it lets go", () => {
  it("lets a burst go at the start", () => {
    const spec = { count: 10, rate: 0, duration: 0 };
    expect(dueBy(spec, 0)).toBe(10);
    expect(emitsFor(spec)).toBe(0);
  });

  it("lets the rest go over its duration", () => {
    const spec = { count: 2, rate: 10, duration: 2 };
    expect(dueBy(spec, 0.5)).toBe(12);
    expect(dueBy(spec, 1)).toBe(22);
    expect(dueBy(spec, 5)).toBe(22);
    expect(emitsFor(spec)).toBe(2);
  });
});

describe("aimed", () => {
  const seeded = () => {
    let seed = 5;
    return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  };

  it("stays within its spread, as unit vectors", () => {
    const rand = seeded();
    for (const way of [[0, 1, 0], [1, 0, 0], [0, 0, 1]]) {
      for (let n = 0; n < 200; n++) {
        const v = aimed(way, 40, rand);
        expect(Math.hypot(...v)).toBeCloseTo(1, 5);
        expect(v[0] * way[0] + v[1] * way[1] + v[2] * way[2]).toBeGreaterThan(Math.cos((20 * Math.PI) / 180) - 1e-6);
      }
    }
  });

  it("goes every way at 360", () => {
    const rand = seeded();
    const ys = Array.from({ length: 300 }, () => aimed([0, 1, 0], 360, rand)[1]);
    expect(Math.min(...ys)).toBeLessThan(-0.8);
    expect(Math.max(...ys)).toBeGreaterThan(0.8);
  });
});

describe("ParticleField", () => {
  const spec = particleSpec("sparks");
  const made = (capacity) => {
    const scene = new THREE.Scene();
    const field = new ParticleField(scene, { capacity });
    return { scene, field, part: field.of(STOCK_SHEET) };
  };

  it("is one mesh however many it holds", () => {
    const { scene, field, part } = made(50);
    field.emit(spec, 30, [0, 0, 0], ["#ff0000", "#ffffff"]);
    expect(scene.children).toEqual([part.mesh]);
    expect(part.geometry.instanceCount).toBe(50);
  });

  it("makes the oldest way past its capacity", () => {
    const { field, part } = made(10);
    field.emit(spec, 8, [1, 0, 0], ["#ff0000", "#ffffff"]);
    field.emit(spec, 5, [2, 0, 0], ["#ff0000", "#ffffff"]);
    expect(part.next).toBe(3);
    const xs = Array.from({ length: 10 }, (_, k) => part.data[k * 24]);
    expect(xs.filter((x) => x === 2)).toHaveLength(5);
    expect(xs.filter((x) => x === 1)).toHaveLength(5);
  });

  it("stamps them with its time, and clear takes them all away", () => {
    const { field, part } = made(10);
    field.frame(4);
    field.emit(spec, 1, [0, 0, 0], ["#ff0000", "#ffffff"]);
    expect(part.data[6]).toBe(4);
    field.clear();
    expect(part.data[6]).toBeLessThan(0);
  });

  it("points each particle at its texture's cell, its rows counted from the image's bottom", () => {
    const { field, part } = made(10);
    field.emit(particleSpec("sparks", { texture: "sigil" }), 1, [0, 0, 0], ["#ff0000", "#ffffff"]);
    const cell = STOCK_SHEET.textures.indexOf("sigil");
    expect(part.cells[0]).toBe(cell % STOCK_SHEET.columns);
    expect(part.cells[1]).toBe(STOCK_SHEET.rows - 1 - Math.floor(cell / STOCK_SHEET.columns));
  });

  it("draws a world's sheet apart, with less room, and fades out only what it's told to", () => {
    const words = new TextEncoder().encode(JSON.stringify({ columns: 2, rows: 1, textures: ["mine"] }));
    setWorldEffectSheets([["effects/ours.json", words], ["effects/ours.png", new Uint8Array(4)]]);
    try {
      const { scene, field, part } = made(40);
      const stock = field.emit(spec, 2, [0, 0, 0], ["#ff0000", "#ffffff"]);
      const ours = field.emit(particleSpec("sparks", { texture: "mine" }), 2, [0, 0, 0], ["#ff0000", "#ffffff"]);
      expect(scene.children).toHaveLength(2);
      expect(ours.from).not.toBe(part);
      expect(ours.from.capacity).toBe(10);
      field.frame(3);
      field.fadeOut([ours]);
      expect(ours.from.cells[3]).toBe(3);
      expect(part.cells[stock.first * 4 + 3]).toBeGreaterThan(1000);
    } finally {
      setWorldEffectSheets([]);
    }
  });
});
