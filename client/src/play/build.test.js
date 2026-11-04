import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { allowedBuild, heldStatuses, knownAbilities, offeredTalents } from "./build.js";

const { class: made, cases } = JSON.parse(readFileSync(new URL("../../../game-server/internal/combat/testdata/build.json", import.meta.url)));

describe("a character's build", () => {
  for (const c of cases) {
    it(c.name, () => {
      const build = allowedBuild(made, c.build, c.level);
      expect(build).toEqual(c.want);
      expect(knownAbilities(made, c.level, build).map((a) => a.id).sort()).toEqual([...c.known].sort());
      expect(heldStatuses(made, c.level, build).sort()).toEqual([...c.held].sort());
    });
  }
  it("offers only what your spec and last pick allow", () => {
    expect(offeredTalents(made, "15", "blade", "").map((t) => t.id)).toEqual(["both", "gift"]);
    expect(offeredTalents(made, "20", "blade", "gift").map((t) => t.id)).toEqual(["free"]);
    expect(offeredTalents(made, "20", "blade", "both").map((t) => t.id)).toEqual(["after", "free"]);
  });
});
