import * as THREE from "three";

// The sky, the way vanilla WoW drew it: a dome colored in bands from the horizon up, two layers of
// drifting clouds, and the sun with a glow round it. The fog fades the land into the horizon band,
// so they're the same color. The dome follows the camera and draws behind everything.

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
const CLOUDS = { cover: 0.52, wind: [0.012, 0.004] }; // share of the sky they cover; drift per second

const vertexShader = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 bands[${SKY_BANDS.length}];
  uniform float stops[${SKY_BANDS.length}];
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 glowColor;
  uniform float sunCos;
  uniform float cover;
  uniform vec2 drift;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amp * noise(p);
      p = p * 2.03 + vec2(17.0, 9.0);
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float up = max(dir.y, 0.0);

    vec3 color = bands[0];
    for (int i = 1; i < ${SKY_BANDS.length}; i++) {
      color = mix(color, bands[i], smoothstep(stops[i - 1], stops[i], up));
    }

    // Glow round the sun, warming the sky near it.
    float toSun = dot(dir, sunDir);
    color = mix(color, glowColor, 0.35 * pow(max(toSun, 0.0), 24.0) + 0.25 * pow(max(toSun, 0.0), 300.0));

    // Clouds: two layers on a flat ceiling seen through the dome, drifting at different speeds,
    // thinning toward the horizon so they melt into the haze there.
    vec2 ceiling = dir.xz / (up + 0.08);
    float big = fbm(ceiling * 0.9 + drift);
    float small = fbm(ceiling * 2.6 + drift * 1.7 + vec2(40.0, 13.0));
    float shape = big * 0.7 + small * 0.3;
    float cloud = smoothstep(1.0 - cover, 1.0 - cover + 0.25, shape) * smoothstep(0.02, 0.2, up);
    // Lit from the sun's side, shaded underneath.
    vec3 cloudColor = mix(vec3(0.82, 0.85, 0.9), vec3(1.0), 0.5 + 0.5 * toSun) * (0.9 + 0.1 * small);

    // The sun's disc shows through thin cloud only.
    float disc = smoothstep(sunCos - 0.00004, sunCos + 0.00004, toSun);
    color = mix(color, sunColor, disc * (1.0 - cloud * 0.8));
    color = mix(color, cloudColor, cloud * 0.9);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Sky {
  constructor() {
    const linear = (hex) => new THREE.Color(hex);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        bands: { value: SKY_BANDS.map(([, hex]) => linear(hex)) },
        stops: { value: SKY_BANDS.map(([stop]) => stop) },
        sunDir: { value: SUN_DIR },
        sunColor: { value: linear(SUN.color) },
        glowColor: { value: linear(SUN.glow) },
        sunCos: { value: Math.cos(THREE.MathUtils.degToRad(SUN.discDeg)) },
        cover: { value: CLOUDS.cover },
        drift: { value: new THREE.Vector2() },
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
