import * as THREE from "three";
import { PATH_TILT } from "../world/dayNight.js";

// The sky, the way vanilla WoW drew it: a dome colored in bands from the horizon up, two layers of
// drifting clouds, and the sun with a glow round it. By night it darkens, the stars come out and
// wheel round the pole, and the moon shows its phase, lit from where the sun is. The dome follows
// the camera and draws behind everything.
//
// Fog fades things into the sky color behind them (SKY_COLOR_GLSL, without the clouds), so a far
// peak against the blue high up fades into that blue, not into the paler horizon. Fog is applied
// after three.js converts colors for the screen, so the sky's colors are worked out in sRGB, and
// the dome skips the conversion so the two match exactly.

// The heights (the sine of the angle above the horizon) the bands of color sit at.
const BAND_STOPS = [0, 0.06, 0.25, 0.6, 1];
// Each band's color by day, at sunrise and sunset, and by night.
const PALETTES = {
  day: [0xc4d8e6, 0xaecbe6, 0x7eaee6, 0x5290dc, 0x3f7bd2],
  twilight: [0xf2a36b, 0xd9988a, 0x8f86b5, 0x4f5f9e, 0x2f3f7a],
  night: [0x1d2840, 0x18223a, 0x131c31, 0x0f1729, 0x0c1322],
};
export const HORIZON = PALETTES.day[0];
const SUN = { color: 0xfff6e0, discDeg: 1.6, glow: 0xfff0c8, lowGlow: 0xff8a4a };
const MOON = { color: 0xeeeee2, discDeg: 2.2 };
// Share of the sky clouds cover, their drift per second, and the heights (sine of the angle above
// the horizon) they thin out between, so they stay above most far peaks.
const CLOUDS = { cover: 0.52, wind: [0.012, 0.004], fade: [0.1, 0.3] };
// Stars: cells across a radian of sky, and the share of cells holding one.
const STARS = { cells: 180, share: 0.005 };

// The clouds' shapes: five octaves of value noise, worked out once into a texture that repeats every
// `period` noise cells, rather than for every pixel of sky every frame.
const CLOUD_NOISE = { size: 512, period: 8, octaves: 5 };

const rgb = (hex) => [16, 8, 0].map((shift) => ((hex >> shift) & 255) / 255);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smoothstep = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const f = (v) => v.toFixed(4);
const srgb = (hex) => `vec3(${rgb(hex).map(f).join(", ")})`;

// What the sky's colors and the scene's lights are at a moment of dayNight.js skyAt(), all sRGB.
export function skyLook({ sunDir, moonDir, moonAge }) {
  const sunY = sunDir[1];
  const daylight = smoothstep(-0.12, 0.15, sunY);
  const twilight = 1 - smoothstep(0, 0.3, Math.abs(sunY + 0.02));
  const bands = PALETTES.day.map((day, i) => mix(mix(rgb(PALETTES.night[i]), rgb(day), daylight), rgb(PALETTES.twilight[i]), twilight * 0.75));
  const sunUp = smoothstep(-0.03, 0.12, sunY);
  const moonUp = smoothstep(-0.03, 0.12, moonDir[1]);
  const fullness = (1 - Math.cos(2 * Math.PI * moonAge)) / 2;
  const warm = smoothstep(0.05, 0.4, sunY);
  return {
    daylight,
    bands,
    glow: mix(rgb(SUN.lowGlow), rgb(SUN.glow), warm),
    // Near the sun, right round it, and spread wide along the horizon at sunrise and sunset.
    glowAmount: [0.35 * smoothstep(-0.15, 0.02, sunY), 0.25 * sunUp, 0.3 * twilight],
    sunUp,
    stars: 1 - smoothstep(-0.2, -0.02, sunY),
    clouds: mix(mix([0.13, 0.15, 0.21], [1, 1, 1], daylight), [1, 0.72, 0.6], twilight * 0.6),
    sun: { color: mix(rgb(0xff9a5c), rgb(0xfff6e8), warm), intensity: 1.6 * sunUp },
    moon: { color: rgb(0xa8b8e0), intensity: 0.4 * fullness * moonUp * (1 - daylight) },
    sky: { color: mix(mix(rgb(0x56638a), rgb(0xdde8ff), daylight), rgb(0xe8b8a0), twilight * 0.4), intensity: 0.35 + 0.75 * daylight },
    ground: mix(rgb(0x1c2224), rgb(0x445533), daylight),
  };
}

// The uniforms the sky and fog share. Their values are plain objects, not three.js vectors, so the
// copies three.js makes for each material still point at them, and changing them here changes
// every material's fog at once.
const vec = () => ({ x: 0, y: 0, z: 0 });
const SKY_UNIFORMS = {
  ...Object.fromEntries(BAND_STOPS.map((_, i) => [`skyBand${i}`, { value: vec() }])),
  skySunDir: { value: vec() },
  skyGlow: { value: vec() },
  skyGlowAmount: { value: vec() },
  skyLight: { value: { x: 1, y: 1, z: 1 } }, // how lit unlit things should look, like waterfall mist
};
for (const lib of Object.values(THREE.ShaderLib)) if (lib.uniforms.fogColor) Object.assign(lib.uniforms, SKY_UNIFORMS);
Object.assign(THREE.UniformsLib.fog, SKY_UNIFORMS);

const setVec = (target, [x, y, z]) => Object.assign(target, { x, y, z });

// skyColor(dir): the sky's color looking along unit vector `dir`, in sRGB, without clouds, stars,
// the sun's disc or the moon.
export const SKY_COLOR_GLSL = `
  ${Object.keys(SKY_UNIFORMS).map((name) => `uniform vec3 ${name};`).join("\n  ")}
  vec3 skyColor(vec3 dir) {
    float up = max(dir.y, 0.0);
    vec3 color = skyBand0;
    ${BAND_STOPS.slice(1)
      .map((stop, i) => `color = mix(color, skyBand${i + 1}, smoothstep(${f(BAND_STOPS[i])}, ${f(stop)}, up));`)
      .join("\n    ")}
    float toSun = max(dot(dir, skySunDir), 0.0);
    float glow = skyGlowAmount.x * pow(toSun, 24.0) + skyGlowAmount.y * pow(toSun, 300.0) + skyGlowAmount.z * pow(toSun, 3.0) * (1.0 - smoothstep(0.0, 0.4, up));
    return mix(color, skyGlow, min(glow, 1.0));
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
  uniform float sunCos;
  uniform float sunUp;
  uniform vec3 moonDir;
  uniform float moonCos;
  uniform float stars;
  uniform mat3 starTurn;
  uniform vec3 cloudLight;
  uniform float cover;
  uniform vec2 drift;
  uniform sampler2D clouds;
  varying vec3 vDir;

  ${SKY_COLOR_GLSL}

  float hash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 dir = normalize(vDir);
    float up = max(dir.y, 0.0);
    vec3 color = skyColor(dir);
    float toSun = dot(dir, skySunDir);
    float above = smoothstep(-0.02, 0.0, dir.y);

    // Clouds: two layers on a flat ceiling seen through the dome, drifting at different speeds,
    // thinning toward the horizon so they melt into the haze there.
    vec2 ceiling = dir.xz / (up + 0.08);
    float big = texture2D(clouds, (ceiling * 0.9 + drift) / ${f(CLOUD_NOISE.period)}).r;
    float small = texture2D(clouds, (ceiling * 2.6 + drift * 1.7 + vec2(40.0, 13.0)) / ${f(CLOUD_NOISE.period)}).r;
    float shape = big * 0.7 + small * 0.3;
    float cloud = smoothstep(1.0 - cover, 1.0 - cover + 0.25, shape) * smoothstep(${f(CLOUDS.fade[0])}, ${f(CLOUDS.fade[1])}, up);
    // Lit from the sun's side, shaded underneath, and dimmed and tinted with the light.
    vec3 cloudColor = mix(vec3(0.91, 0.93, 0.95), vec3(1.0), 0.5 + 0.5 * max(toSun, 0.0)) * (0.95 + 0.05 * small) * cloudLight;

    // Stars, one at a random spot in some cells of a grid turning with the sky.
    vec3 sky = starTurn * dir * ${f(STARS.cells)};
    vec3 cell = floor(sky);
    float pick = hash(cell);
    if (pick > ${f(1 - STARS.share)}) {
      vec3 spot = cell + 0.25 + 0.5 * vec3(hash(cell + 7.1), hash(cell + 3.7), hash(cell + 5.3));
      float bright = 0.35 + 0.65 * hash(cell + 1.9);
      color += vec3(0.85, 0.88, 1.0) * bright * smoothstep(0.32, 0.05, length(sky - spot)) * stars * smoothstep(0.0, 0.12, up);
    }

    // The moon: a lit ball, so the side facing the sun shows; at night the rest hides the stars.
    float toMoon = dot(dir, moonDir);
    if (toMoon > moonCos) {
      vec3 across = (dir - moonDir * toMoon) / sqrt(1.0 - moonCos * moonCos);
      vec3 normal = across - moonDir * sqrt(max(0.0, 1.0 - dot(across, across)));
      float lit = smoothstep(-0.04, 0.06, dot(normal, skySunDir));
      vec3 moon = mix(color * (1.0 - 0.1 * stars), ${srgb(MOON.color)}, lit * (0.55 + 0.45 * stars));
      color = mix(color, moon, smoothstep(moonCos, moonCos + 0.00003, toMoon) * above);
    }
    color += vec3(0.55, 0.6, 0.72) * 0.12 * pow(max(toMoon, 0.0), 300.0) * stars * above;

    // The sun's disc shows through thin cloud only.
    float disc = smoothstep(sunCos - 0.00004, sunCos + 0.00004, toSun) * sunUp;
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
        ...SKY_UNIFORMS,
        sunCos: { value: Math.cos(THREE.MathUtils.degToRad(SUN.discDeg)) },
        sunUp: { value: 1 },
        moonDir: { value: new THREE.Vector3() },
        moonCos: { value: Math.cos(THREE.MathUtils.degToRad(MOON.discDeg)) },
        stars: { value: 0 },
        starTurn: { value: new THREE.Matrix3() },
        cloudLight: { value: new THREE.Vector3(1, 1, 1) },
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

  // Sets the sky for a moment of dayNight.js skyAt(), and answers its skyLook().
  setTime(at) {
    const look = skyLook(at);
    const u = this.material.uniforms;
    look.bands.forEach((color, i) => setVec(SKY_UNIFORMS[`skyBand${i}`].value, color));
    setVec(SKY_UNIFORMS.skySunDir.value, at.sunDir);
    setVec(SKY_UNIFORMS.skyGlow.value, look.glow);
    setVec(SKY_UNIFORMS.skyGlowAmount.value, look.glowAmount);
    setVec(SKY_UNIFORMS.skyLight.value, look.sky.color.map((c) => Math.min(1, c * look.sky.intensity)));
    u.sunUp.value = look.sunUp;
    u.moonDir.value.fromArray(at.moonDir);
    u.stars.value = look.stars;
    // Stars turn round the pole the sun's path circles, the way the sun does.
    const pole = new THREE.Vector3(0, -Math.sin(PATH_TILT), Math.cos(PATH_TILT));
    u.starTurn.value.setFromMatrix4(new THREE.Matrix4().makeRotationAxis(pole, -at.turn));
    u.cloudLight.value.fromArray(look.clouds);
    return look;
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
