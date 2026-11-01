import * as THREE from "three";

// What the bodies built here rather than by body.js share: small vector helpers, joints mirrored
// left to right, and clips made in code from a pose at each moment, rather than baked.
//
// Bones in these bodies rest unturned, so a clip's turns are about the continent's axes: about x,
// positive tips a bone pointing up forward and one pointing forward down; about y, positive turns
// +x toward -z; about z, positive turns +x toward +y.

export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const mul = (a, k) => a.map((v) => v * k);
export const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const shade = (rgb, f) => rgb.map((v) => Math.min(1, v * f));
export const TAU = Math.PI * 2;
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// Rises to 1 from `a` to `b`, holds, and falls back to 0 from `c` to `d`, eased, u from 0 to 1.
export const hump = (u, a, b, c, d) => ease((u - a) / (b - a)) * (1 - ease((u - c) / (d - c)));

// Joints as [name, parent, at] to [{ name, parent, at }], parents first, scaled by `s`, each
// ending in _l mirrored to _r.
export function mirrored(joints, s) {
  const out = [];
  for (const [name, parent, at] of joints) {
    out.push({ name, parent, at: mul(at, s) });
    if (name.endsWith("_l")) out.push({ name: name.replace(/_l$/, "_r"), parent: parent.replace(/_l$/, "_r"), at: mul([-at[0], at[1], at[2]], s) });
  }
  return out;
}

// Clips are sampled this many times a second.
const FPS = 30;

// A clip from pose(t), t in seconds from 0 to `duration`, giving { bones: { name: [x, y, z] }
// (turns, radians), pelvis: [x, y, z] (how far the pelvis moves, in the body's own feet, scaled by
// the mesh's userData.scale), scale: { name: [x, y, z] } (how far each bone is stretched, 1 as it
// rests) }. `speed`: how fast it moves along the ground, kept in userData.
export function sampled(mesh, name, duration, pose, speed = 0) {
  const s = mesh.userData.scale;
  const frames = Math.max(2, Math.round(duration * FPS) + 1);
  const times = Float32Array.from({ length: frames }, (_, f) => (f / (frames - 1)) * duration);
  const poses = [...times].map((t) => pose(t));
  const names = [...new Set(poses.flatMap((q) => Object.keys(q.bones ?? {})))].filter((bone) => mesh.skeleton.getBoneByName(bone));
  const euler = new THREE.Euler();
  const turn = new THREE.Quaternion();
  const tracks = names.map((bone) => {
    const values = new Float32Array(frames * 4);
    poses.forEach((q, f) => turn.setFromEuler(euler.set(...(q.bones[bone] ?? [0, 0, 0]))).toArray(values, f * 4));
    return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
  });
  const stretched = [...new Set(poses.flatMap((q) => Object.keys(q.scale ?? {})))].filter((bone) => mesh.skeleton.getBoneByName(bone));
  for (const bone of stretched) {
    const values = new Float32Array(frames * 3);
    poses.forEach((q, f) => values.set(q.scale?.[bone] ?? [1, 1, 1], f * 3));
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.scale`, times, values));
  }
  const rest = mesh.skeleton.getBoneByName("pelvis").position;
  const positions = new Float32Array(frames * 3);
  poses.forEach((q, f) => [0, 1, 2].forEach((k) => (positions[f * 3 + k] = rest.getComponent(k) + (q.pelvis?.[k] ?? 0) * s)));
  tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, positions));
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData = { speed };
  return clip;
}

// A mesh (as bodyMesh gives it, with its bones) with part of another mesh copied onto it: the
// faces whose corners are carried only by the source's bones in `map` and partly by one in `core`,
// each corner moved by move(p), and carried by the bones `map` names in its place. A bone `map`
// names that the target hasn't is added, at its source bone's place moved, under the bone `map`
// names for its source's parent.
export function graft(target, source, map, core, move) {
  const names = source.bones.map((b) => b.name);
  const index = new Map(target.bones.map((b, i) => [b.name, i]));
  const bones = [...target.bones];
  for (const b of source.bones) {
    if (!(b.name in map) || index.has(map[b.name])) continue;
    index.set(map[b.name], bones.length);
    bones.push({ name: map[b.name], parent: map[b.parent], at: move(b.at) });
  }
  const carried = (v, set) => [0, 1, 2, 3].every((n) => !source.skinWeight[v * 4 + n] || set(names[source.skinIndex[v * 4 + n]]));
  const kept = [];
  for (let v = 0; v < source.positions.length / 3; v += 3) {
    const corners = [v, v + 1, v + 2];
    if (corners.every((c) => carried(c, (name) => name in map)) && corners.some((c) => !carried(c, (name) => !core.includes(name)))) kept.push(...corners);
  }
  const join = (a, b, size, f) => {
    const out = new a.constructor(a.length + kept.length * size);
    out.set(a);
    kept.forEach((v, i) => f(v, out, a.length + i * size));
    return out;
  };
  return {
    ...target,
    positions: join(target.positions, source.positions, 3, (v, out, at) => out.set(move([...source.positions.slice(v * 3, v * 3 + 3)]), at)),
    colors: join(target.colors, source.colors, 3, (v, out, at) => out.set(source.colors.slice(v * 3, v * 3 + 3), at)),
    skinIndex: join(target.skinIndex, source.skinIndex, 4, (v, out, at) => out.set([0, 1, 2, 3].map((n) => (source.skinWeight[v * 4 + n] ? index.get(map[names[source.skinIndex[v * 4 + n]]]) : 0)), at)),
    skinWeight: join(target.skinWeight, source.skinWeight, 4, (v, out, at) => out.set(source.skinWeight.slice(v * 4, v * 4 + 4), at)),
    mail: join(target.mail, source.mail, 1, (v, out, at) => (out[at] = source.mail[v])),
    bones,
  };
}

// p turned by `angle` about the vertical line through `about`.
export const turnedY = (p, about, angle) => {
  const [x, z] = [p[0] - about[0], p[2] - about[2]];
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [about[0] + x * c + z * s, p[1], about[2] - x * s + z * c];
};
