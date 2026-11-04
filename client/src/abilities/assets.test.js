import fs from "fs";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import stock from "./stockTextures.json";
import { SHAPES, SHAPE_EFFECTS, SHAPE_STOCK, fadeAt, shapeSpec } from "./shapeStock.js";
import { STOCK_SOUNDS, SoundMixer, heardAt, soundUrl } from "./sounds.js";
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

describe("decals", () => {
  const slope = (x) => x / 2;

  it("follows the ground's slope", () => {
    const { group } = makeVisual("decal", { at: new THREE.Vector3(10, 5, 0), ground: slope });
    const { position } = group.children[0].geometry.attributes;
    for (let n = 0; n < position.count; n++) {
      expect(position.getY(n)).toBeCloseTo(slope(10 + position.getX(n)) - 5 + 0.2, 4);
    }
  });

  it("lies flat with no ground to go by", () => {
    const { group } = makeVisual("scorch", { at: new THREE.Vector3(1, 5, 1) });
    const { position } = group.children[0].geometry.attributes;
    expect(position.getY(3)).toBeCloseTo(0.2);
  });

  it("takes a radius, by the ability's scale", () => {
    const { group } = makeVisual("decal", { scale: 2, params: { radius: 4 } });
    group.children[0].geometry.computeBoundingSphere();
    expect(group.children[0].geometry.boundingSphere.radius).toBeCloseTo(8, 0);
  });

  it("spins by turning its texture", () => {
    const { group } = makeVisual("decal", { params: { spin: 2 } });
    const [{ material }] = group.children;
    expect(material.uniforms.uScroll.value.x).toBe(2 * SHAPE_STOCK.decal.layers[0].repeat[0]);
  });

  it("keeps a scorch dark unless the ability sets its colors", () => {
    const dark = makeVisual("scorch", { colors: ["#ff0000", "#ff0000"] }).group.children[0].material.uniforms.uColor.value;
    expect(dark.r).toBeLessThan(0.1);
    const red = makeVisual("scorch", { colors: ["#ff0000", "#ff0000"], params: { colors: ["#ff0000", "#ff0000"] } }).group.children[0].material.uniforms.uColor.value;
    expect(red.r).toBeGreaterThan(0.9);
  });

  it("covers what's under a scorch, and mostly adds light with the rest", () => {
    expect(makeVisual("scorch").group.children[0].material.uniforms.uSolid.value).toBe(1);
    expect(makeVisual("decal").group.children[0].material.uniforms.uSolid.value).toBe(0.3);
  });
});

describe("the stock sounds", () => {
  it.each(SOUNDS)("%s has its files, 2 to 4 of them", (name) => {
    const { variations } = STOCK_SOUNDS[name];
    expect(variations).toBeGreaterThanOrEqual(2);
    expect(variations).toBeLessThanOrEqual(4);
    for (let n = 1; n <= variations; n++) expect(fs.existsSync(new URL(`../../../public${soundUrl(name, n)}`, import.meta.url)), `${name} ${n}`).toBe(true);
  });
});

function fakeContext() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const context = {
    currentTime: 0,
    destination: {},
    listener: { setPosition: vi.fn(), setOrientation: vi.fn() },
    createDynamicsCompressor: node,
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createPanner: () => ({ ...node(), setPosition: vi.fn() }),
    createBufferSource: () => {
      const source = { ...node(), playbackRate: { value: 1 }, start: vi.fn(), stop: vi.fn() };
      context.sources.push(source);
      return source;
    },
    decodeAudioData: async (bytes) => ({ bytes }),
    sources: [],
  };
  return context;
}

describe("SoundMixer", () => {
  const mixer = async (options) => {
    const context = fakeContext();
    const made = new SoundMixer(context, { bytes: () => new ArrayBuffer(4), rand: () => 0.5, ...options });
    await new Promise((done) => setTimeout(done));
    return { context, made };
  };

  it("plays each variation in turn rather than one twice running", async () => {
    const { made } = await mixer();
    const picks = [0, 1, 2, 3].map(() => made.pick("impact"));
    for (let n = 1; n < picks.length; n++) expect(picks[n]).not.toBe(picks[n - 1]);
  });

  it("sets volume, pitch and delay", async () => {
    const { made, context } = await mixer();
    const voice = made.play("impact", { volume: 0.5, pitch: 2, delay: 0.25 });
    expect(voice.gain.gain.value).toBe(0.5);
    expect(voice.source.playbackRate.value).toBe(2);
    expect(context.sources[0].start).toHaveBeenCalledWith(0.25);
  });

  it("varies the pitch by its share either way", async () => {
    const { made } = await mixer({ rand: () => 0.999 });
    expect(made.play("impact", { pitch: 2, pitchVariation: 0.1 }).source.playbackRate.value).toBeCloseTo(2.2, 1);
    made.rand = () => 0;
    expect(made.play("impact", { pitch: 2, pitchVariation: 0.1 }).source.playbackRate.value).toBeCloseTo(1.8);
  });

  it("drops the quietest when too many are going", async () => {
    const { made } = await mixer({ limit: 2 });
    const far = made.play("impact", { at: [100, 0, 0] });
    const near = made.play("impact", { at: [5, 0, 0] });
    const nearer = made.play("impact", { at: [1, 0, 0] });
    expect(made.playing).toEqual([near, nearer]);
    expect(far.source.stop).toHaveBeenCalled();
  });

  it("won't drop something for what matters less", async () => {
    const { made } = await mixer({ limit: 1 });
    const near = made.play("impact", { at: [1, 0, 0] });
    expect(made.play("impact", { at: [100, 0, 0] })).toBeNull();
    expect(made.playing).toEqual([near]);
  });

  it("keeps your own over someone else's, however near", async () => {
    const { made } = await mixer({ limit: 1 });
    const mine = made.play("impact", { at: [60, 0, 0], mine: true });
    expect(made.play("impact", { at: [13, 0, 0] })).toBeNull();
    expect(made.playing).toEqual([mine]);
  });

  it("doesn't play what's too far off to hear", async () => {
    const { made } = await mixer();
    expect(heardAt(5)).toBe(1);
    expect(made.play("impact", { at: [1000, 0, 0] })).toBeNull();
  });

  it("forgets one when it ends", async () => {
    const { made } = await mixer();
    const voice = made.play("impact");
    voice.source.onended();
    expect(made.playing).toEqual([]);
  });

  it("goes without a place for what's only heard", async () => {
    const { made, context } = await mixer();
    const panner = vi.spyOn(context, "createPanner");
    made.play("ui-click");
    expect(panner).not.toHaveBeenCalled();
    made.play("impact", { at: [1, 2, 3] });
    expect(panner).toHaveBeenCalledOnce();
  });

  it("plays nothing for a name it doesn't have", async () => {
    const { made } = await mixer();
    expect(made.play("nope")).toBeNull();
  });
});
