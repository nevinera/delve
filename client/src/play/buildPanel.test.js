import { describe, expect, it } from "vitest";
import { iconOf, talentRows } from "./buildPanel.js";

const made = {
  abilities: [{ id: "smite", icon: "sun" }],
  statuses: [{ id: "sshield", icon: "shield" }, { id: "sdef", icon: "tower" }],
  specializations: [{ id: "defender", status: "sdef", abilities: ["smite"] }, { id: "blood" }],
  talents: {
    15: [
      { id: "a", grants: [{ status: "sshield" }] },
      { id: "b", grants: [{ spec: "defender", ability: "smite" }] },
    ],
    20: [
      { id: "c", requires: "a", grants: [{ status: "sshield" }] },
      { id: "d", grants: [{ status: "sshield" }] },
    ],
  },
};

describe("the talent window", () => {
  it("shows each talent's icon, or what it gives you", () => {
    expect(iconOf(made, { icon: "own" })).toBe("own");
    expect(iconOf(made, made.talents[15][0])).toBe("shield");
    expect(iconOf(made, made.talents[15][1])).toBe("sun");
    expect(iconOf(made, made.specializations[0])).toBe("tower");
    expect(iconOf(made, made.specializations[1])).toBe(null);
  });

  it("says which talents are yours to pick, picked, waiting on another, or past your level", () => {
    const rows = talentRows(made, 15, { specialization: "defender", talents: { 15: "b" } });
    expect(rows.map((row) => [row.tier, row.talents.map((t) => `${t.talent.id}:${t.state}`)])).toEqual([
      ["15", ["a:open", "b:picked"]],
      ["20", ["c:locked", "d:locked"]],
    ]);
    const later = talentRows(made, 20, { specialization: "defender", talents: { 15: "b" } });
    expect(later[1].talents.map((t) => `${t.talent.id}:${t.state}`)).toEqual(["c:needs", "d:open"]);
    expect(later[1].talents[0].needs).toBe("a");
  });

  it("leaves out talents another specialization's", () => {
    const rows = talentRows(made, 20, { specialization: "blood", talents: {} });
    expect(rows[0].talents.map((t) => t.talent.id)).toEqual(["a"]);
  });
});
