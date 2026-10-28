// Turns a Cascadeur dump (script/cascadeur_dump.py) into posed.js poses, one per frame listed,
// the held weapon's path smoothed: its grip and tip low-passed from frame FROM (default 6) on, the
// tip kept from rising.
//
//   node script/cascadeur_pose.mjs tmp/sweep.json 6,10,14,18,22,26,30
import fs from "fs";
import * as THREE from "three";
import { characterMesh } from "../client/src/character/characterMesh.js";
import { resolveRecipe } from "../client/src/character/recipe.js";

const [file, framesArg] = process.argv.slice(2);
const J = JSON.parse(fs.readFileSync(file)).joints;
const CM = 30.48;
const rest = new Map(characterMesh(resolveRecipe({ height: 6, weapon: "greatsword" })).userData.joints.map((j) => [j.name, j]));
const mat = (n, f) => new THREE.Matrix4().fromArray(J[n].matrices[f].flat()).transpose();
const pos = (n, f) => new THREE.Vector3().setFromMatrixPosition(mat(n, f)).divideScalar(CM);
const rot = (n, f) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(mat(n, f)));
const col = (n, f, c) => new THREE.Vector3().setFromMatrixColumn(mat(n, f), c).normalize();
const r = (v, d = 2) => Number(v.toFixed(d)) + 0;
const arr = (v, d = 2) => `[${v.map((x) => r(x, d)).join(", ")}]`;
const N = J.root.matrices.length;

// The blade, smoothed: grip and tip (4ft out) low-passed, the tip's height kept falling.
const BLADE = 4;
const raw = [...Array(N).keys()].map((f) => ({ grip: pos("weapon_r", f), tip: pos("weapon_r", f).addScaledVector(col("weapon_r", f, 1), BLADE), front: col("weapon_r", f, 2) }));
const first = Number(process.env.FROM ?? 6);
const smooth = (key, sigma) =>
  raw.map((_, f) => {
    if (f <= first || f === N - 1) return raw[f][key].clone();
    const out = new THREE.Vector3();
    let w = 0;
    for (let g = first; g < N; g++) {
      const k = Math.exp(-((g - f) ** 2) / (2 * sigma * sigma));
      out.addScaledVector(raw[g][key], k);
      w += k;
    }
    return out.divideScalar(w);
  });
const grips = smooth("grip", 1.5);
const tips = smooth("tip", 2.5);
for (let f = first + 1; f < N; f++) tips[f].y = Math.min(tips[f].y, tips[f - 1].y);
const fronts = smooth("front", 1.5);

const euler = (q) => new THREE.Euler().setFromQuaternion(q, "XYZ").toArray().slice(0, 3);
const local = (n, f) => rot(rest.get(n).parent, f).invert().multiply(rot(n, f));
const bend = (top, mid, end, f) => {
  const [a, b, c] = [pos(top, f), pos(mid, f), pos(end, f)];
  const along = c.clone().sub(a).normalize();
  const side = b.clone().sub(a);
  return side.addScaledVector(along, -side.dot(along)).normalize().toArray();
};
const yawOf = (n, f) => {
  const z = new THREE.Vector3(0, 0, 1).applyQuaternion(rot(n, f));
  return Math.atan2(z.x, z.z);
};
const pelvisRest = new THREE.Vector3(...rest.get("pelvis").at);

for (const f of (framesArg ?? "6,10,14,18,22,26,30").split(",").map(Number)) {
  const bones = Object.fromEntries(["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head", "clavicle_l", "clavicle_r"].map((n) => [n, arr(euler(local(n, f)))]));
  const dir = tips[f].clone().sub(grips[f]).normalize();
  console.log(`// frame ${f}
{
  pelvis: ${arr(pos("pelvis", f).sub(pelvisRest).toArray())},
  bones: { ${Object.entries(bones).map(([k, v]) => `${k}: ${v}`).join(", ")} },
  reach: {
    hand_r: { item: "greatsword", grip: ${arr(grips[f].toArray())}, dir: ${arr(dir.toArray())}, front: ${arr(fronts[f].toArray())}, elbow: ${arr(bend("upperarm_r", "lowerarm_r", "hand_r", f))} },
    hand_l: { along: "hand_r", back: 0.5, elbow: ${arr(bend("upperarm_l", "lowerarm_l", "hand_l", f))} },
  },
  feet: { foot_l: ${arr(pos("foot_l", f).toArray())}, foot_r: ${arr(pos("foot_r", f).toArray())} },
  feetYaw: { foot_l: ${r(yawOf("foot_l", f))}, foot_r: ${r(yawOf("foot_r", f))} },
  knees: { foot_l: ${arr(bend("thigh_l", "calf_l", "foot_l", f))}, foot_r: ${arr(bend("thigh_r", "calf_r", "foot_r", f))} },
},`);
}
let run = 0;
const along = [0];
for (let f = first + 1; f < N; f++) along.push((run += tips[f].distanceTo(tips[f - 1])));
console.log("// tip travel by frame from", first, along.map((v) => r(v / run)).join(" "));
