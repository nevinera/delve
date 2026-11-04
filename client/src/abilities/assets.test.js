import fs from "fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import stock from "./stockTextures.json";
import { SHAPES, SHAPE_EFFECTS, SHAPE_STOCK, fadeAt, shapeSpec } from "./shapeStock.js";
import { missingSounds, soundLength, soundVoices } from "./sounds.js";
import { MESH_VISUALS, SOUNDS } from "./stock.js";
import { disposeVisual, hasVisual, makeVisual } from "./visuals.js";

describe("the stock visuals", () => {
  it.each(MESH_VISUALS)("%s draws from start to end and comes apart", (name) => {
    expect(hasVisual(name)).toBe(true);
    const visual = makeVisual(name, { colors: ["#ff0000", "#00ff00"], scale: 1.5, height: 6, from: [0, 3, 0], to: [20, 3, 0] });
    expect(visual.length).toBeGreaterThan(0);
    for (const u of [0, 0.5, 1]) visual.update(u);
    let meshes = 0;
    visual.group.traverse((node) => {
      if (node.isMesh) meshes += 1;
    });
    expect(meshes).toBeGreaterThan(0);
    disposeVisual(visual);
  });
});

describe("shape effects", () => {
  const stockKeys = (name, key) => SHAPE_STOCK[name].layers.map((layer) => layer[key]);

  it("uses only stock repeating textures, whose files are there", () => {
    for (const name of SHAPE_EFFECTS) for (const texture of stockKeys(name, "texture")) expect(stock.repeating).toContain(texture);
    for (const name of stock.repeating) expect(fs.existsSync(new URL(`../../../public/effects/${name}.png`, import.meta.url)), name).toBe(true);
  });

  it("lays parameters over each layer", () => {
    const spec = shapeSpec("slash", { texture: "ripple", scroll: 5, repeatAcross: 3, shape: "ring", duration: 2, fade: "pulse", opacity: 0.5 });
    expect(spec.duration).toBe(2);
    expect(spec.fade).toBe("pulse");
    for (const layer of spec.layers) {
      expect(layer).toMatchObject({ texture: "ripple", shape: "ring" });
      expect(layer.scroll[1]).toBe(5);
      expect(layer.repeat[0]).toBe(3);
    }
    expect(spec.layers[0].opacity).toBe(0.5);
    expect(SHAPE_STOCK.slash.layers[0].texture).toBe("bands");
  });

  it("keeps what's left out", () => {
    expect(shapeSpec("ring").layers[0]).toEqual(SHAPE_STOCK.ring.layers[0]);
  });

  it("fades each way", () => {
    expect(fadeAt("out", 0)).toBe(1);
    expect(fadeAt("out", 1)).toBe(0);
    expect(fadeAt("pulse", 0.5)).toBe(1);
    expect(fadeAt("none", 1)).toBe(1);
    expect(fadeAt("hold", 0.5)).toBe(1);
    expect(fadeAt("hold", 1)).toBe(0);
  });

  it.each(SHAPES)("draws any effect as a %s", (shape) => {
    const visual = makeVisual("burst", { params: { shape } });
    for (const u of [0, 0.5, 1]) visual.update(u);
    disposeVisual(visual);
  });

  it("reaches a beam between its points, and repeats its texture by length", () => {
    const short = makeVisual("beam", { from: [0, 0, 0], to: [0, 0, 4] });
    const long = makeVisual("beam", { from: [0, 0, 0], to: [0, 0, 40] });
    const [a, b] = [short, long].map(({ group }) => group.children[0].children[0]);
    expect(a.scale.y).toBeCloseTo(4);
    expect(b.scale.y).toBeCloseTo(40);
    expect(b.material.uniforms.uRepeat.value.y).toBeCloseTo(a.material.uniforms.uRepeat.value.y * 10);
  });
});

describe("ribbons", () => {
  const place = { x: 0 };
  const edges = { edges: (a, b) => { a.set(place.x, 0, 0); b.set(place.x, 1, 0); } };

  // Moves a trace along x, drawing the ribbon at each step.
  const swept = (options, steps) => {
    const made = makeVisual("ribbon", options);
    for (const u of steps) {
      place.x = u * 10;
      made.update(u);
    }
    return made;
  };
  it("sweeps out what its edges cover", () => {
    const { group } = swept({ trace: edges }, [0.3, 0.4, 0.5, 0.6]);
    const [mesh] = group.children;
    expect(mesh.visible).toBe(true);
    expect(mesh.geometry.drawRange.count).toBeGreaterThan(0);
    const { position } = mesh.geometry.attributes;
    expect(position.getY(1) - position.getY(0)).toBeCloseTo(1);
    expect(position.getX(mesh.geometry.drawRange.count / 3)).toBeGreaterThan(position.getX(0));
  });

  it("leaves out a swing's wind-up", () => {
    const { group } = swept({ trace: edges }, [0, 0.05, 0.1]);
    expect(group.children[0].visible).toBe(false);
  });

  it("dies away after it stops following", () => {
    const { group } = swept({ trace: edges }, [0.3, 0.4, 0.5, 0.6, 1]);
    expect(group.children[0].visible).toBe(false);
  });

  it("draws nothing while what it's on stands still", () => {
    place.x = 3;
    const made = makeVisual("ribbon", { trace: edges });
    for (const u of [0.3, 0.4, 0.5]) made.update(u);
    const { group } = made;
    expect(group.children[0].visible).toBe(false);
  });

  it("follows a thing, as wide as it says", () => {
    const thing = new THREE.Group();
    const made = makeVisual("ribbon", { follow: thing, params: { width: 2, length: 1 } });
    for (const u of [0, 0.1, 0.2]) {
      thing.position.x = u * 10;
      made.update(u);
    }
    const { aAcross } = made.group.children[0].geometry.attributes;
    expect(aAcross.getX(1)).toBeCloseTo(1);
    expect(aAcross.getX(0)).toBeCloseTo(-1);
  });

  it("stops at its most samples, however long it runs", () => {
    const thing = new THREE.Group();
    const made = makeVisual("ribbon", { follow: thing, params: { duration: 100, length: 100 } });
    for (let n = 0; n < 200; n++) {
      thing.position.x = n;
      made.update(n / 400);
    }
    expect(made.group.children[0].visible).toBe(true);
  });
});

describe("the stock sounds", () => {
  it("has a recipe for every name", () => {
    expect(missingSounds()).toEqual([]);
  });

  it.each(SOUNDS)("%s is short and has positive frequencies, which its sweeps need", (name) => {
    expect(soundLength(name)).toBeGreaterThan(0);
    expect(soundLength(name)).toBeLessThan(1.5);
    for (const voice of soundVoices(name)) {
      expect(voice.from).toBeGreaterThan(0);
      expect(voice.to).toBeGreaterThan(0);
    }
  });
});
