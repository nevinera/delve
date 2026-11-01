import { describe, expect, it } from "vitest";
import { characterClips } from "./animations.js";
import { characterMesh } from "./characterMesh.js";
import { resolveRecipe } from "./recipe.js";

describe("slime", () => {
  it("sits on the ground as tall as the look, and squashes as it moves", () => {
    const mesh = characterMesh(resolveRecipe({ body: "slime", height: 3 }));
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox.min.y).toBeCloseTo(0, 1);
    expect(mesh.geometry.boundingBox.max.y).toBeCloseTo(3, 1);
    const death = characterClips(mesh, { clips: {} }).get("Death");
    expect(death.tracks.some((track) => track.name === "body.scale")).toBe(true);
  });
});
