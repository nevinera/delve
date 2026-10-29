import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { cameraPlace, loadPlace, placeCamera, placeKey, savePlace } from "./place.js";

describe("place", () => {
  beforeEach(() => {
    const items = new Map();
    globalThis.localStorage = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v) };
  });

  it("keeps each world's place under its repo, or its name", () => {
    expect(placeKey({ info: { name: "Vale" } }, { repo: "Me/Vale" })).toBe("repo:me/vale");
    expect(placeKey({ info: { name: "Vale" } }, null)).toBe("name:Vale");
    savePlace("repo:me/vale", { step: "detail" });
    expect(loadPlace("repo:me/vale")).toMatchObject({ step: "detail" });
    expect(loadPlace("repo:me/other")).toBeNull();
  });

  it("forgets the worlds left longest ago, past twenty", () => {
    for (let i = 0; i < 25; i++) savePlace(`name:${i}`, { step: "tiles", at: 0 });
    expect(loadPlace("name:24")).not.toBeNull();
    expect(Object.keys(JSON.parse(localStorage.getItem("delve3d-editor-places")))).toHaveLength(20);
  });

  it("puts a camera back where it was, in a view moved off the continent's origin", () => {
    const camera = new THREE.PerspectiveCamera();
    const controls = { target: new THREE.Vector3(10, 5, 20), update() {} };
    camera.position.set(100, 50, 200);
    const place = cameraPlace(camera, controls, [1000, 2000]);
    expect(place).toEqual({ position: [1100, 50, 2200], target: [1010, 5, 2020] });
    placeCamera(place, camera, controls, [1500, 2500]);
    expect(camera.position.toArray()).toEqual([-400, 50, -300]);
    expect(controls.target.toArray()).toEqual([-490, 5, -480]);
  });
});
