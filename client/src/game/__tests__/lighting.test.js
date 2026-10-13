import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { SceneLighting, FAR_FEET } from "../lighting.js";

describe("SceneLighting", () => {
  it("fades by distance along the ground from one center every material shares", () => {
    const scene = new THREE.Scene();
    const lighting = new SceneLighting(scene);
    expect(THREE.ShaderChunk.fog_vertex).toContain("fogCenter");
    const { lambert, basic, sprite } = THREE.ShaderLib;
    expect(lambert.uniforms.fogCenter.value).toBe(sprite.uniforms.fogCenter.value);
    expect(THREE.UniformsUtils.clone(basic.uniforms).fogCenter.value).toBe(lambert.uniforms.fogCenter.value);

    lighting.setCenter(12, -34);
    expect(lambert.uniforms.fogCenter.value).toEqual({ x: 12, y: -34 });
    expect(scene.fog.far).toBe(FAR_FEET);
  });

  it("fades to black under torchlight, and to the sky by day", () => {
    const scene = new THREE.Scene();
    const lighting = new SceneLighting(scene);
    lighting.setMode("torchlight");
    expect(scene.fog.color.getHex()).toBe(0x000000);
    expect(scene.background.getHex()).toBe(0x000000);
    lighting.setMode(undefined);
    expect(lighting.mode).toBe("daylight");
    expect(scene.fog.color.getHex()).toBe(scene.background.getHex());
    expect(scene.fog.color.getHex()).not.toBe(0x000000);
  });
});
