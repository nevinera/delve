import * as THREE from "three";

// The sky, the way vanilla WoW drew it: a dome colored in bands from the horizon up, two layers of
// drifting clouds, and the sun with a glow round it. The dome follows the camera and draws behind
// everything.
//
// Fog fades things into the sky color behind them (SKY_COLOR_GLSL, without the clouds), so a far
// peak against the blue high up fades into that blue, not into the paler horizon. Fog is applied
// after three.js converts colors for the screen, so the sky's colors are worked out in sRGB, and
// the dome skips the conversion so the two match exactly.

// From the horizon up: the color at each height, as the sine of the angle above the horizon.
export const SKY_BANDS = [
  [0, 0xc4d8e6],
  [0.06, 0xaecbe6],
  [0.25, 0x7eaee6],
  [0.6, 0x5290dc],
  [1, 0x3f7bd2],
];
export const HORIZON = SKY_BANDS[0][1];
// The sun stays at about 2 in the afternoon, high in the south-southwest, until days turn.
export const SUN_DIR = new THREE.Vector3(-0.45, 1.15, 0.85).normalize();
const SUN = { color: 0xfff6e0, discDeg: 1.6, glow: 0xfff0c8 };
// Share of the sky clouds cover, their drift per second, and the heights (sine of the angle above
// the horizon) they thin out between, so they stay above most far peaks.
const CLOUDS = { cover: 0.52, wind: [0.012, 0.004], fade: [0.1, 0.3] };

// The clouds' shapes: five octaves of value noise, worked out once into a texture that repeats every
// `period` noise cells, rather than for every pixel of sky every frame.
const CLOUD_NOISE = { size: 512, period: 8, octaves: 5 };

const srgb = (hex) => `vec3(${[16, 8, 0].map((shift) => (((hex >> shift) & 255) / 255).toFixed(4)).join(", ")})`;
const f = (v) => v.toFixed(4);

// skyColor(dir): the sky's color looking along unit vector `dir`, in sRGB, without clouds or the
// sun's disc.
export const SKY_COLOR_GLSL = `
  vec3 skyColor(vec3 dir) {
    float up = max(dir.y, 0.0);
    vec3 color = ${srgb(SKY_BANDS[0][1])};
    ${SKY_BANDS.slice(1)
      .map(([stop, hex], i) => `color = mix(color, ${srgb(hex)}, smoothstep(${f(SKY_BANDS[i][0])}, ${f(stop)}, up));`)
      .join("\n    ")}
    float toSun = max(dot(dir, vec3(${f(SUN_DIR.x)}, ${f(SUN_DIR.y)}, ${f(SUN_DIR.z)})), 0.0);
    return mix(color, ${srgb(SUN.glow)}, 0.35 * pow(toSun, 24.0) + 0.25 * pow(toSun, 300.0));
  }
`;

const vertexShader = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 sunDir;
  uniform float sunCos;
  uniform float cover;
  uniform vec2 drift;
  uniform sampler2D clouds;
  varying vec3 vDir;

  ${SKY_COLOR_GLSL}

  void main() {
    vec3 dir = normalize(vDir);
    float up = max(dir.y, 0.0);
    vec3 color = skyColor(dir);
    float toSun = dot(dir, sunDir);

    // Clouds: two layers on a flat ceiling seen through the dome, drifting at different speeds,
    // thinning toward the horizon so they melt into the haze there.
    vec2 ceiling = dir.xz / (up + 0.08);
    float big = texture2D(clouds, (ceiling * 0.9 + drift) / ${f(CLOUD_NOISE.period)}).r;
    float small = texture2D(clouds, (ceiling * 2.6 + drift * 1.7 + vec2(40.0, 13.0)) / ${f(CLOUD_NOISE.period)}).r;
    float shape = big * 0.7 + small * 0.3;
    float cloud = smoothstep(1.0 - cover, 1.0 - cover + 0.25, shape) * smoothstep(${f(CLOUDS.fade[0])}, ${f(CLOUDS.fade[1])}, up);
    // Lit from the sun's side, shaded underneath.
    vec3 cloudColor = mix(vec3(0.91, 0.93, 0.95), vec3(1.0), 0.5 + 0.5 * toSun) * (0.95 + 0.05 * small);

    // The sun's disc shows through thin cloud only.
    float disc = smoothstep(sunCos - 0.00004, sunCos + 0.00004, toSun);
    color = mix(color, ${srgb(SUN.color)}, disc * (1.0 - cloud * 0.8));
    color = mix(color, cloudColor, cloud * 0.9);

    // Already sRGB, like the fog: no conversion.
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Fog takes the sky's color in the direction of each point, worked out from its position relative
// to the camera, turned from view space back to world space.
THREE.ShaderChunk.fog_pars_vertex = THREE.ShaderChunk.fog_pars_vertex.replace("varying float vFogDepth;", "varying float vFogDepth;\nvarying vec3 vFogDir;");
THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex.replace("#ifdef USE_FOG", "#ifdef USE_FOG\n\tvFogDir = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;");
THREE.ShaderChunk.fog_pars_fragment = THREE.ShaderChunk.fog_pars_fragment.replace("varying float vFogDepth;", `varying float vFogDepth;\nvarying vec3 vFogDir;\n${SKY_COLOR_GLSL}`);
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  "gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );",
  "gl_FragColor.rgb = mix( gl_FragColor.rgb, skyColor( normalize( vFogDir ) ), fogFactor );",
);

export class Sky {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        sunDir: { value: SUN_DIR },
        sunCos: { value: Math.cos(THREE.MathUtils.degToRad(SUN.discDeg)) },
        cover: { value: CLOUDS.cover },
        drift: { value: new THREE.Vector2() },
        clouds: { value: cloudTexture() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  // Centers the dome on the camera, just inside its far plane, and moves the clouds along.
  update(camera, seconds) {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(camera.far * 0.9);
    this.material.uniforms.drift.value.set(CLOUDS.wind[0] * seconds, CLOUDS.wind[1] * seconds);
  }
}

// Value noise on a lattice that wraps every `period` cells, so the texture tiles. Each octave doubles
// the frequency, and the period with it.
function cloudTexture() {
  const { size, period, octaves } = CLOUD_NOISE;
  const hash = (x, z, o) => {
    let h = (x * 374761393 + z * 668265263 + o * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const data = new Uint8Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let [sum, amp, cells] = [0, 0.5, period];
      for (let o = 0; o < octaves; o++) {
        const [x, z] = [(px / size) * cells, (py / size) * cells];
        const [ix, iz] = [Math.floor(x), Math.floor(z)];
        const [u, v] = [smooth(x - ix), smooth(z - iz)];
        const at = (dx, dz) => hash((ix + dx) % cells, (iz + dz) % cells, o);
        sum += amp * (at(0, 0) * (1 - u) * (1 - v) + at(1, 0) * u * (1 - v) + at(0, 1) * (1 - u) * v + at(1, 1) * u * v);
        amp *= 0.5;
        cells *= 2;
      }
      data[py * size + px] = Math.round(sum * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
