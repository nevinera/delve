import fs from "fs";
import { describe, expect, it } from "vitest";
import { checkGameData } from "./gameData.js";

// The examples in docs/formats/game-data.md, in the order they appear.
const EXAMPLES = [...fs.readFileSync(new URL("../../../docs/formats/game-data.md", import.meta.url), "utf8").matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));
const [klass, ability, status, item, template, creature, npc, dialogue, spawns] = EXAMPLES;

// A world's game data with the doc's examples in it, and whatever they point at.
function world() {
  const by = (...things) => new Map(things.map((t) => [t.id, structuredClone(t)]));
  const stub = (id, more = {}) => ({ id, name: id, ...more });
  const effect = { type: "damage", affects: "target", amount: 1 };
  return {
    classes: by(klass),
    abilities: by(
      ability,
      stub("jab00001", { target: "enemy", range: "melee", cost: [{ resource: "energy", amount: 40 }], effects: [effect] }),
      stub("kick0001", { target: "enemy", range: "melee", effects: [{ type: "interrupt", affects: "target", lockout: 4 }] }),
      stub("bite0001", { target: "enemy", range: "melee", effects: [effect] }),
    ),
    statuses: by(status, stub("flow0001", { kind: "hidden", effects: [] }), stub("cntr0001", { kind: "hidden", effects: [] })),
    items: by(item, stub("fist0001", { quality: "common", itemLevel: 5, slot: "mainHand", weaponType: "fist" }), stub("pelt0001", { quality: "poor", itemLevel: 1, price: 30, stack: 10 }), stub("brd00001", { quality: "common", itemLevel: 1, price: 25, stack: 20 }), stub("watr0001", { quality: "common", itemLevel: 1, price: 25, stack: 20 })),
    itemTemplates: by(template),
    creatures: by(creature, stub("wolf0002", { look: { body: "wolf" } })),
    npcs: by(npc),
    dialogues: by(dialogue),
    spawns: new Map([["places/continents/main/spawns.json", structuredClone(spawns)]]),
  };
}

const messages = (data, levelCap = 20) => {
  const out = [];
  checkGameData(data, levelCap, (path, message) => out.push(`${path}: ${message}`), (path, message) => out.push(`warning: ${path}: ${message}`));
  return out;
};
const changed = (change, levelCap) => {
  const data = world();
  change(data);
  return messages(data, levelCap);
};

describe("checkGameData", () => {
  it("finds nothing wrong with the doc's examples", () => {
    expect(EXAMPLES).toHaveLength(9);
    expect(messages(world())).toEqual([]);
  });

  it("checks classes", () => {
    expect(changed((d) => (d.classes.get("m0nk0001").resources = []))).toEqual([
      "classes/m0nk0001.json: needs 1 to 3 resources",
      "classes/m0nk0001.json: gets jab00001, which costs energy, a resource the class doesn't have",
    ]);
    expect(changed((d) => delete d.classes.get("m0nk0001").resources[1].max)).toEqual(["classes/m0nk0001.json: resource 2 needs a max, as a points resource"]);
    expect(changed((d) => (d.classes.get("m0nk0001").resources[0].max = 50))).toEqual(["classes/m0nk0001.json: resource 1 can't set max, regen or decay: energy has its own rules"]);
    expect(changed((d) => (d.classes.get("m0nk0001").armor[1].type = "mail"))).toEqual(['classes/m0nk0001.json: wears {"type":"mail","level":1}: it needs a type from cloth, leather, chain, plate and a level']);
    expect(changed((d) => d.classes.get("m0nk0001").weapons.push("lance"))).toEqual(['classes/m0nk0001.json: uses "lance", which isn\'t a weapon type']);
    expect(changed((d) => d.statuses.delete("cntr0001"))).toEqual(["classes/m0nk0001.json: has mastery status cntr0001, which the world doesn't have"]);
    expect(changed((d) => d.items.delete("wrap0001"))).toEqual(["classes/m0nk0001.json: starts with item wrap0001, which the world doesn't have"]);
  });

  it("checks what a class gets, and when", () => {
    expect(changed((d) => d.abilities.delete("kick0001"))).toEqual(["classes/m0nk0001.json: gets ability kick0001, which the world doesn't have"]);
    expect(changed((d) => (d.classes.get("m0nk0001").abilities[1].level = 15), 10)).toEqual(["warning: classes/m0nk0001.json: gets ability kick0001 at level 15, past the level cap of 10"]);
    expect(changed((d) => (d.abilities.get("jab00001").cost[0].resource = "rage"))).toEqual(["classes/m0nk0001.json: gets jab00001, which costs rage, a resource the class doesn't have"]);
  });

  it("checks abilities and their effects", () => {
    const at = "abilities/frst0001.json";
    expect(changed((d) => (d.abilities.get("frst0001").target = "foe"))).toEqual([`${at}: needs a target, one of enemy, ally, self, ground, none`]);
    expect(changed((d) => delete d.abilities.get("frst0001").range)).toEqual([`${at}: needs a range, to target an enemy`]);
    expect(changed((d) => (d.abilities.get("frst0001").channel = { duration: 3, ticks: 3 }))).toEqual([`${at}: can't have both a cast time and a channel`]);
    expect(changed((d) => (d.abilities.get("frst0001").cost = [{ resource: "energy", percent: 5 }]))).toEqual([`${at}: costs a percent of energy; only mana costs a percent`]);
    expect(changed((d) => (d.abilities.get("frst0001").effects[0].amount = { spellpower: 1 }))).toEqual([`${at}: effect 1 needs an amount`]);
    expect(changed((d) => (d.abilities.get("frst0001").effects[0].affects = "enemies"))).toEqual([`${at}: effect 1 needs a radius, affecting enemies`]);
    expect(changed((d) => (d.abilities.get("frst0001").effects[0].radius = 8))).toEqual([`${at}: effect 1 can't have around, radius, height, cone or max unless it affects enemies or allies`]);
    expect(changed((d) => Object.assign(d.abilities.get("frst0001").effects[0], { affects: "enemies", radius: 8, around: "ground" }))).toEqual([`${at}: effect 1 is around the ground, but the ability doesn't target it`]);
    expect(changed((d) => d.statuses.delete("chil0001"))).toEqual([`${at}: effect 2 applies status chil0001, which the world doesn't have`]);
    expect(changed((d) => (d.abilities.get("frst0001").visuals[0].when = "later"))).toEqual([`${at}: visual 1 needs an effect, when (cast, launch, impact, channel), and maybe on (caster, target, ground), colors and scale`]);
    expect(changed((d) => (d.abilities.get("frst0001").target = "self"))).toEqual([`${at}: effect 1 affects the target, but the ability has none`, `${at}: effect 2 affects the target, but the ability has none`]);
    expect(changed((d) => (d.abilities.get("frst0001").range = "far"))).toEqual([`${at}: needs a range of 0 or more, or "melee"`]);
    expect(changed((d) => Object.assign(d.abilities.get("frst0001"), { range: "melee", minRange: 8 }))).toEqual([`${at}: has a minRange past its range`]);
    expect(changed((d) => (d.abilities.get("frst0001").creatureTypes = ["beast", "fish"]))).toEqual([expect.stringMatching(/needs creatureTypes from beast/)]);
  });

  it("checks requirements and conditions", () => {
    const at = "abilities/frst0001.json";
    const requires = (...r) => (d) => (d.abilities.get("frst0001").requires = r);
    expect(changed(requires({ health: "target", below: 20 }, { status: "chil0001", on: "target" }))).toEqual([]);
    expect(changed(requires({ health: "target", below: 20, above: 5 }))).toEqual([`${at}: requirement 1 needs health (self or target), and below or above, a percent`]);
    expect(changed(requires({ status: "gone0001", on: "self" }))).toEqual([`${at}: requirement 1 needs status gone0001, which the world doesn't have`]);
    expect(changed(requires({ status: "chil0001" }))).toEqual([`${at}: requirement 1 needs on, self or target`]);
    expect(changed((d) => (d.statuses.get("chil0001").effects[0].when = [{ health: "self", above: 150 }]))).toEqual(["statuses/chil0001.json: effect 1 condition 1 needs health (self or target), and below or above, a percent"]);
  });

  it("checks move effects and areas", () => {
    const at = "abilities/frst0001.json";
    const effect = (e) => (d) => (d.abilities.get("frst0001").effects[0] = e);
    expect(changed(effect({ type: "move", kind: "charge", affects: "self", speed: 80 }))).toEqual([]);
    expect(changed(effect({ type: "move", kind: "knockback", affects: "enemies", radius: 10, height: 6, distance: 20 }))).toEqual([]);
    expect(changed(effect({ type: "move", kind: "charge", affects: "target" }))).toEqual([`${at}: effect 1 needs to affect self, to charge`]);
    expect(changed(effect({ type: "move", kind: "pull", affects: "self" }))).toEqual([`${at}: effect 1 can't affect self, to pull`]);
    expect(changed(effect({ type: "move", kind: "blink", affects: "self" }))).toEqual([`${at}: effect 1 needs a distance above 0, to blink`]);
    expect(changed(effect({ type: "move", kind: "teleport", affects: "self" }))).toEqual([`${at}: effect 1 needs a kind, one of charge, leap, knockback, pull, blink`]);
    expect(changed(effect({ type: "damage", affects: "enemies", radius: 8, height: 0, amount: 1 }))).toEqual([`${at}: effect 1 needs a height above 0`]);
    expect(changed(effect({ type: "damage", affects: "target", height: 4, amount: 1 }))).toEqual([`${at}: effect 1 can't have around, radius, height, cone or max unless it affects enemies or allies`]);
  });

  it("checks statuses", () => {
    const at = "statuses/chil0001.json";
    expect(changed((d) => (d.statuses.get("chil0001").effects[0].stat = "slowness"))).toEqual([`${at}: effect 1 changes "slowness", which isn't a stat`]);
    expect(changed((d) => (d.statuses.get("chil0001").effects[0].add = 1))).toEqual([`${at}: effect 1 needs add or multiply, a number`]);
    expect(changed((d) => (d.statuses.get("chil0001").maxStacks = 3))).toEqual([`${at}: needs stacking of stack, and a whole maxStacks of 1 or more`]);
    expect(changed((d) => d.statuses.get("chil0001").effects.push({ type: "periodic", every: 2, does: "damage", amount: { spellPower: 0.1 }, school: "frost" }))).toEqual([]);
    expect(changed((d) => d.statuses.get("chil0001").effects.push({ type: "trigger", on: "takeDamage", effect: { type: "damage", affects: "enemies", radius: 5, amount: 1 } }))).toEqual([`${at}: effect 2 's effect needs affects, one of self, target`]);
    expect(changed((d) => d.statuses.get("chil0001").effects.push({ type: "control", control: "sleep" }))).toEqual([`${at}: effect 2 needs control, one of stun, root, silence, incapacitate, disorient, fear, disarm`]);
    expect(changed((d) => d.statuses.get("chil0001").effects.push({ type: "trigger", on: "healthBelow", effect: { type: "heal", affects: "self", amount: 1 } }))).toEqual([`${at}: effect 2 needs a threshold percent with healthBelow, and only then`]);
  });

  it("checks items and templates", () => {
    expect(changed((d) => (d.items.get("wrap0001").slot = "finger"))).toEqual(['items/wrap0001.json: has armorType "leather": it needs one of cloth, leather, chain, plate, in one of head, shoulders, chest, hands, legs, feet']);
    expect(changed((d) => (d.items.get("wrap0001").stats.spirit = 3))).toEqual([expect.stringMatching(/^items\/wrap0001.json: needs stats from strength/)]);
    expect(changed((d) => (d.items.get("fist0001").weaponType = undefined))).toEqual(["items/fist0001.json: needs a weaponType, in mainHand"]);
    expect(changed((d) => (d.items.get("wrap0001").stack = 5))).toEqual(["items/wrap0001.json: stacks, but gear can't"]);
    expect(changed((d) => (d.itemTemplates.get("swrd0001").levels = [12, 1]))).toEqual(["item-templates/swrd0001.json: needs levels, [min, max]"]);
    expect(changed((d) => (d.itemTemplates.get("swrd0001").stats.spirit = 1))).toEqual(["item-templates/swrd0001.json: needs stats, weights for primary, secondary or gear stats"]);
  });

  it("checks creatures, NPCs and dialogue", () => {
    expect(changed((d) => (d.creatures.get("wolf0001").look.body = "dragon"))).toEqual(['creatures/wolf0001.json: has body "dragon", not one of humanoid, goblin, trog, wolf, bobcat, bear, slime']);
    expect(changed((d) => (d.creatures.get("wolf0001").tactics = { type: "priority", abilities: ["kick0001"] }))).toEqual(["creatures/wolf0001.json: uses kick0001 in its tactics, but doesn't have it"]);
    expect(changed((d) => Object.assign(d.creatures.get("wolf0001"), { onDeath: "bite0001", tactics: { type: "rotation", abilities: ["bite0001"] } }))).toEqual(["creatures/wolf0001.json: uses bite0001 in its tactics, but that's what it does as it dies"]);
    expect(changed((d) => (d.creatures.get("wolf0001").creatureType = "wolf"))).toEqual([expect.stringMatching(/has creatureType "wolf", not one of beast/)]);
    expect(changed((d) => (d.creatures.get("wolf0001").attack.range = -1))).toEqual(["creatures/wolf0001.json: needs an attack of { speed, range, school }"]);
    expect(changed((d) => d.items.delete("pelt0001"))).toEqual(["creatures/wolf0001.json: drops item pelt0001, which the world doesn't have"]);
    expect(changed((d) => d.items.delete("brd00001"))).toEqual(["npcs/vend0001.json: sells item brd00001, which the world doesn't have"]);
    expect(changed((d) => (d.dialogues.get("danl0001").lines.place.choices[0].next = "nowhere"))).toEqual(['dialogues/danl0001.json: line place goes to "nowhere", which isn\'t one of its lines']);
    expect(changed((d) => (d.dialogues.get("danl0001").start = "hi"))).toEqual(['dialogues/danl0001.json: starts at "hi", which isn\'t one of its lines']);
  });

  it("checks spawns", () => {
    const at = "places/continents/main/spawns.json";
    const spawnsOf = (d) => d.spawns.get(at);
    expect(changed((d) => (spawnsOf(d).regions[0].spawns[0].creature = "bear0001"))).toEqual([`${at}: region Wolf Den's spawn 1 is creature bear0001, which the world doesn't have`]);
    expect(changed((d) => (spawnsOf(d).regions[0].spawns[0].levels = [4, 3]))).toEqual([`${at}: region Wolf Den's spawn 1 needs levels, a level or [min, max]`]);
    expect(changed((d) => (spawnsOf(d).placed[1].levels = 12), 10)).toEqual([`warning: ${at}: placed p2b7c3dd is past the level cap of 10`]);
    expect(changed((d) => (spawnsOf(d).placed[0].levels = 3))).toEqual([`${at}: placed p1x9z2aa is an npc, which doesn't take levels, respawn, wander, pack or patrol`]);
    expect(changed((d) => (spawnsOf(d).placed[1].id = "r8k2m1qa"))).toEqual([`${at}: has id r8k2m1qa twice`]);
    expect(changed((d) => (spawnsOf(d).placed[1].npc = "vend0001"))).toEqual([`${at}: placed p2b7c3dd needs a creature or an npc`]);
    expect(changed((d) => (spawnsOf(d).regions[0].area = [[[[0, 0], [1, 1]]]]))).toEqual([`${at}: region Wolf Den needs an area: polygons of rings of [x, z] points`]);
    expect(changed((d) => (spawnsOf(d).regions[0].spawns[0].pack = [3, 1]))).toEqual([`${at}: region Wolf Den's spawn 1 needs a pack of [min, max], whole numbers`]);
    expect(changed((d) => (spawnsOf(d).placed[3].wander = 10))).toEqual([`${at}: placed p4d9e5ff patrols, so it can't wander`]);
    expect(changed((d) => (spawnsOf(d).placed[3].patrol.points = [[1, 2]]))).toEqual([`${at}: placed p4d9e5ff needs a patrol of { points }, two or more [x, z]`]);
    expect(changed((d) => (spawnsOf(d).placed[0].pack = "den00001"))).toEqual([`${at}: placed p1x9z2aa is an npc, which doesn't take levels, respawn, wander, pack or patrol`]);
  });
});
