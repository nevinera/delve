import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PIECE_TYPES, addColor, emptyImage, emptyObject, pieceCorners, setPixel } from "../world/builtObjects.js";
import { decalCorners, decalGeometry, faceSpot, objectGeometry, pieceFaces, pieceGeometry, textGeometry, tiledGeometries } from "./builtMeshes.js";

const bounds = (g) => {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  return [min.toArray(), max.toArray()].map((v) => v.map((n) => Math.round(n * 1000) / 1000 + 0));
};

describe("built object meshes", () => {
  it("fills each piece's box with its primitive", () => {
    for (const type of PIECE_TYPES) {
      const [min, max] = bounds(pieceGeometry({ type, size: [2, 4, 6], at: [1, 2, 3], turn: [0, 0, 0] }));
      expect(min, type).toEqual([0, 0, 0]);
      expect(max, type).toEqual([2, 4, 6]);
    }
  });

  it("tapers cylinders, keeping their bottoms", () => {
    const g = pieceGeometry({ type: "cylinder", taper: 0.5, size: [2, 2, 2], at: [0, 1, 0], turn: [0, 0, 0] });
    const p = g.attributes.position;
    let [top, bottom] = [0, 0];
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (p.getY(i) > 1.99) top = Math.max(top, r);
      else if (p.getY(i) < 0.01) bottom = Math.max(bottom, r);
    }
    expect(top).toBeCloseTo(0.5);
    expect(bottom).toBeCloseTo(1);
  });

  it("cuts holes out of the pieces they reach into, colored as the hole", () => {
    const object = emptyObject();
    const wood = addColor(object, "#884422");
    const inside = addColor(object, "#000000");
    object.pieces.push({ type: "box", size: [4, 4, 4], at: [0, 2, 0], turn: [0, 0, 0], color: wood });
    object.pieces.push({ type: "cylinder", size: [2, 6, 2], at: [0, 2, 0], turn: [0, 0, 0], color: inside, cut: true });
    const g = objectGeometry(object);
    // A ray straight down the middle meets nothing: the hole goes right through.
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const down = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(down.intersectObject(mesh)).toHaveLength(0);
    const offCentre = new THREE.Raycaster(new THREE.Vector3(1.5, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(offCentre.intersectObject(mesh).length).toBeGreaterThan(0);
    // The hole's walls are black; the box's faces aren't.
    const c = g.attributes.color;
    const shades = new Set(Array.from({ length: c.count }, (_, i) => (c.getX(i) < 0.01 ? "black" : "wood")));
    expect([...shades].sort()).toEqual(["black", "wood"]);
    const [min, max] = bounds(g);
    expect(min).toEqual([-2, 0, -2]);
    expect(max).toEqual([2, 4, 2]);
  });

  it("faces every primitive's triangles outward", () => {
    for (const type of PIECE_TYPES) {
      const p = pieceGeometry({ type, size: [1, 1, 1], at: [0, 0, 0], turn: [0, 0, 0] }).attributes.position;
      const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      // Inside the shape: the middle of its corners (a wedge's slope runs through its box's middle).
      const inside = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) inside.add(a.fromBufferAttribute(p, i));
      inside.divideScalar(p.count);
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i);
        b.fromBufferAttribute(p, i + 1);
        c.fromBufferAttribute(p, i + 2);
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        const middle = a.clone().add(b).add(c).divideScalar(3).sub(inside);
        expect(normal.dot(middle), `${type} triangle ${i / 3}`).toBeGreaterThan(0);
      }
    }
  });

  it("turns pieces the way the format's corners do", () => {
    const piece = { type: "box", size: [4, 1, 2], at: [1, 2, 3], turn: [30, 20, 70] };
    const corners = pieceCorners(piece);
    const g = pieceGeometry(piece);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const nearest = Math.min(...corners.map((c) => v.distanceTo(new THREE.Vector3(...c))));
      expect(nearest).toBeLessThan(1e-4);
    }
  });

  it("merges pieces, colored by the palette, with parameters overridden", () => {
    const object = emptyObject();
    const red = addColor(object, "#ff0000");
    const blue = addColor(object, "#0000ff");
    object.pieces.push({ type: "box", size: [1, 1, 1], at: [0, 0.5, 0], turn: [0, 0, 0], color: red });
    object.pieces.push({ type: "cone", size: [1, 1, 1], at: [0, 1.5, 0], turn: [0, 0, 0], color: blue });
    const g = objectGeometry(object, ["#00ff00"]);
    const c = g.attributes.color;
    expect([c.getX(0), c.getY(0), c.getZ(0)]).toEqual([0, 1, 0]);
    expect([c.getX(c.count - 1), c.getY(c.count - 1), c.getZ(c.count - 1)]).toEqual([0, 0, 1]);
    expect(objectGeometry(emptyObject())).toBeNull();
  });

  it("finds each primitive's flat faces", () => {
    expect(pieceFaces("box").map((f) => f.id).sort()).toEqual(["-1,0,0", "0,-1,0", "0,0,-1", "0,0,1", "0,1,0", "1,0,0"]);
    expect(pieceFaces("wedge").map((f) => f.id)).toContain("0,0.71,0.71");
    expect(pieceFaces("cylinder").filter((f) => f.id === "0,1,0")).toHaveLength(1);
    const top = pieceFaces("box").find((f) => f.id === "0,1,0");
    expect(top.center.toArray()).toEqual([0, 0.5, 0]);
    expect(top.u.toArray()).toEqual([0.5, 0, 0]);
    expect(top.v.toArray().map((n) => n + 0)).toEqual([0, 0, -0.5]);
  });

  it("places a decal on a face, sized in feet, turned with its piece", () => {
    const piece = { type: "box", size: [4, 2, 2], at: [0, 1, 0], turn: [0, 0, 0] };
    const decal = { image: "x", face: "0,0,1", at: [0.75, 0.5], size: [1, 1], turn: 0 };
    const { corners, normal } = decalCorners(piece, decal);
    const round = (v) => v.toArray().map((n) => Math.round(n * 1000) / 1000 + 0);
    // On the south face (z = 1), a quarter of the way in from the east edge, a foot square.
    expect(corners.map(round)).toEqual([
      [0.5, 0.5, 1.02],
      [1.5, 0.5, 1.02],
      [1.5, 1.5, 1.02],
      [0.5, 1.5, 1.02],
    ]);
    expect(round(normal)).toEqual([0, 0, 1]);
    // Turned a quarter, the south face looks east.
    const turned = decalCorners({ ...piece, turn: [90, 0, 0] }, decal);
    expect(round(turned.normal)).toEqual([1, 0, 0]);
    expect(faceSpot(piece, "0,0,1", [0.25, 0, 0.5])).toEqual([0.75, 0.5]);
    expect(decalCorners(piece, { ...decal, face: "9,9,9" })).toBeUndefined();
  });

  it("gathers decals into one geometry with an atlas of their images", () => {
    const object = emptyObject();
    addColor(object, "#ff0000");
    const arrow = emptyImage("arrow");
    setPixel(arrow, 0, 0, { ink: "a", opacity: "4" });
    const dot = emptyImage("dot");
    const piece = { type: "box", size: [2, 2, 2], at: [0, 1, 0], turn: [0, 0, 0], color: 0 };
    piece.decals = [
      { image: arrow.id, face: "0,0,1", at: [0.5, 0.5], size: [1, 1], turn: 0 },
      { image: dot.id, face: "1,0,0", at: [0.5, 0.5], size: [1, 1], turn: 0 },
      { image: "gone0000", face: "1,0,0", at: [0.5, 0.5], size: [1, 1], turn: 0 },
    ];
    object.pieces.push(piece);
    const images = new Map([arrow, dot].map((i) => [i.id, i]));
    const { geometry, atlas } = decalGeometry(object, (id) => images.get(id), ["#0000ff"]);
    expect(geometry.attributes.position.count).toBe(12);
    expect(atlas.size).toBe(64);
    // The arrow's top-left pixel lands at the top of its cell (textures run bottom row first),
    // in the parameter's color.
    const i = (31 * 64 + 0) * 4;
    expect([...atlas.rgba.slice(i, i + 4)]).toEqual([0, 0, 255, 255]);
    expect(decalGeometry(emptyObject(), () => undefined)).toBeNull();
  });

  it("letters texts in their ink, a placement's wording first, an empty one as the placeholder or not at all", () => {
    const object = emptyObject();
    addColor(object, "#ff0000");
    const sign = { name: "to", text: "OAK", ink: "a", face: "0,0,1", at: [0.5, 0.5], size: [2.6, 1.4], turn: 0 };
    object.pieces.push({ type: "box", size: [3, 2, 0.2], at: [0, 4, 0], turn: [0, 0, 0], color: 0, texts: [sign] });
    const lit = (signs) => {
      const { rgba } = signs.atlas;
      let n = 0;
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) n++;
      return n;
    };
    const oak = textGeometry(object, []);
    expect(oak.geometry.attributes.position.count).toBe(6);
    expect([...oak.atlas.rgba.slice(oak.atlas.rgba.findIndex((v, i) => i % 4 === 3 && v) - 3).slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(lit(textGeometry(object, [], { to: "MILL" }))).not.toBe(lit(oak));
    sign.text = "";
    expect(textGeometry(object, [])).toBeNull();
    expect(textGeometry(object, [], {}, "ABC")).not.toBeNull();
  });

  it("tiles images in feet, wrapping round sides a whole number of times", () => {
    const object = emptyObject();
    addColor(object, "#ffffff");
    const shingle = { ...emptyImage("shingle", "tiled") };
    object.pieces.push({ type: "box", size: [4, 2, 2], at: [0, 1, 0], turn: [0, 0, 0], color: 0, tile: { image: shingle.id, every: 0.5, jitter: 0.3 } });
    object.pieces.push({ type: "cylinder", size: [2, 2, 2], at: [5, 1, 0], turn: [0, 0, 0], color: 0, tile: { image: shingle.id, every: 1, jitter: 0 } });
    object.pieces.push({ type: "box", size: [1, 1, 1], at: [-5, 1, 0], turn: [0, 0, 0], color: 0, tile: { image: "gone0000", every: 1, jitter: 0 } });
    const tiles = tiledGeometries(object, (id) => (id === shingle.id ? shingle : undefined));
    expect(tiles).toHaveLength(1);
    const { geometry } = tiles[0];
    const uv = geometry.attributes.uv;
    const jitter = geometry.attributes.jitter;
    const us = [];
    for (let i = 0; i < uv.count; i++) us.push(uv.getX(i));
    // The 4 ft box, half-foot copies: 8 across, from -4 to 4.
    expect(Math.min(...us)).toBeCloseTo(-4);
    // The cylinder, 2 ft across, 1 ft copies: round(pi * 2) = 6 around, so its u reaches 6.
    expect(Math.max(...us)).toBeCloseTo(6);
    expect(jitter.getX(0)).toBeCloseTo(0.3);
    expect(jitter.getX(jitter.count - 1)).toBe(0);
  });
});
