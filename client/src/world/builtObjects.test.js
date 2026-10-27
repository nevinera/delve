import { describe, expect, it } from "vitest";
import { MAX_PARAMS, addColor, collectionJson, dropUnusedColors, emptyImage, imageProblems, imageRgba, matches, emptyObject, pixelAt, setPixel, newObjectId, paletteColors, pieceCorners, problems, readCollection, shapeOf, turnPoint } from "./builtObjects.js";

const piece = (over = {}) => ({ type: "box", size: [2, 2, 2], at: [0, 1, 0], turn: [0, 0, 0], color: 0, ...over });

function table() {
  const object = emptyObject("table", () => 0.5);
  const wood = addColor(object, "#8a5a2b");
  object.pieces.push(piece({ size: [6, 0.3, 3], at: [0, 3, 0], color: wood }));
  for (const x of [-2.7, 2.7]) for (const z of [-1.2, 1.2]) object.pieces.push(piece({ size: [0.3, 3, 0.3], at: [x, 1.5, z], color: wood }));
  return object;
}

describe("built objects", () => {
  it("makes short ids of letters and digits", () => {
    expect(newObjectId()).toMatch(/^[0-9a-z]{8}$/);
  });

  it("makes the first colors parameters, up to the limit", () => {
    const object = emptyObject();
    for (const c of ["#000001", "#000002", "#000003", "#000004"]) addColor(object, c);
    expect(object.palette.map((p) => p.param)).toEqual([true, true, true, false]);
    expect(object.palette.filter((p) => p.param)).toHaveLength(MAX_PARAMS);
    expect(addColor(object, "#000002")).toBe(1);
  });

  it("overrides parameter colors and keeps the rest", () => {
    const object = emptyObject();
    for (const c of ["#000001", "#000002", "#000003", "#000004"]) addColor(object, c);
    object.palette[1].param = false;
    expect(paletteColors(object, ["#ff0000"])).toEqual(["#ff0000", "#000002", "#000003", "#000004"]);
  });

  it("drops unused colors from the end only, keeping the ones images use", () => {
    const object = emptyObject();
    ["#000001", "#000002", "#000003", "#000004"].forEach((c) => addColor(object, c));
    object.pieces.push(piece({ color: 1 }));
    const image = emptyImage();
    setPixel(image, 3, 4, { ink: "c", opacity: "4" });
    const plain = structuredClone(object);
    dropUnusedColors(plain);
    expect(plain.palette.map((p) => p.color)).toEqual(["#000001", "#000002"]);
    dropUnusedColors(object, [image]);
    expect(object.palette.map((p) => p.color)).toEqual(["#000001", "#000002", "#000003"]);
    expect(object.pieces[0].color).toBe(1);
  });

  it("paints images with the wearer's palette and grays", () => {
    const object = emptyObject();
    addColor(object, "#ff0000");
    addColor(object, "#00ff00");
    const image = emptyImage("arrow", "decal");
    setPixel(image, 0, 0, { ink: "b", opacity: "4" });
    setPixel(image, 1, 0, { ink: "7", opacity: "2" });
    setPixel(image, 2, 0, { ink: "0", opacity: "1" });
    setPixel(image, 3, 0, { ink: "e", opacity: "4" });
    expect(pixelAt(image, 0, 0)).toEqual({ ink: "b", opacity: "4" });
    expect(pixelAt(image, 4, 0)).toBeNull();
    expect(imageProblems(image)).toEqual([]);
    const rgba = imageRgba(image, paletteColors(object, ["#0000ff"]));
    expect([...rgba.slice(0, 16)]).toEqual([0, 255, 0, 255, 0, 0, 0, 128, 255, 255, 255, 64, 128, 128, 128, 255]);
    expect(rgba[19]).toBe(0);
    // A parameter override reaches the image as it does the pieces.
    image.rows[0] = "a4" + image.rows[0].slice(2);
    expect([...imageRgba(image, paletteColors(object, ["#0000ff"])).slice(0, 4)]).toEqual([0, 0, 255, 255]);
    expect(imageProblems({ ...image, rows: image.rows.slice(1) })).toHaveLength(1);
    expect(imageProblems({ ...image, kind: "sticker" })).toHaveLength(1);
  });

  it("turns as three.js's YXZ order does: yaw 90 takes east to north", () => {
    const [x, y, z] = turnPoint([1, 0, 0], [90, 0, 0]);
    expect([x, y, z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, -1]);
    // Pitch 90 tips up (+y) toward south (+z); roll 90 tips east (+x) up.
    expect(turnPoint([0, 1, 0], [0, 90, 0])[2]).toBeCloseTo(1);
    expect(turnPoint([1, 0, 0], [0, 0, 90])[1]).toBeCloseTo(1);
  });

  it("finds nothing wrong with a good object", () => {
    expect(problems(table())).toEqual([]);
  });

  it("finds pieces too far out, too small, of unknown types or colors, and too many", () => {
    const object = table();
    object.pieces.push(piece({ at: [40, 0, 0] }), piece({ size: [0, 1, 1] }), piece({ type: "blob" }), piece({ color: 5 }));
    const wrong = problems(object).join("\n");
    expect(wrong).toMatch(/reaches more than 32 ft/);
    expect(wrong).toMatch(/smaller than/);
    expect(wrong).toMatch(/unknown type/);
    expect(wrong).toMatch(/isn't in the palette/);
    object.pieces.push(piece({ taper: 0.5 }), piece({ type: "cylinder", taper: 2 }), piece({ cut: "yes" }));
    const more = problems(object).join("\n");
    expect(more).toMatch(/piece 10's taper/);
    expect(more).toMatch(/piece 11's taper/);
    expect(more).toMatch(/piece 12's cut/);
    expect(problems({ ...table(), pieces: [piece({ type: "cylinder", taper: 0.5 }), piece({ cut: true })] })).toEqual([]);
    while (object.pieces.length <= 32) object.pieces.push(piece());
    expect(problems(object).join("\n")).toMatch(/more than 32/);
  });

  it("works out how tall it stands and what it blocks", () => {
    const { footprint, height } = shapeOf(table());
    expect(height).toBeCloseTo(3.15);
    expect(footprint.rect[0]).toBeCloseTo(6);
    expect(footprint.rect[1]).toBeCloseTo(3);
    // A square pole turned 45° covers less as a circle.
    const pole = emptyObject();
    addColor(pole, "#ffffff");
    pole.pieces.push(piece({ size: [1, 10, 1], at: [0, 5, 0], turn: [45, 0, 0] }));
    expect(shapeOf(pole).footprint.circle).toBeCloseTo(Math.SQRT1_2);
    // Holes take nothing away from what it blocks, nor add to it.
    pole.pieces.push(piece({ size: [8, 20, 8], at: [0, 10, 0], cut: true }));
    expect(shapeOf(pole).footprint.circle).toBeCloseTo(Math.SQRT1_2);
    expect(shapeOf(pole).height).toBeCloseTo(10);
  });

  it("leaves pieces above head height out of the footprint", () => {
    const object = table();
    object.pieces.push(piece({ size: [20, 0.5, 20], at: [0, 10, 0] }));
    expect(shapeOf(object).footprint.rect[0]).toBeCloseTo(6);
    expect(pieceCorners(object.pieces.at(-1))).toHaveLength(8);
  });

  it("reads an object or a collection, recording where it came from", () => {
    const one = table();
    expect(readCollection(JSON.stringify(one))).toEqual({ name: null, objects: [one], images: [] });
    const read = readCollection(collectionJson("furniture", [{ ...one, collection: "abcdefgh" }, table()]), "https://example.com/furniture.json");
    expect(read.name).toBe("furniture");
    expect(read.objects).toHaveLength(2);
    expect(read.objects[0].source).toBe("https://example.com/furniture.json");
    expect(read.objects[0].collection).toBeUndefined();
    expect(() => readCollection(JSON.stringify({ ...one, pieces: [piece({ type: "blob" })] }))).toThrow(/unknown type/);
    expect(() => readCollection(JSON.stringify({ ...one, tags: "wood" }))).toThrow(/tags/);
  });

  it("reads and writes a collection's images, and checks decals", () => {
    const image = emptyImage("arrow");
    const object = { ...table(), collection: "abcdefgh" };
    object.pieces[0].decals = [{ image: image.id, face: "0,1,0", at: [0.5, 0.5], size: [1, 0.5], turn: 0 }];
    expect(problems(object)).toEqual([]);
    const read = readCollection(collectionJson("signs", [object], [{ ...image, collection: "abcdefgh" }]), "signs.json");
    expect(read.images).toEqual([{ ...image, source: "signs.json" }]);
    expect(readCollection(JSON.stringify(object)).images).toEqual([]);
    expect(() => readCollection(JSON.stringify({ collection: "x", objects: [], images: [{ ...image, kind: "x" }] }))).toThrow(/kind/);
    object.pieces[0].decals.push({ image: image.id, face: "0,1,0", at: [2, 0], size: [0, 1], turn: 0 });
    expect(problems(object).join()).toMatch(/piece 1's decal 2/);
  });

  it("matches a search on the collection's name, the object's name or a tag", () => {
    expect(matches("", "huts", "hut")).toBe(true);
    expect(matches("HUT", "village", "big hut")).toBe(true);
    expect(matches("vill", "village", "hut")).toBe(true);
    expect(matches("thatch", "village", "hut", ["thatched", "roof"])).toBe(true);
    expect(matches("stone", "village", "hut", ["thatched"])).toBe(false);
  });
});
