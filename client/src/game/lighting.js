// A map's lighting (docs/schema/map.md's `lighting`), shared by the game
// scene and the map editor's walk preview: "daylight" is ambient + sun under
// a distance haze, "torchlight" a light carried by the player, fading to
// black. Both cap how far the player sees at FAR_FEET.
//
// The fade is measured along the ground from the player, not (as three.js's
// own fog is) by depth from the camera: the camera orbits well back from the
// player, and depth is shortest toward the sides of the view, so camera fog
// left the far edges of a map in plain sight there. installPlayerFog
// rewrites three's fog chunks to use that distance, from a center every
// fogging material shares (setCenter).
import * as THREE from "three";

export const NEAR_FEET = 60; // the fade starts here
export const FAR_FEET = 120; // and is complete here

const DAYLIGHT_AMBIENT_INTENSITY = 0.5;
const DAYLIGHT_SUN_INTENSITY = 1.4;
const DAYLIGHT_BG_COLOR = 0x14181c;

// three.js's point-light attenuation, with decay 0, is a smooth S-curve that
// sits near 1 for most of `distance` and eases to exactly 0 at it - so
// TORCH_INTENSITY is directly the near-field brightness. The fog fades
// unlit materials (and sprites) to the same black by the same distance.
const TORCH_HEIGHT = 6; // feet above the ground
const TORCH_INTENSITY = 3;
const TORCH_DECAY = 0;

// The fog's center, in world x/z. A plain object, not a THREE.Vector2:
// three.js copies Vector2 uniforms into each material, but shares plain
// values, so every material reads this one.
const fogCenter = { x: 0, y: 0 };
let installed = false;

export function installPlayerFog() {
  if (installed) return;
  installed = true;
  for (const shader of Object.values(THREE.ShaderLib)) {
    if (shader.uniforms?.fogNear) shader.uniforms.fogCenter = { value: fogCenter };
  }
  // The distance is taken per pixel, not per vertex: the ground is one
  // quad whose corners can all be past FAR_FEET.
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec2 vFogGround;
#endif
`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogGround = (inverse(viewMatrix) * mvPosition).xz;
#endif
`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform vec2 fogCenter;
  varying vec2 vFogGround;
#endif
`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogFactor = smoothstep(fogNear, fogFar, distance(vFogGround, fogCenter));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;
}

export class SceneLighting {
  constructor(scene) {
    installPlayerFog();
    this._scene = scene;
    this._ambient = new THREE.AmbientLight(0xffffff, DAYLIGHT_AMBIENT_INTENSITY);
    this._sun = new THREE.DirectionalLight(0xffffff, DAYLIGHT_SUN_INTENSITY);
    this._sun.position.set(5, 10, 5);
    this._torch = new THREE.PointLight(0xfff2d0, TORCH_INTENSITY, FAR_FEET, TORCH_DECAY);
    this._fog = new THREE.Fog(DAYLIGHT_BG_COLOR, NEAR_FEET, FAR_FEET);
    scene.add(this._ambient, this._sun, this._torch);
    scene.fog = this._fog;
    this.setMode("daylight");
  }

  // "daylight" | "torchlight"; anything else is daylight.
  setMode(mode) {
    this.mode = mode === "torchlight" ? "torchlight" : "daylight";
    const torch = this.mode === "torchlight";
    const color = torch ? 0x000000 : DAYLIGHT_BG_COLOR;
    this._ambient.intensity = torch ? 0 : DAYLIGHT_AMBIENT_INTENSITY;
    this._sun.visible = !torch;
    this._torch.visible = torch;
    this._fog.color.set(color);
    this._scene.background = new THREE.Color(color);
  }

  // Where the player stands, in world x/z: the torch follows it, and the
  // fade is measured from it. Call before each render.
  setCenter(wx, wz) {
    this._torch.position.set(wx, TORCH_HEIGHT, wz);
    fogCenter.x = wx;
    fogCenter.y = wz;
  }
}
