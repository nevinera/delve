// A minimal, standalone Three.js "walk it" preview for the map editor: pan/
// zoom/pitch the camera and walk a single controllable token around the
// current draft map, colliding with its barriers, alongside every NPC unit
// following its own configured patrol/wander route - no server, no
// abilities/combat, just movement + collision, to judge scale/perspective
// (see the map editor plan's Phase 2). Reuses buildWall/buildCircleBarrier/
// createPlayerToken/createNpcToken from game/scene.js as-is (no changes needed to their
// signatures to serve this second caller) and
// orbitFromDrag/clampZoom/resolveBarrierCollisions (already standalone
// exports), plus simulateMovement.js's initSimUnit/tickSimUnit (the same
// patrol/wander state machine Simulate Units mode already uses) for NPC
// motion. Everything else here (turning, camera-relative movement, camera
// positioning) is small enough to duplicate rather than thread through
// scene.js's SceneManager, which is tightly coupled to live network state -
// same reasoning as editor/previewScene.js's own header comment.
import * as THREE from "three";
import {buildWall, buildCircleBarrier, createPlayerToken, createNpcToken, orbitFromDrag, clampZoom} from "../game/scene.js";
import {resolveBarrierCollisions} from "../game/collision.js";
import {loadSvgToCanvas} from "../game/svgRaster.js";
import {BASE_MOB_SPEED, initSimUnit, tickSimUnit} from "./simulateMovement.js";

const CAM_BACK = 45;
const CAM_HEIGHT = 50;
const CAM_RADIUS = Math.sqrt(CAM_BACK * CAM_BACK + CAM_HEIGHT * CAM_HEIGHT);
const CAM_LOOK_AHEAD = 10;
const PLAYER_SPEED = 20; // feet/sec - matches game/scene.js's BASE_PLAYER_SPEED
const TOKEN_RADIUS = 2.2; // matches game/scene.js's TOKEN_RADIUS
const DEFAULT_NPC_RADIUS = 2; // used only if a unit's type has no real tokenRadius
const TURN_RATE = (120 * Math.PI) / 180; // radians/sec - matches game/scene.js's TURN_RATE (A/D)

// Two lighting modes, toggled live (see setLightingMode) rather than
// re-loading the scene - both cap view distance, by different means, chosen
// per mode's own feel: "daylight" keeps the original flat ambient+
// directional look, capped by linear fog (a uniform distance haze, the
// right fit for an ordinarily-lit scene); "torchlight" is a player-attached
// point light for an "underground" feel instead - a lit radius that moves
// with the player reads differently than a uniform fade, even though both
// can reach true black by a similar far distance. Everything (lights, fog)
// is created once in the constructor and switched via `.visible`/
// `.intensity`/`scene.fog`, so toggling live has no load/rebuild cost.
//
// three.js's own point-light distance-attenuation shader is:
//   falloff = 1 / max(pow(lightDistance, decay), 0.01)
//   if (distance > 0) falloff *= (1 - (lightDistance / distance)^4)^2
// That second line is a smooth S-curve, independent of decay: it sits near
// 1 for most of the range then eases down to *exactly* 0 right at
// `distance` (three.js's PointLight `distance` param) - a real cutoff, not
// an asymptote. `decay: 0` makes that S-curve the *only* shaping factor (no
// extra inverse-square dimming stacked on top near the light, which is what
// an earlier decay:2 attempt needed a huge intensity to compensate for) -
// closest to a flat-then-fade shape without losing the smooth edge a hard
// cutoff alone would have. Every material here (buildWall/createPlayerToken/
// createNpcToken's MeshLambertMaterial) already responds to scene lighting,
// so this needs no material changes, only the lights.
const TORCH_RADIUS_FEET = 120; // distance at which the light's contribution reaches exactly zero
const TORCH_HEIGHT = 6; // feet above the ground, torch-like
const TORCH_INTENSITY = 3; // decay:0 means this is ~directly the near-field brightness, not distance-squared-attenuated - no three-digit candela math needed
const TORCH_DECAY = 0; // S-curve cutoff only, no additional inverse-power falloff
const DAYLIGHT_AMBIENT_INTENSITY = 0.5;
const DAYLIGHT_SUN_INTENSITY = 1.4;
const DAYLIGHT_BG_COLOR = 0x14181c;
// Linear fog, so daylight caps view distance too - same near/far as
// torchlight's own radius, for a comparable "how far can I see" between the
// two modes even though the shape differs (torchlight's S-curve vs. fog's
// straight line). Unlike torchlight, this fades everything toward the sky
// color uniformly regardless of lighting - not "underground," but distance
// haze, which is the right fit for an ordinarily-lit outdoor/daylight scene.
// These two are distances *from the player token* - THREE.Fog itself only
// knows distance from the camera, which orbits the player at CAM_RADIUS
// (~67ft, scaled by zoom) rather than sitting at the token, so fog.near/far
// are recomputed every frame in _updateFog as camDistance + these values -
// using these constants directly as fog.near/far (the first attempt) made
// the fade start almost immediately, since the camera itself already starts
// most of the way to a 60ft "near" distance.
const DAYLIGHT_FOG_NEAR_FEET = 60;
const DAYLIGHT_FOG_FAR_FEET = 120;

// Real client scheme (see App.jsx's KEY_MAP): W/S walk forward/back, Q/E
// strafe, A/D turn the view - not strafe, despite how that reads on a WASD
// keyboard. Arrow keys mirror W/S/A/D (forward/back/turn) since there's no
// natural arrow-key equivalent of Q/E strafing.
const MOVEMENT_KEYS = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "backward", ArrowDown: "backward",
  KeyQ: "strafe_left",
  KeyE: "strafe_right",
};
const TURN_KEYS = {
  KeyA: "turn_left", ArrowLeft: "turn_left",
  KeyD: "turn_right", ArrowRight: "turn_right",
};
// Editor-only convenience (the real client has no equivalent) - holding
// either Shift key doubles walking speed, for covering a big map quickly.
const SPRINT_KEYS = {ShiftLeft: "sprint", ShiftRight: "sprint"};
const SPRINT_MULTIPLIER = 2;

// Feet (x, y) -> Three.js world direction, matching this module's own
// _toWorld (world Z = height/2 - feetY, world X = feetX - width/2) - used to
// turn an NPC's simulated movement direction into a facing angle.
function facingToward(x1, z1, x2, z2) {
  return Math.atan2(x2 - x1, -(z2 - z1));
}

export class MapPreviewScene {
  constructor(canvas) {
    this.canvas = canvas;
    this._pressedKeys = new Set();
    this._camFacing = 0;
    this._camPitch = Math.atan2(CAM_HEIGHT, CAM_BACK);
    this._camZoom = 1.0;
    this._playerX = 0;
    this._playerY = 0;
    this._barriers = [];
    this._collisionBarriers = []; // barriers + line connections, see loadMap
    this._feetDimensions = {width: 0, height: 0};
    this._npcs = []; // {unit, sim, token, radius}

    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.scene = new THREE.Scene();
    // Daylight's ambient+sun; torchlight's player-attached point light (see
    // setLightingMode) - both created up front and switched via visibility/
    // intensity, so toggling live has no load/rebuild cost.
    this._ambient = new THREE.AmbientLight(0xffffff, DAYLIGHT_AMBIENT_INTENSITY);
    this.scene.add(this._ambient);
    this._sun = new THREE.DirectionalLight(0xffffff, DAYLIGHT_SUN_INTENSITY);
    this._sun.position.set(5, 10, 5);
    this.scene.add(this._sun);
    // Follows the player every frame, see _updatePlayerLight.
    this._torchLight = new THREE.PointLight(0xfff2d0, TORCH_INTENSITY, TORCH_RADIUS_FEET, TORCH_DECAY);
    this.scene.add(this._torchLight);
    // Daylight-only fog - kept as a standalone object (not reallocated on
    // every toggle) and swapped onto scene.fog by setLightingMode.
    this._daylightFog = new THREE.Fog(DAYLIGHT_BG_COLOR, DAYLIGHT_FOG_NEAR_FEET, DAYLIGHT_FOG_FAR_FEET);
    this.setLightingMode("daylight");

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);

    this.playerToken = createPlayerToken(TOKEN_RADIUS, null);
    this.scene.add(this.playerToken);

    this._bindEvents();
  }

  // (x, y) feet -> [worldX, worldZ], centering the map at the world origin -
  // same convention as game/scene.js's per-map toWorld, so barrier/wall
  // placement and player movement agree with each other.
  _toWorld(x, y) {
    return [x - this._feetDimensions.width / 2, this._feetDimensions.height / 2 - y];
  }

  // Loads the map's background image (as the ground plane), its wall and
  // circle barriers, and every unit (each animated via its own configured
  // movement, same simulation Simulate Units mode uses), and places the
  // player at the given feet position - called once when preview mode
  // starts. availableUnitTypes is MapEditor's unitTypeDetails
  // ({name, tokenRadius, tokenImageUrl, speedFactor} by unitType key) -
  // only types actually used need to have been fetched already. `isSvg`
  // (derived by the caller from mapData.imageUrl's own extension, not the
  // loadable imageUrl below, which is an opaque blob:/data: URL) picks
  // between rasterizing the SVG ourselves at a map-scale-appropriate
  // resolution (see game/svgRaster.js) versus loading a raster image
  // directly - see MapEditor's handleImageFile for why a map's background
  // is committed as the original SVG rather than a pre-baked PNG.
  loadMap({feetDimensions, barriers, connections, units, imageUrl, isSvg}, availableUnitTypes, startX, startY) {
    this._feetDimensions = feetDimensions;
    this._barriers = barriers ?? [];
    this._playerX = startX;
    this._playerY = startY;

    const {width, height} = feetDimensions;
    if (imageUrl) {
      const addGround = (texture) => {
        // Ground textures are viewed at a shallow, walking-height angle,
        // which minifies them much more steeply along depth than width -
        // without anisotropic filtering (the default is 1, effectively
        // off) that reads as heavy blur close to the camera, regardless of
        // the source image's own resolution.
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshLambertMaterial({map: texture}));
        ground.rotation.x = -Math.PI / 2;
        this.scene.add(ground);
      };
      if (isSvg) {
        loadSvgToCanvas(imageUrl, feetDimensions).then((canvas) => addGround(new THREE.CanvasTexture(canvas)));
      } else {
        new THREE.TextureLoader().load(imageUrl, addGround);
      }
    }

    for (const barrier of this._barriers) {
      if (barrier.type === "wall" && barrier.locations && barrier.locations.length >= 2) {
        const pts = barrier.locations.map(({x, y}) => this._toWorld(x, y));
        this.scene.add(buildWall(pts));
      } else if (barrier.type === "circle" && barrier.location) {
        this.scene.add(buildCircleBarrier(this._toWorld(barrier.location.x, barrier.location.y), barrier.radius ?? 0));
      }
    }

    // Line connections (map-to-map thresholds) render the same way the real
    // client draws them - a translucent magenta "wall" (game/scene.js's own
    // per-map setup) so a doorway/edge reads as a boundary, not just empty
    // space. Point connections aren't drawn there either - matches exactly.
    //
    // Unlike the real client, they also collide here - this preview never
    // actually transitions to another map when crossing one, so leaving them
    // walk-through would just look like walking into empty air where a real
    // player would have left this map. Treated as a synthetic wall segment
    // for collision purposes only (not added to the scene as a second mesh).
    const lineConnectionWalls = (connections ?? [])
      .filter((conn) => conn.type === "line" && conn.start && conn.end)
      .map((conn) => ({type: "wall", locations: [conn.start, conn.end]}));
    this._collisionBarriers = [...this._barriers, ...lineConnectionWalls];

    for (const conn of connections ?? []) {
      if (conn.type !== "line" || !conn.start || !conn.end) continue;
      const pts = [conn.start, conn.end].map(({x, y}) => this._toWorld(x, y));
      this.scene.add(buildWall(pts, {color: 0xff00ff, opacity: 0.4}));
    }

    for (const unit of units ?? []) {
      const info = availableUnitTypes[unit.unitType];
      const radius = info?.tokenRadius ?? DEFAULT_NPC_RADIUS;
      const token = createNpcToken(radius, unit.hostility, info?.tokenImageUrl, window.location.href);
      this.scene.add(token);
      const sim = initSimUnit(unit);
      const [wx, wz] = this._toWorld(sim.x, sim.y);
      token.position.set(wx, 0, wz);
      this._npcs.push({unit, sim, token, radius, speedFactor: info?.speedFactor ?? 1.0});
    }

    const [wx, wz] = this._toWorld(startX, startY);
    this.playerToken.position.set(wx, 0, wz);
    this._updatePlayerLight();
    this._updateFog();
    this._positionCamera();
  }

  _updatePlayerLight() {
    this._torchLight.position.set(this.playerToken.position.x, TORCH_HEIGHT, this.playerToken.position.z);
  }

  // Fog is defined in terms of distance from the camera, not the player -
  // recomputed every frame (zoom changes the camera's distance from the
  // player, via _camZoom scaling CAM_RADIUS in _positionCamera) so
  // DAYLIGHT_FOG_NEAR_FEET/FAR_FEET stay accurate as "distance from the
  // player" regardless of current zoom. A no-op in torchlight mode - fog is
  // cleared there (see setLightingMode).
  _updateFog() {
    if (this._lightingMode === "torchlight") return;
    const camDistance = this._camZoom * CAM_RADIUS;
    this._daylightFog.near = camDistance + DAYLIGHT_FOG_NEAR_FEET;
    this._daylightFog.far = camDistance + DAYLIGHT_FOG_FAR_FEET;
  }

  // "daylight" | "torchlight" - swaps which light set is active, the fog
  // (daylight-only - torchlight's own S-curve cutoff already limits view
  // distance, and fog fading everything uniformly on top would fight the
  // "lit by this one light" read), and the background color to match
  // (torchlight's true black vs. daylight's original dark-gray void), with
  // no scene rebuild.
  setLightingMode(mode) {
    this._lightingMode = mode;
    const torch = mode === "torchlight";
    this._ambient.intensity = torch ? 0 : DAYLIGHT_AMBIENT_INTENSITY;
    this._sun.visible = !torch;
    this._torchLight.visible = torch;
    this.scene.fog = torch ? null : this._daylightFog;
    this.scene.background = new THREE.Color(torch ? 0x000000 : DAYLIGHT_BG_COLOR);
    this._updateFog(); // refresh near/far immediately, not just on the next frame
  }

  handleResize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth, h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _positionCamera() {
    const s = this._camZoom;
    const fwdX = Math.sin(this._camFacing);
    const fwdZ = -Math.cos(this._camFacing);
    const horiz = s * CAM_RADIUS * Math.cos(this._camPitch);
    const vert = s * CAM_RADIUS * Math.sin(this._camPitch);
    const cx = this.playerToken.position.x, cz = this.playerToken.position.z;
    this.camera.position.set(cx - horiz * fwdX, vert, cz - horiz * fwdZ);
    this.camera.lookAt(cx + s * CAM_LOOK_AHEAD * fwdX, 0, cz + s * CAM_LOOK_AHEAD * fwdZ);
  }

  _bindEvents() {
    this._onResize = () => this.handleResize();
    window.addEventListener("resize", this._onResize);

    this._dragLast = null;
    this._onPointerDown = (e) => { this._dragLast = {x: e.clientX, y: e.clientY}; };
    this._onPointerMove = (e) => {
      if (!this._dragLast) return;
      const orbit = orbitFromDrag(this._camFacing, this._camPitch, e.clientX - this._dragLast.x, e.clientY - this._dragLast.y);
      this._camFacing = orbit.facing;
      this._camPitch = orbit.pitch;
      this._dragLast = {x: e.clientX, y: e.clientY};
    };
    this._onPointerUp = () => { this._dragLast = null; };
    this._onContextMenu = (e) => e.preventDefault();
    this._onWheel = (e) => {
      e.preventDefault();
      this._camZoom = clampZoom(this._camZoom + e.deltaY * 0.001);
    };
    this._onKeyDown = (e) => {
      if (MOVEMENT_KEYS[e.code]) this._pressedKeys.add(MOVEMENT_KEYS[e.code]);
      if (TURN_KEYS[e.code]) this._pressedKeys.add(TURN_KEYS[e.code]);
      if (SPRINT_KEYS[e.code]) this._pressedKeys.add(SPRINT_KEYS[e.code]);
    };
    this._onKeyUp = (e) => {
      if (MOVEMENT_KEYS[e.code]) this._pressedKeys.delete(MOVEMENT_KEYS[e.code]);
      if (TURN_KEYS[e.code]) this._pressedKeys.delete(TURN_KEYS[e.code]);
      if (SPRINT_KEYS[e.code]) this._pressedKeys.delete(SPRINT_KEYS[e.code]);
    };

    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    this.canvas.addEventListener("contextmenu", this._onContextMenu);
    this.canvas.addEventListener("wheel", this._onWheel, {passive: false});
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  // A/D (or left/right arrows) rotate the camera directly - separate from
  // mouse-drag orbit, same as the real client's turn_left/turn_right keys.
  _applyTurn(dt) {
    const keys = this._pressedKeys;
    if (keys.has("turn_left")) this._camFacing -= TURN_RATE * dt;
    if (keys.has("turn_right")) this._camFacing += TURN_RATE * dt;
  }

  // Movement relative to camera facing (not token facing) - W/S/Q/E always
  // walk toward/away from/alongside wherever the camera is looking,
  // matching the real client's own control feel (see game/scene.js's
  // startLoop).
  _applyMovement(dt) {
    const keys = this._pressedKeys;
    const sinA = Math.sin(this._camFacing), cosA = Math.cos(this._camFacing);
    let dx = 0, dy = 0;
    if (keys.has("forward")) { dx += sinA; dy += cosA; }
    if (keys.has("backward")) { dx -= sinA; dy -= cosA; }
    if (keys.has("strafe_right")) { dx += cosA; dy -= sinA; }
    if (keys.has("strafe_left")) { dx -= cosA; dy += sinA; }
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) return;

    const speed = keys.has("sprint") ? PLAYER_SPEED * SPRINT_MULTIPLIER : PLAYER_SPEED;
    const dist = (speed * dt) / mag;
    this._playerX += dx * dist;
    this._playerY += dy * dist;

    if (this._collisionBarriers.length > 0) {
      [this._playerX, this._playerY] = resolveBarrierCollisions(this._playerX, this._playerY, TOKEN_RADIUS, this._collisionBarriers);
    }
    const {width, height} = this._feetDimensions;
    this._playerX = Math.max(0, Math.min(width, this._playerX));
    this._playerY = Math.max(0, Math.min(height, this._playerY));

    const [wx, wz] = this._toWorld(this._playerX, this._playerY);
    this.playerToken.position.set(wx, 0, wz);
  }

  _applyNpcMovement(dt) {
    for (const npc of this._npcs) {
      const prevX = npc.sim.x, prevY = npc.sim.y;
      tickSimUnit(npc.sim, npc.unit, BASE_MOB_SPEED * npc.speedFactor, dt);
      const [wx, wz] = this._toWorld(npc.sim.x, npc.sim.y);
      npc.token.position.set(wx, 0, wz);
      if (npc.sim.x !== prevX || npc.sim.y !== prevY) {
        const [pwx, pwz] = this._toWorld(prevX, prevY);
        npc.token.rotation.y = -facingToward(pwx, pwz, wx, wz);
      }
    }
  }

  startLoop() {
    let lastTime = null;
    const tick = (time) => {
      this._frame = requestAnimationFrame(tick);
      const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      this._applyTurn(dt);
      this._applyMovement(dt);
      this._applyNpcMovement(dt);
      this.playerToken.rotation.y = -this._camFacing;
      this._updatePlayerLight();
      this._updateFog();
      this._positionCamera();
      this.renderer.render(this.scene, this.camera);
    };
    this._frame = requestAnimationFrame(tick);
  }

  dispose() {
    cancelAnimationFrame(this._frame);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("contextmenu", this._onContextMenu);
    this.canvas.removeEventListener("wheel", this._onWheel);
    this.renderer.dispose();
  }
}
