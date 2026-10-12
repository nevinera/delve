import {describe, it, expect} from "vitest";
import {parsePopulation} from "../population";
import {placeMap} from "../placer";
import {openGround} from "../ground";
import {outlineMap} from "../outline";
import {buildMap} from "../../zoneBuild/zoneBuild";

const zone = {name: "Forest", elvl: 0, maps: {camp: {theme: "glade", size: [60, 50], tags: ["paths"], exits: {north: "woods", south: "woods"}}}};
const camp = () => buildMap("camp", zone.maps.camp, zone);
const unitTypes = {wolf: {tokenRadius: 1.5}, boar: {tokenRadius: 2}, "dire-wolf": {tokenRadius: 2.5}};

// The camp with population plans on its biggest places, largest first.
function planned(...populations) {
  const map = camp();
  const bySize = outlineMap(map).places.sort((a, b) => b.area - a.area).map((p) => p.identifier);
  map.places = map.places.map((p) => {
    const i = bySize.indexOf(p.identifier);
    return i < populations.length ? {...p, annotations: {...p.annotations, population: populations[i]}} : p;
  });
  return {map, ids: bySize};
}

const unitsIn = (map, place) => outlineMap(map).places.find((p) => p.identifier === place)?.units ?? {};

describe("parsePopulation", () => {
  it("reads a plan, a line per key, with defaults", () => {
    const {plan, errors} = parsePopulation(`density: dense
mix: goblin-cutter 2, goblin-archer
groups: 2-3
movement: patrol
boss: warboss-grutt still
ncu: ranger-hale "Ranger Hale" ../../tokens/ncu/hale.webp "Keep your eyes open." wander 4`);
    expect(errors).toEqual([]);
    expect(plan).toEqual({
      density: 1,
      mix: [{unitType: "goblin-cutter", weight: 2}, {unitType: "goblin-archer", weight: 1}],
      groups: [2, 3],
      movement: {type: "patrol"},
      hostility: "hostile",
      bosses: [{unitType: "warboss-grutt", movement: {type: "still"}}],
      ncus: [{identifier: "ranger-hale", name: "Ranger Hale", tokenImageUrl: "../../tokens/ncu/hale.webp", greeting: "Keep your eyes open.", movement: {type: "wander", radius: 4}}],
    });
    expect(parsePopulation("density: 0.3\nmix: deer\nhostility: neutral").plan).toMatchObject({density: 0.3, hostility: "neutral", groups: [1, 1], movement: {type: "wander", radius: 10}});
    expect(parsePopulation("density: normal\nmix: wolf 3, deer neutral, boar 2 hostile").plan.mix).toEqual([
      {unitType: "wolf", weight: 3}, {unitType: "deer", weight: 1, hostility: "neutral"}, {unitType: "boar", weight: 2, hostility: "hostile"},
    ]);
    expect(parsePopulation("density: none").errors).toEqual([]);
  });

  it("says what's wrong with each bad line", () => {
    expect(parsePopulation("density: lots\ngroups: 3-1\nmovement: fly\nhostility: angry\ncolor: red\njust words\nncu: hale").errors).toEqual([
      "density: lots isn't none, sparse, normal, dense, packed or a number (encounters per 1000 sq ft)",
      "groups: 3-1 isn't a size or range, 1 to 8",
      "movement: fly isn't still, patrol or wander [radius]",
      "hostility: angry isn't hostile, neutral, friendly",
      "color: unknown key color (known: density, mix, groups, movement, hostility, boss, ncu)",
      "\"just words\": lines are key: value",
      "ncu: hale isn't: identifier \"Name\" tokenImageUrl [\"greeting\"] [movement]",
    ]);
    expect(parsePopulation("density: normal").errors).toEqual(["density without a mix: say which unit types"]);
  });
});

describe("placeMap", () => {
  it("fills a place to its density with the mix, in groups, on open ground clear of walls", () => {
    const {map, ids} = planned("density: dense\nmix: wolf 2, boar neutral\ngroups: 2-3", "density: sparse\nmix: dire-wolf");
    const {map: out, placed, errors} = placeMap(map, {unitTypes});
    expect(errors).toEqual([]);
    expect(placed.map((p) => p.place)).toEqual(expect.arrayContaining([ids[0], ids[1]]));
    const added = out.units.slice(map.units?.length ?? 0);
    expect(added.length).toBeGreaterThan(4);
    expect(Object.keys(unitsIn(out, ids[0])).sort()).toEqual(["boar", "wolf"]);
    expect(Object.keys(unitsIn(out, ids[1]))).toEqual(["dire-wolf"]);
    // Dense: groups of 2-3, each one encounter.
    const groups = Object.groupBy(added.filter((u) => u.groupIdentifier), (u) => u.groupIdentifier);
    expect(Object.values(groups).every((g) => g.length >= 1 && g.length <= 3)).toBe(true);
    const open = openGround(out);
    for (const unit of added) {
      expect(open(unit.position.x, unit.position.y)).toBe(true);
      expect(unit).toMatchObject({hostility: unit.unitType === "boar" ? "neutral" : "hostile", identifier: expect.stringMatching(/^camp-area_\d+-(wolf|boar|dire-wolf)-\d+$/)});
      if (unit.movement.type === "wander") {
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          expect(open(unit.movement.location.x + Math.cos(a) * unit.movement.radius, unit.movement.location.y + Math.sin(a) * unit.movement.radius)).toBe(true);
        }
      }
    }
    expect(new Set(out.units.map((u) => u.identifier)).size).toBe(out.units.length);
  });

  it("is the same every time, and adds nothing when run again", () => {
    const {map} = planned("density: normal\nmix: wolf");
    const once = placeMap(map, {unitTypes}).map;
    expect(placeMap(map, {unitTypes}).map).toEqual(once);
    const again = placeMap(once, {unitTypes});
    expect(again.map.units).toEqual(once.units);
    expect(again.placed.every((p) => p.units === 0)).toBe(true);
  });

  it("counts the units already there toward the density", () => {
    const {map} = planned("density: normal\nmix: wolf");
    const full = placeMap(map, {unitTypes}).map;
    const {map: fewer} = planned("density: normal\nmix: wolf");
    fewer.units = full.units.slice(0, Math.ceil(full.units.length / 2));
    expect(placeMap(fewer, {unitTypes}).map.units.length).toBeLessThanOrEqual(full.units.length);
    expect(placeMap(fewer, {unitTypes}).map.units.length).toBeGreaterThan(fewer.units.length);
  });

  it("places bosses and NCUs once each, near the middle, with a greeting", () => {
    const {map, ids} = planned('density: none\nboss: dire-wolf still\nncu: hale "Ranger Hale" ../tokens/hale.webp "Watch the trees."');
    const ncuIds = new Set();
    const {map: out} = placeMap(map, {unitTypes, ncuIds});
    expect(unitsIn(out, ids[0])).toEqual({"dire-wolf": 1});
    expect(out.units.find((u) => u.unitType === "dire-wolf").movement).toEqual({type: "still"});
    expect(out.ncus).toEqual([expect.objectContaining({
      identifier: "hale", name: "Ranger Hale", tokenImageUrl: "../tokens/hale.webp", tokenRadius: 2, movement: {type: "still"},
      dialogue: {entry: [{node: "greeting"}], nodes: {greeting: {text: "Watch the trees."}}},
    })]);
    expect(ncuIds).toEqual(new Set(["hale"]));
    expect(placeMap(out, {unitTypes, ncuIds}).map).toEqual(out);
  });

  it("reports bad plans and unit types the zone doesn't have, placing nothing there", () => {
    const {map, ids} = planned("density: normal\nmix: bear", "density: loads");
    const {map: out, errors} = placeMap(map, {unitTypes});
    expect(errors).toEqual([
      `camp/${ids[0]}: no unit type bear in the zone`,
      `camp/${ids[1]}: density: loads isn't none, sparse, normal, dense, packed or a number (encounters per 1000 sq ft)`,
    ].sort((a, b) => map.places.findIndex((p) => a.includes(`/${p.identifier}:`)) - map.places.findIndex((p) => b.includes(`/${p.identifier}:`))));
    expect(out).toBe(map);
  });
});
