import { describe, expect, it } from "vitest";
import { knownAbilities } from "../play/build.js";
import { GENERAL, addAbility, addPassive, addTalent, bookPages, duplicateAbility, pageTiles, removeAbility, removePassive, removeTalent, roomForPassive, talentIcon, talentSpecs, toggleOnSpec, usedBy } from "./spellbook.js";

const paladin = () => ({
  id: "pal",
  name: "Paladin",
  specializations: [{ id: "def", name: "Defender", abilities: ["block"], status: "bulwark" }, { id: "blood", name: "Blood" }],
  abilities: [
    { id: "smite", name: "Smite", level: 1 },
    { id: "block", name: "Block", level: 12 },
    { id: "ward", name: "Ward", level: 15, icon: "shield" },
    { id: "heal", name: "Heal", level: 3 },
  ],
  statuses: [{ id: "bulwark", name: "Bulwark" }, { id: "zeal", name: "Zeal", icon: "fire" }, { id: "mark", name: "Mark" }],
  passives: [{ status: "zeal", level: 3 }],
  talents: { 15: [{ id: "t1", name: "Warded", grants: [{ ability: "ward", spec: "def" }] }, { id: "t2", name: "Marked", grants: [{ status: "mark" }] }], 20: [{ id: "t3", name: "More", requires: "t1", grants: [{}] }] },
});
const ids = (tiles) => tiles.map((t) => t.id ?? t.name);

describe("the spellbook", () => {
  it("has a general page and one for each specialization", () => {
    expect(bookPages(paladin()).map((p) => p.name)).toEqual(["General", "Defender", "Blood"]);
  });

  it("lays out the general page by level, with passives, and talent abilities apart", () => {
    const { rows, fromTalents } = pageTiles(paladin(), GENERAL);
    expect(rows.map((r) => r.level)).toEqual([1, 3]);
    expect(ids(rows[1].tiles)).toEqual(["heal", "Zeal"]);
    expect(rows[1].tiles[1].kind).toBe("passive");
    expect(rows[1].tiles[1].icon).toBe("fire");
    expect(ids(fromTalents)).toEqual(["ward"]);
  });

  it("agrees with what the game gives a general character", () => {
    const made = paladin();
    const onPage = pageTiles(made, GENERAL).rows.flatMap((r) => r.tiles).filter((t) => t.kind === "ability");
    expect(ids(onPage).sort()).toEqual(knownAbilities(made, 60, {}).map((a) => a.id).sort());
  });

  it("shows a specialization's abilities and its passive", () => {
    const { rows, fromTalents } = pageTiles(paladin(), "def");
    expect(rows.flatMap((r) => r.tiles).map((t) => t.kind)).toEqual(["specPassive", "ability"]);
    expect(fromTalents).toEqual([]);
  });

  it("adds an ability to the page it's asked on", () => {
    const made = paladin();
    const general = addAbility(made, GENERAL, 7, () => 0.1);
    const spec = addAbility(made, "blood", 11, () => 0.2);
    expect(general.level).toBe(7);
    expect(made.specializations[1].abilities).toEqual([spec.id]);
    expect(made.specializations.some((s) => s.abilities?.includes(general.id))).toBe(false);
  });

  it("makes a status along with a passive", () => {
    const made = paladin();
    const status = addPassive(made, GENERAL, 5, () => 0.3);
    expect(made.passives.at(-1)).toEqual({ status: status.id, level: 5 });
    expect(made.statuses).toContain(status);
    const specStatus = addPassive(made, "blood", 1, () => 0.4);
    expect(made.specializations[1].status).toBe(specStatus.id);
  });

  it("gives a specialization one passive", () => {
    const made = paladin();
    expect(roomForPassive(made, GENERAL)).toBe(true);
    expect(roomForPassive(made, "def")).toBe(false);
    expect(roomForPassive(made, "blood")).toBe(true);
  });

  it("duplicates an ability onto the same pages", () => {
    const made = paladin();
    const copy = duplicateAbility(made, "block", () => 0.5);
    expect(copy.name).toBe("Block copy");
    expect(copy.id).not.toBe("block");
    expect(made.specializations[0].abilities).toEqual(["block", copy.id]);
  });

  it("removes an ability from its specializations too", () => {
    const made = paladin();
    removeAbility(made, "block");
    expect(made.abilities.some((a) => a.id === "block")).toBe(false);
    expect(made.specializations[0].abilities).toBeUndefined();
  });

  it("moves an ability on and off a specialization", () => {
    const made = paladin();
    toggleOnSpec(made, "smite", "blood");
    expect(made.specializations[1].abilities).toEqual(["smite"]);
    toggleOnSpec(made, "smite", "blood");
    expect(made.specializations[1].abilities).toBeUndefined();
  });

  it("finds what uses a status, however deep", () => {
    const made = paladin();
    made.abilities[0].effects = [{ type: "status", status: "zeal", when: [{ holders: "mark" }] }];
    expect(usedBy(made, "zeal")).toEqual(["Smite", "passive"]);
    expect(usedBy(made, "mark")).toEqual(["Smite", "Marked"]);
    expect(usedBy(made, "bulwark")).toEqual(["Defender"]);
  });

  it("removes a passive's status only if nothing else uses it", () => {
    const made = paladin();
    removePassive(made, { kind: "passive", index: 0 });
    expect(made.passives).toBeUndefined();
    expect(made.statuses.some((s) => s.id === "zeal")).toBe(false);
    const kept = paladin();
    kept.abilities[0].effects = [{ status: "zeal" }];
    removePassive(kept, { kind: "passive", index: 0 });
    expect(kept.statuses.some((s) => s.id === "zeal")).toBe(true);
  });

  it("removes a talent and what required it", () => {
    const made = paladin();
    removeTalent(made, "15", "t1");
    expect(made.talents[15].map((t) => t.id)).toEqual(["t2"]);
    expect(made.talents[20][0].requires).toBeUndefined();
    removeTalent(made, "20", "t3");
    expect(made.talents[20]).toBeUndefined();
  });

  it("adds a talent ready to edit", () => {
    const made = {};
    const talent = addTalent(made, 25, () => 0.6);
    expect(made.talents[25]).toEqual([talent]);
    expect(talent.id).toBeTruthy();
  });

  it("describes a talent from what it grants", () => {
    const made = paladin();
    expect(talentIcon(made, made.talents[15][0])).toBe("shield");
    expect(talentSpecs(made, made.talents[15][0])).toEqual(["Defender"]);
    expect(talentSpecs(made, made.talents[15][1])).toEqual([]);
  });
});
