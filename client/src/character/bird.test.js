import { describe, expect, it } from "vitest";
import { characterClips } from "./animations.js";
import { characterMesh } from "./characterMesh.js";
import { BIRDS, birdMesh, birdRoles } from "./bird.js";
import { resolveRecipe } from "./recipe.js";

describe("birdMesh", () => {
  it("stands on the ground as tall as the look", () => {
    for (const body of Object.keys(BIRDS)) {
      const { positions, bones } = birdMesh(resolveRecipe({ body, height: 4 }));
      const ys = positions.filter((_, i) => i % 3 === 1);
      expect(Math.min(...ys)).toBeGreaterThan(-0.1);
      expect(Math.min(...ys)).toBeLessThan(0.3);
      expect(Math.max(...ys)).toBeGreaterThan(3.8);
      expect(bones.find((b) => b.name === "mouth")).toBeTruthy();
    }
  });

  it("flies, unless it can't", () => {
    expect(birdRoles({ body: "eagle" }).fly).toBe("Fly_Loop");
    expect(birdRoles({ body: "penguin" }).fly).toBe(null);
    const clips = characterClips(characterMesh(resolveRecipe({ body: "crow" })), { clips: {} });
    expect(clips.get("Fly_Loop").tracks.some((track) => track.name === "wing_01_l.quaternion")).toBe(true);
  });
});
