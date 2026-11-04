import * as THREE from "three";
import { shapeMaterial } from "./shapeMaterial.js";
import { fadeAt, shapeSpec } from "./shapeStock.js";

// Textures laid over the ground, following its slopes. A disc's texture runs x around it and y out
// from its middle, so scrolling x spins it. heightAt(x, z) gives the ground's height in the scene, or
// null where it doesn't know.

const STEP_FT = 1.5; // how far apart the points that follow the ground are
const LIFT_FT = 0.2; // over the ground, so it doesn't sink in

// A flat grid. at(u, w), each 0 to 1, gives a point's [x, z, texture x, texture y].
function grid(columns, rows, at) {
  const [positions, uvs, indices] = [[], [], []];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const [x, z, s, t] = at(column / columns, row / rows);
      positions.push(x, 0, z);
      uvs.push(s, t);
      if (row < rows && column < columns) {
        const here = row * (columns + 1) + column;
        indices.push(here, here + columns + 1, here + 1, here + 1, here + columns + 1, here + columns + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// A disc, a ring round it from `inner` (a share of its radius) out, or a slice from `start` for
// `sweep` radians. A whole disc's texture y starts at 0.5 in the middle, so only its rim fades.
export function discGeometry({ radius, inner = 0, start = 0, sweep = Math.PI * 2 }) {
  const columns = Math.min(96, Math.max(48, Math.ceil((sweep * radius) / STEP_FT)));
  const rows = Math.max(1, Math.ceil((radius * (1 - inner)) / STEP_FT));
  return grid(columns, rows, (u, w) => {
    const [r, angle] = [radius * (inner + (1 - inner) * w), start + sweep * u];
    return [r * Math.cos(angle), -r * Math.sin(angle), u, inner === 0 ? 0.5 + 0.5 * w : w];
  });
}

// A strip running along +z from where it's put, with its texture y across it.
export function stripGeometry({ length, width }) {
  return grid(Math.max(1, Math.ceil(width / STEP_FT)), Math.max(1, Math.ceil(length / STEP_FT)), (u, w) => [(u - 0.5) * width, w * length, w * length / 8, u]);
}

// Lays a geometry over the ground, for a mesh at `center` turned `turn` round y.
export function drape(geometry, center, heightAt, turn = 0) {
  const { position } = geometry.attributes;
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  for (let n = 0; n < position.count; n++) {
    const [x, z] = [position.getX(n), position.getZ(n)];
    const height = heightAt?.(center.x + x * cos + z * sin, center.z - x * sin + z * cos) ?? center.y;
    position.setY(n, height - center.y + LIFT_FT);
  }
  position.needsUpdate = true;
}

// Meshes over the ground in a group at `center`. Each of `parts` is { geometry, layer }.
export function drapedMeshes(parts, colors, center, heightAt, turn = 0) {
  const group = new THREE.Group();
  group.position.copy(center);
  const draped = center.clone(); // where it last followed the ground from
  const meshes = parts.map(({ geometry, layer }) => {
    drape(geometry, center, heightAt, turn);
    const mesh = new THREE.Mesh(geometry, shapeMaterial(layer, colors));
    mesh.rotation.y = turn;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    group.add(mesh);
    return { layer, mesh };
  });
  return {
    group,
    // Moves it, laying it over the ground again once it's gone far enough to matter.
    moveTo(place) {
      group.position.copy(place);
      if (draped.distanceTo(place) < STEP_FT / 3) return;
      draped.copy(place);
      for (const { mesh } of meshes) drape(mesh.geometry, place, heightAt, turn);
    },
    show(time, seen) {
      for (const { layer, mesh } of meshes) {
        mesh.material.uniforms.uTime.value = time;
        mesh.material.uniforms.uOpacity.value = layer.opacity * seen;
      }
    },
  };
}

// A stock decal (shapeStock.js) as a visual, at `at`. params can also set radius, in feet, and spin,
// in turns a second.
export function makeDecal(name, { colors, scale, params, at, ground }) {
  const spec = shapeSpec(name, params);
  const radius = (params?.radius ?? spec.radius) * scale;
  const parts = spec.layers.map((layer) => ({
    geometry: discGeometry({ radius, inner: layer.inner }),
    layer: params?.spin === undefined || params?.spin === null ? layer : { ...layer, scroll: [params.spin * layer.repeat[0], layer.scroll[1]] },
  }));
  // A stock decal with its own colors keeps them, unless the ability sets some.
  const shades = spec.colors && !(params?.colors?.length === 2) ? spec.colors : colors;
  const { group, show, moveTo } = drapedMeshes(parts, shades, at ?? new THREE.Vector3(), ground);
  return { group, length: spec.duration, moveTo, update: (u) => show(u * spec.duration, fadeAt(spec.fade, u)), sustain: show };
}
