import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PARTICLE_EFFECTS, PARTICLE_STOCK, PARTICLE_TEXTURES, SHEET, TEXTURE_CELLS, aimed, dueBy, emitsFor, particleSpec, sheetBytes } from "./particleStock.js";
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
    for (const name of PARTICLE_EFFECTS) expect(PARTICLE_TEXTURES).toContain(PARTICLE_STOCK[name].texture);
    for (const name of PARTICLE_TEXTURES) expect(TEXTURE_CELLS[name]).toBeTypeOf("function");
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

describe("the sheet", () => {
  it("has something in every cell and nothing at their edges", () => {
    const { columns, rows, cellPx } = SHEET;
    const bytes = sheetBytes();
    expect(bytes).toHaveLength(columns * rows * cellPx * cellPx);
    PARTICLE_TEXTURES.forEach((name, n) => {
      const [cx, cy] = [n % columns, Math.floor(n / columns)];
      let most = 0;
      for (let j = 0; j < cellPx; j++) for (let i = 0; i < cellPx; i++) most = Math.max(most, bytes[(cy * cellPx + j) * columns * cellPx + cx * cellPx + i]);
      expect(most, name).toBeGreaterThan(100);
      expect(bytes[cy * cellPx * columns * cellPx + cx * cellPx], name).toBeLessThan(40);
    });
  });
});

describe("ParticleField", () => {
  const spec = particleSpec("sparks");

  it("is one mesh however many it holds", () => {
    const scene = new THREE.Scene();
    const field = new ParticleField(scene, { capacity: 50 });
    field.emit(spec, 30, [0, 0, 0], ["#ff0000", "#ffffff"]);
    expect(scene.children).toEqual([field.mesh]);
    expect(field.geometry.instanceCount).toBe(50);
  });

  it("makes the oldest way past its capacity", () => {
    const field = new ParticleField(new THREE.Scene(), { capacity: 10 });
    field.emit(spec, 8, [1, 0, 0], ["#ff0000", "#ffffff"]);
    field.emit(spec, 5, [2, 0, 0], ["#ff0000", "#ffffff"]);
    expect(field.next).toBe(3);
    const xs = Array.from({ length: 10 }, (_, k) => field.data[k * 24]);
    expect(xs.filter((x) => x === 2)).toHaveLength(5);
    expect(xs.filter((x) => x === 1)).toHaveLength(5);
  });

  it("stamps them with its time, and clear takes them all away", () => {
    const field = new ParticleField(new THREE.Scene(), { capacity: 10 });
    field.frame(4);
    field.emit(spec, 1, [0, 0, 0], ["#ff0000", "#ffffff"]);
    expect(field.data[6]).toBe(4);
    field.clear();
    expect(field.data[6]).toBeLessThan(0);
  });
});
