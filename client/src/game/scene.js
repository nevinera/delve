import * as THREE from "three";
import { resolveBarrierCollisions } from "./collision.js";
import { resolveStockAssetUrl } from "../resolveStockAssetUrl";
import { loadSvgToCanvas } from "./svgRaster.js";
import { isUntargetableStatus } from "./state.js";

const DEG = Math.PI / 180;
const BASE_PLAYER_SPEED = 20.0; // feet per second — must match server
const TOKEN_RADIUS = 2.2;
const CAM_BACK = 45;
const CAM_HEIGHT = 50;
const CAM_RADIUS = Math.sqrt(CAM_BACK ** 2 + CAM_HEIGHT ** 2);
const CAM_LOOK_AHEAD = 10;
const TURN_RATE = 120 * DEG; // radians/sec
const PITCH_MIN = 20 * DEG;
const PITCH_MAX = 60 * DEG;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const CAMERA_STICK_TURN_RATE = 120 * DEG; // radians/sec at full deflection
const CAMERA_STICK_PITCH_RATE = 60 * DEG; // radians/sec at full deflection
const LONG_PRESS_MS = 500; // touch substitute for right-click
const DRAG_THRESHOLD_SQ = 9; // px^2; below this a pointer down/up pair counts as a tap/click
const PINCH_ZOOM_SENSITIVITY = 0.003; // per px of finger-distance change
const EFFECT_HEIGHT = 0.4; // graphic effects float just above the tokens' top surface (y ~0.31)
const DEFAULT_SPRITE_FRAME_RATE = 8; // fps, used when spriteFrameRate is omitted

// Facing convention shared with tokens: angle 0 = -Z ("north"); rotation.y = -angle.
function facingToward(x1, z1, x2, z2) {
  return Math.atan2(x2 - x1, -(z2 - z1));
}

// ---------------------------------------------------------------------------
// Wall building — ported from tools/demo.html
// ---------------------------------------------------------------------------

function computeWallPolygon(points, half) {
  const normals = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dz = points[i + 1][1] - points[i][1];
    const len = Math.sqrt(dx * dx + dz * dz);
    normals.push([-dz / len, dx / len]);
  }

  const offsetAt = (i, side) => {
    let ox, oz;
    if (i === 0) {
      ox = normals[0][0] * half;
      oz = normals[0][1] * half;
    } else if (i === points.length - 1) {
      ox = normals[i - 1][0] * half;
      oz = normals[i - 1][1] * half;
    } else {
      const [n0x, n0z] = normals[i - 1];
      const [n1x, n1z] = normals[i];
      const mx = n0x + n1x, mz = n0z + n1z;
      const mlen = Math.sqrt(mx * mx + mz * mz);
      const dot = (n0x * mx) / mlen + (n0z * mz) / mlen;
      ox = (mx / mlen) * half / dot;
      oz = (mz / mlen) * half / dot;
    }
    return [points[i][0] + side * ox, points[i][1] + side * oz];
  };

  const result = [];
  for (let i = 0; i < points.length; i++) result.push(offsetAt(i, 1));
  for (let i = points.length - 1; i >= 0; i--) result.push(offsetAt(i, -1));
  return result;
}

// Exported (along with buildCircleBarrier below, not computeWallPolygon) -
// the map editor's MapPreviewScene reuses them as-is, no signature changes
// needed to serve both callers. Everything else the preview needs (facing
// math, movement, camera positioning) is small enough to just duplicate
// there instead, same as editor/previewScene.js already does for the
// ability preview - see its header comment for why an editor-only preview
// stays decoupled from this file rather than growing options to
// accommodate a second caller.
export function buildWall(worldPoints, { thickness = 0.4, height = 0.8, color = 0x333333, opacity = 0.4 } = {}) {
  const poly = computeWallPolygon(worldPoints, thickness / 2);
  const shape = new THREE.Shape();
  poly.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity })));
  group.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: opacity * 2 })
    )
  );
  group.rotation.x = -Math.PI / 2;
  return group;
}

// Same visual treatment as buildWall (translucent fill + dark edge outline),
// as a cylinder matching resolveBarrierCollisions'/hasLineOfSight's circle
// radius exactly - a unit visibly clips the mesh only where it would also
// collide. centerWorld is [worldX, worldZ] - the same pair _toWorld/toWorld
// produce for a wall point - not a feet-space location.
export function buildCircleBarrier(centerWorld, radiusFeet, { height = 0.8, color = 0x333333, opacity = 0.4, segments = 24 } = {}) {
  const geo = new THREE.CylinderGeometry(radiusFeet, radiusFeet, height, segments);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: opacity * 2 })
  );
  mesh.position.y = height / 2;
  edges.position.y = height / 2;

  const group = new THREE.Group();
  group.add(mesh, edges);
  const [worldX, worldZ] = centerWorld;
  group.position.set(worldX, 0, worldZ);
  return group;
}

// ---------------------------------------------------------------------------
// Token building — ported from tools/demo.html
// ---------------------------------------------------------------------------

function addFacingArrow(group, radius, color) {
  const hw = (0.3 * radius) / Math.sqrt(3);
  const y = 0.31;
  const verts = [0, y, -1.4 * radius, -hw, y, -1.1 * radius, hw, y, -1.1 * radius];

  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  fillGeo.setIndex([0, 1, 2]);
  fillGeo.computeVertexNormals();
  group.add(
    new THREE.Mesh(fillGeo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }))
  );

  const borderVerts = verts.map((v, i) => (i % 3 === 1 ? v + 0.005 : v));
  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute("position", new THREE.Float32BufferAttribute(borderVerts, 3));
  group.add(new THREE.LineLoop(borderGeo, new THREE.LineBasicMaterial({ color: 0x000000 })));
}

export function createPlayerToken(radius, tokenUrl) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.3, 32),
    new THREE.MeshLambertMaterial({ color: 0x2e7d32 })
  );
  body.position.y = 0.15;
  group.add(body);

  const portraitMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const portrait = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.8, 32), portraitMat);
  portrait.rotation.x = -Math.PI / 2;
  portrait.position.y = 0.31;
  group.add(portrait);

  if (tokenUrl) {
    new THREE.TextureLoader().load(tokenUrl, (texture) => {
      portraitMat.map = texture;
      portraitMat.needsUpdate = true;
    });
  }

  addFacingArrow(group, radius, 0x81c784);
  attachDeadMarkers(group, radius);
  return group;
}

const HOSTILITY_COLORS = {
  hostile:  { body: 0xc62828, cone: 0xef9a9a },
  neutral:  { body: 0xe65100, cone: 0xffcc80 },
  friendly: { body: 0x1565c0, cone: 0x90caf9 },
};

// Fraction to blend a tagged-by-someone-else token's body color toward grey.
const TAG_DIM_AMOUNT = 0.6;
const TAG_DIM_COLOR = 0x808080;

export function setTokenTagDimmed(group, dimmed) {
  if (!group._bodyMaterial || group._dimmed === dimmed) return;
  group._dimmed = dimmed;
  group._bodyMaterial.color.set(group._baseColor);
  if (dimmed) group._bodyMaterial.color.lerp(new THREE.Color(TAG_DIM_COLOR), TAG_DIM_AMOUNT);
}

const TARGET_LINE_COLOR = 0x00ff44;
const TARGET_LINE_ATTACKING_COLOR = 0xff8c1a;

export function targetLineColor(attacking) {
  return attacking ? TARGET_LINE_ATTACKING_COLOR : TARGET_LINE_COLOR;
}

// Evenly-spaced [x, z] points from (sx, sz) to (tx, tz), one per `spacing`
// feet of travel, capped at maxDots.
export function computeTargetLineDots(sx, sz, tx, tz, spacing, maxDots) {
  const dx = tx - sx, dz = tz - sz;
  const totalDist = Math.sqrt(dx * dx + dz * dz);
  const count = Math.min(Math.floor(totalDist / spacing) + 1, maxDots);
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    points.push([sx + dx * t, sz + dz * t]);
  }
  return points;
}

// Offsets `pos` toward `other` by pos.radius, landing on the edge of pos's
// token nearest `other` instead of its center. Returns pos unchanged if
// either point or pos.radius is missing, or the two coincide.
export function edgeTowards(pos, other) {
  if (!pos || !other || !pos.radius) return pos;
  const dx = other.x - pos.x, dy = other.y - pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) return pos;
  return { x: pos.x + (dx / dist) * pos.radius, y: pos.y + (dy / dist) * pos.radius };
}

// The position the client should converge its own prediction toward once a
// server echo (serverX, serverY) arrives, given its current predicted
// position (currentX, currentY) and `matched` - the {x, y} the client itself
// sent for the move seq this echo answers (see GameConnection.positionForSeq
// and last_move_seq), or null if that send is no longer on record: the
// current position offset by whatever the server actually corrected, rather
// than the raw echoed absolute position - which is normally just a stale
// snapshot of somewhere the client already predicted correctly one round
// trip ago. Falls back to the raw echoed position when there's nothing to
// match against.
export function reconciledTarget(matched, currentX, currentY, serverX, serverY) {
  if (!matched) return { x: serverX, y: serverY };
  return { x: currentX + (serverX - matched.x), y: currentY + (serverY - matched.y) };
}

// Pointer-gesture math for _initMouseControls, pulled out for unit testing -
// pointer events themselves (and the canvas/THREE.js state they touch)
// aren't practical to exercise directly in tests.

export function clampZoom(zoom) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

// Pinch spread (dist > lastDist) zooms in (decreases camZoom, see
// _positionCamera - smaller camZoom means a closer camera).
export function pinchZoom(camZoom, dist, lastDist) {
  return clampZoom(camZoom - (dist - lastDist) * PINCH_ZOOM_SENSITIVITY);
}

export function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function orbitFromDrag(camFacing, camPitch, dx, dy) {
  return {
    facing: camFacing + dx * 0.005,
    pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, camPitch + dy * 0.005)),
  };
}

// Console-style right-stick camera look, applied continuously (every frame,
// scaled by elapsed time) rather than per-drag-delta like orbitFromDrag.
// Controller convention: pull back/down to look up - higher camPitch means a
// steeper overhead angle (see _positionCamera), so "look up" means pitch
// decreases, same sign as the stick's up-positive y.
export function orbitFromStick(camFacing, camPitch, stickX, stickY, elapsed) {
  return {
    facing: camFacing + stickX * CAMERA_STICK_TURN_RATE * elapsed,
    pitch: Math.max(
      PITCH_MIN,
      Math.min(PITCH_MAX, camPitch + stickY * CAMERA_STICK_PITCH_RATE * elapsed)
    ),
  };
}

export function isTap(dx, dy) {
  return dx * dx + dy * dy < DRAG_THRESHOLD_SQ;
}

export function createNpcToken(radius, hostility, tokenImageUrl, zoneBaseUrl) {
  const { body: bodyColor, cone: coneColor } =
    HOSTILITY_COLORS[hostility] ?? HOSTILITY_COLORS.hostile;

  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.3, 32),
    bodyMat
  );
  body.position.y = 0.15;
  group.add(body);
  group._bodyMaterial = bodyMat;
  group._baseColor = bodyColor;
  group._dimmed = false;

  const portraitMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const portrait = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.8, 32), portraitMat);
  portrait.rotation.x = -Math.PI / 2;
  portrait.position.y = 0.31;
  group.add(portrait);

  const urls = Array.isArray(tokenImageUrl)
    ? tokenImageUrl
    : [tokenImageUrl].filter(Boolean);
  if (urls.length && zoneBaseUrl) {
    const url = new URL(urls[Math.floor(Math.random() * urls.length)], zoneBaseUrl).href;
    new THREE.TextureLoader().load(url, (texture) => {
      portraitMat.map = texture;
      portraitMat.needsUpdate = true;
    });
  }

  addFacingArrow(group, radius, coneColor);
  attachDeadMarkers(group, radius);
  attachLootBeam(group);
  return group;
}

// Creates the dead-state overlay (gray circle + red X) and attaches it to group,
// hidden. Toggle group._deadMarkers.visible and group.position.y each tick.
function attachLootBeam(group) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    side: THREE.DoubleSide,
    depthWrite: false,
    transparent: true,
    opacity: 0.3,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 6), mat);
  beam.position.y = 3.3;
  beam.visible = false;
  group.add(beam);
  group._lootBeam = beam;
}

function attachDeadMarkers(group, radius) {
  const markers = new THREE.Group();
  markers.visible = false;

  const overlay = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.6 }),
  );
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.y = 0.32;
  markers.add(overlay);

  const mat = new THREE.MeshBasicMaterial({ color: 0xaa1111 });
  const arm = new THREE.BoxGeometry(radius * 1.5, 0.12, radius * 0.22);
  const x1 = new THREE.Mesh(arm, mat);
  x1.position.y = 0.35;
  x1.rotation.y = Math.PI / 4;
  const x2 = new THREE.Mesh(arm, mat.clone());
  x2.position.y = 0.35;
  x2.rotation.y = -Math.PI / 4;
  markers.add(x1, x2);

  group.add(markers);
  group._deadMarkers = markers;
}

function setTokenDead(group, dead) {
  if (group._deadMarkers) group._deadMarkers.visible = dead;
  group.position.y = dead ? -0.15 : 0;
}

// ---------------------------------------------------------------------------
// SceneManager
// ---------------------------------------------------------------------------

export class SceneManager {
  constructor(canvas, { turnKeysRef, movementKeysRef, cameraStickRef, cameraSensitivityRef, onFacingChange, onSelfPosition, positionForMoveSeq, onUnitClick, onUnitRightClick, onUnitHover, onCanvasResize } = {}) {
    this._canvas = canvas;
    this._turnKeysRef = turnKeysRef;
    this._movementKeysRef = movementKeysRef;
    this._cameraStickRef = cameraStickRef;
    this._cameraSensitivityRef = cameraSensitivityRef; // {current: multiplier} on mouse/touch drag and right-stick look
    this._onCanvasResize = onCanvasResize;
    this._onFacingChange = onFacingChange;
    this._onSelfPosition = onSelfPosition;
    this._positionForMoveSeq = positionForMoveSeq;
    this._onUnitClick = onUnitClick;
    this._onUnitRightClick = onUnitRightClick;
    this._onUnitHover = onUnitHover;
    this._lastPosSendTime = 0;

    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x000000);
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(5, 10, 5);
    this._scene.add(sun);

    this._camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);

    this._tokenMap = new Map();
    this._mapToWorldByMap = new Map(); // mapId → (x,y)=>[wx,wz]
    this._mapGroups = new Map();       // mapId → THREE.Group (visibility-toggled on map change)
    this._zoneBaseUrl = null;
    this._unitInfo = new Map();
    this._barriersByMap = new Map();
    this._dimsByMap = new Map();   // mapId → { width, height }
    this._animId = null;

    this._activeEffects = []; // { sprite, mat, startedAt, durationMs, fadeStartMs }
    this._statusAuras = new Map(); // `${unitId}:${statusName}:${applierId}` → { plane, mat, texture, ... } (or a pending placeholder while its texture loads)

    // Targeting visuals
    this._targetId = null;
    this._targetRing = this._buildTargetRing();
    this._targetLine = this._buildTargetLine();
    this._scene.add(this._targetRing);
    this._scene.add(this._targetLine);
    this._selfAttacking = false;
    this._npcArrows = new Map(); // unitId → arrow group

    // Client-side movement prediction for the self unit
    this._selfMapX = 0;
    this._selfMapY = 0;
    this._selfSpeed = BASE_PLAYER_SPEED; // updated from server unit state
    // Where to converge _selfMapX/Y toward when movement stops - see
    // reconciledTarget, computed fresh each time a self position arrives.
    this._selfMapTargetX = 0;
    this._selfMapTargetY = 0;
    this._selfInitialized = false;
    this._selfMapIdentifier = null;

    // Camera state — client-owned; facing/pitch/zoom local, position read from selfToken
    this._selfToken = null; // Three.js Group for the player's token
    this._camFacing = 0; // radians
    this._camPitch = Math.atan2(CAM_HEIGHT, CAM_BACK); // radians
    this._camZoom = 1.0;

    this._initMouseControls();
  }

  _buildTargetRing() {
    const geo = new THREE.TorusGeometry(1, 0.08, 8, 48);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    ring.visible = false;
    return ring;
  }

  _buildTargetLine() {
    // Round dot texture drawn on a canvas.
    const canvas = document.createElement("canvas");
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);

    const MAX_DOTS = 64;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(MAX_DOTS * 3), 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      color: 0x00ff44,
      size: 1.2,
      sizeAttenuation: true,
      map: tex,
      transparent: true,
      opacity: 0.85,
      alphaTest: 0.5,
      depthTest: false,
    });
    const points = new THREE.Points(geo, mat);
    points._maxDots = MAX_DOTS;
    points.visible = false;
    return points;
  }

  setAttacking(attacking) {
    const next = !!attacking;
    if (this._selfAttacking === next) return;
    this._selfAttacking = next;
    this._targetLine.material.color.set(targetLineColor(next));
  }

  setTarget(id) {
    this._targetId = id;
    this._targetRing.visible = !!id;
    this._targetLine.visible = !!id;
  }

  setLootableUnits(ids) {
    for (const [id, { group }] of this._tokenMap) {
      const lootable = ids.has(id);
      if (group._lootBeam) group._lootBeam.visible = lootable;
    }
  }

  _updateLootBeams(time) {
    // 1 rotation per second = 2π radians per 1000 ms
    const angle = (time / 1000) * Math.PI * 2;
    for (const { group } of this._tokenMap.values()) {
      if (group._lootBeam?.visible) group._lootBeam.rotation.y = angle;
    }
  }

  // Pointer Events (not Mouse/Touch Events) so mouse, touch and pen all
  // drive orbit/click/hover through one path. Touch has no right-click, so a
  // long-press on the canvas substitutes for it (see LONG_PRESS_MS below).
  _initMouseControls() {
    let downX = null, downY = null, lastX = null, lastY = null;
    let activePointerId = null;
    let longPressTimer = null;
    let longPressFired = false;
    // Second-finger pinch-zoom. Tracked separately from the single-pointer
    // orbit/tap state above - a second touch landing cancels any in-progress
    // orbit-drag/long-press and takes over until fingers drop back below 2.
    const touchPoints = new Map(); // pointerId -> {x, y}, touch pointers currently down
    let pinchLastDist = null;

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };
    const endDrag = () => {
      activePointerId = null;
      downX = null; downY = null; lastX = null; lastY = null;
    };
    const pinchDistance = () => {
      const [a, b] = [...touchPoints.values()];
      return pointerDistance(a, b);
    };

    this._canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (touchPoints.size === 2) {
        clearLongPress();
        endDrag();
        pinchLastDist = pinchDistance();
        return;
      }
      if (touchPoints.size > 2 || activePointerId !== null) return;

      // Capture so drag keeps tracking even once the finger crosses off the
      // canvas - the canvas is letterboxed to 4:3 and doesn't fill the
      // screen, so a vertical drag on a portrait phone exits its bounds
      // almost immediately without this.
      this._canvas.setPointerCapture?.(e.pointerId);
      activePointerId = e.pointerId;
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      longPressFired = false;
      if (e.pointerType === "touch") {
        longPressTimer = setTimeout(() => {
          longPressFired = true;
          this._handleRightClick(e);
        }, LONG_PRESS_MS);
      }
    });
    this._canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" && touchPoints.has(e.pointerId)) {
        touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (touchPoints.size === 2) {
        const dist = pinchDistance();
        if (pinchLastDist !== null) {
          this._camZoom = pinchZoom(this._camZoom, dist, pinchLastDist);
        }
        pinchLastDist = dist;
        return;
      }
      if (e.pointerId !== activePointerId || lastX === null) return;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (!isTap(dx, dy)) clearLongPress();
      const k = this._cameraSensitivityRef?.current ?? 1;
      const orbit = orbitFromDrag(this._camFacing, this._camPitch, (e.clientX - lastX) * k, (e.clientY - lastY) * k);
      this._camFacing = orbit.facing;
      this._camPitch = orbit.pitch;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch") touchPoints.delete(e.pointerId);
      if (touchPoints.size < 2) pinchLastDist = null;
      if (e.pointerId !== activePointerId) return;
      clearLongPress();
      if (!longPressFired && downX !== null) {
        const dx = e.clientX - downX, dy = e.clientY - downY;
        if (isTap(dx, dy)) this._handleClick(e);
      }
      endDrag();
    });
    window.addEventListener("pointercancel", (e) => {
      if (e.pointerType === "touch") touchPoints.delete(e.pointerId);
      if (touchPoints.size < 2) pinchLastDist = null;
      if (e.pointerId !== activePointerId) return;
      clearLongPress();
      endDrag();
    });
    this._canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this._handleRightClick(e);
    });
    this._canvas.addEventListener("pointermove", (e) => this._handleHover(e));
    this._canvas.addEventListener("pointerleave", () => this._onUnitHover?.(null));
    this._canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this._camZoom = clampZoom(this._camZoom + e.deltaY * 0.001);
    }, { passive: false });
  }

  _handleClick(e) {
    if (!this._onUnitClick) return;
    const id = this._unitUnderPointer(e);
    this._onUnitClick(id ?? null);
  }

  _handleRightClick(e) {
    if (!this._onUnitRightClick) return;
    const id = this._unitUnderPointer(e);
    if (id) this._onUnitRightClick(id);
  }

  _handleHover(e) {
    if (!this._onUnitHover) return;
    const id = this._unitUnderPointer(e);
    this._onUnitHover(id ?? null);
  }

  _unitUnderPointer(e) {
    const rect = this._canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this._camera);
    const meshes = [];
    const meshToID = new Map();
    // Self's own token is a valid click/hover/right-click target too -
    // canTargetUnit already allows it (distance to yourself is 0), and the
    // target frame is the only way to see your own resources rendered in
    // that layout (e.g. to sanity-check a secondary resource meter).
    for (const [id, { group }] of this._tokenMap) {
      group.traverse((obj) => {
        if (obj.isMesh) { meshes.push(obj); meshToID.set(obj.uuid, id); }
      });
    }
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length > 0 ? (meshToID.get(hits[0].object.uuid) ?? null) : null;
  }

  async loadZone(url) {
    let json;
    try {
      const res = await fetch(url);
      json = await res.json();
    } catch (e) {
      console.error("Failed to load zone config", e);
      return;
    }

    if (!json.maps?.length) return;

    const baseUrl = new URL(".", url).href;
    this._zoneBaseUrl = baseUrl;

    // Build barrier lookup by map identifier for client-side collision.
    for (const m of json.maps) {
      this._barriersByMap.set(m.identifier, m.barriers ?? []);
      this._dimsByMap.set(m.identifier, m.feetDimensions);
    }

    // Build lookup across all maps: zone_unit_identifier → { tokenImageUrl, hostility, tokenRadius }
    const unitTypes = json.unitTypes ?? {};
    for (const m of json.maps) {
      for (const unit of m.units ?? []) {
        const utype = unitTypes[unit.unitType];
        if (unit.identifier && utype) {
          this._unitInfo.set(unit.identifier, {
            tokenImageUrl: utype.tokenImageUrl,
            hostility: unit.hostility,
            tokenRadius: utype.tokenRadius ?? TOKEN_RADIUS,
          });
        }
      }
    }

    // Build per-map coordinate transforms and scene groups.
    // Each map's geometry lives in its own Group; only the current map's group is visible.
    for (const m of json.maps) {
      const { width, height } = m.feetDimensions;
      const originX = -width / 2;
      const originZ = height / 2;
      const toWorld = (x, y) => [x + originX, originZ - y];
      this._mapToWorldByMap.set(m.identifier, toWorld);

      const group = new THREE.Group();
      group.visible = false;
      this._mapGroups.set(m.identifier, group);
      this._scene.add(group);

      if (m.imageUrl) {
        const mapUrl = new URL(m.imageUrl, baseUrl).href;
        const addGround = (texture) => {
          // See MapPreviewScene.js's loadMap for why this matters - a
          // ground texture viewed at a shallow, walking-height angle blurs
          // heavily without anisotropic filtering, regardless of the
          // source image's own resolution.
          texture.anisotropy = this._renderer.capabilities.getMaxAnisotropy();
          const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshLambertMaterial({ map: texture })
          );
          plane.rotation.x = -Math.PI / 2;
          group.add(plane);
        };
        // A map background is committed as its original SVG (smaller than a
        // pre-baked raster, and losslessly re-renderable at any resolution -
        // see the map editor plan's Phase 3 note) rather than a raster
        // format - rasterize it ourselves at a map-scale-appropriate
        // resolution instead of trusting the browser's default SVG decode
        // size, same as the map editor's own walk preview.
        if (m.imageUrl.toLowerCase().endsWith(".svg")) {
          loadSvgToCanvas(mapUrl, { width, height }).then((canvas) => addGround(new THREE.CanvasTexture(canvas)));
        } else {
          new THREE.TextureLoader().load(mapUrl, addGround);
        }
      }

      for (const barrier of m.barriers ?? []) {
        if (barrier.type === "wall") {
          const pts = barrier.locations.map(({ x, y }) => toWorld(x, y));
          group.add(buildWall(pts));
        } else if (barrier.type === "circle" && barrier.location) {
          group.add(buildCircleBarrier(toWorld(barrier.location.x, barrier.location.y), barrier.radius ?? 0));
        }
      }

      for (const conn of m.connections ?? []) {
        if (conn.type === "line") {
          const pts = [conn.start, conn.end].map(({ x, y }) => toWorld(x, y));
          group.add(buildWall(pts, { color: 0xff00ff, opacity: 0.4 }));
        }
      }
    }
  }

  // Converts map coordinates to world coordinates for the player's current map.
  _toWorld(x, y) {
    return this._mapToWorldByMap.get(this._selfMapIdentifier)?.(x, y) ?? [0, 0];
  }

  updateUnits(units, selfIdentifier, characterTokenUrl) {
    if (!this._mapToWorldByMap.size) return;

    const selfEntry = Object.entries(units).find(
      ([, u]) => u.zone_unit_identifier === selfIdentifier
    );
    const selfUnit = selfEntry?.[1];
    const selfUnitId = selfEntry?.[0] ?? null;
    const currentMap = selfUnit?.map_identifier;

    if (new URLSearchParams(window.location.search).has("debugScene")) {
      console.log("[scene] updateUnits", {
        selfIdentifier,
        unitCount: Object.keys(units).length,
        unitIdentifiers: Object.values(units).map((u) => u.zone_unit_identifier),
        selfFound: !!selfUnit,
        currentMap,
        zoneMapIdentifiers: [...this._mapGroups.keys()],
      });
    }

    // Detect map change before the unit loop so _toWorld uses the correct
    // coordinate transform for every unit on the new map this tick.
    if (selfUnit && selfUnit.map_identifier !== this._selfMapIdentifier) {
      for (const [mid, group] of this._mapGroups) {
        group.visible = mid === selfUnit.map_identifier;
      }
      this._selfMapIdentifier = selfUnit.map_identifier;
      this._selfMapX = selfUnit.position.x;
      this._selfMapY = selfUnit.position.y;
      this._selfMapTargetX = selfUnit.position.x;
      this._selfMapTargetY = selfUnit.position.y;
    }

    const seen = new Set();
    for (const [id, unit] of Object.entries(units)) {
      if (unit.map_identifier !== currentMap) continue;
      seen.add(id);
      const isSelf = unit.zone_unit_identifier === selfIdentifier;
      const [wx, wz] = this._toWorld(unit.position.x, unit.position.y);
      const angle = -(unit.position.angle * DEG);

      if (isSelf) {
        const matched = unit.last_move_seq != null ? (this._positionForMoveSeq?.(unit.last_move_seq) ?? null) : null;
        const target = reconciledTarget(matched, this._selfMapX, this._selfMapY, unit.position.x, unit.position.y);
        this._selfMapTargetX = target.x;
        this._selfMapTargetY = target.y;

        const nowDead = unit.status === "dead";
        if (this._selfDead && !nowDead) {
          // Respawned: snap predicted position (and target) to server so
          // there's no slide.
          this._selfMapX = unit.position.x;
          this._selfMapY = unit.position.y;
          this._selfMapTargetX = unit.position.x;
          this._selfMapTargetY = unit.position.y;
        }
        this._selfDead = nowDead;
        this.setAttacking(unit.attacking);
        if (unit.speed) this._selfSpeed = unit.speed;
        if (!this._selfInitialized) {
          this._selfMapX = unit.position.x;
          this._selfMapY = unit.position.y;
          this._selfMapTargetX = unit.position.x;
          this._selfMapTargetY = unit.position.y;
          this._selfInitialized = true;
        }
      }

      if (this._tokenMap.has(id)) {
        const entry = this._tokenMap.get(id);
        entry.targetUnitId = unit.target ?? null;
        if (!isSelf) {
          entry.targetX = wx;
          entry.targetZ = wz;
          entry.targetRotY = angle;
          if (entry.lastRenderedMap !== unit.map_identifier) {
            entry.group.position.set(wx, entry.group.position.y, wz);
            entry.group.rotation.y = angle;
            entry.lastRenderedMap = unit.map_identifier;
          }
        }
        setTokenDead(entry.group, isUntargetableStatus(unit.status));
        if (!isSelf) {
          setTokenTagDimmed(entry.group, unit.tagged_by != null && unit.tagged_by !== selfUnitId);
        }
      } else {
        const info = this._unitInfo.get(unit.zone_unit_identifier);
        const radius = info?.tokenRadius ?? TOKEN_RADIUS;
        const group = isSelf
          ? createPlayerToken(radius, characterTokenUrl)
          : createNpcToken(radius, info?.hostility, info?.tokenImageUrl, this._zoneBaseUrl);
        group.position.set(wx, 0, wz);
        group.rotation.y = angle;
        group._zoneUnitIdentifier = unit.zone_unit_identifier;
        this._scene.add(group);
        setTokenDead(group, isUntargetableStatus(unit.status));
        if (!isSelf) {
          setTokenTagDimmed(group, unit.tagged_by != null && unit.tagged_by !== selfUnitId);
        }
        this._tokenMap.set(id, { group, isSelf, targetX: wx, targetZ: wz, targetRotY: angle, targetUnitId: unit.target ?? null, radius, lastRenderedMap: unit.map_identifier });
        if (isSelf) {
          this._selfToken = group;
          this._camFacing = unit.position.angle * DEG;
        }
      }
    }

    for (const [id, { group }] of this._tokenMap) {
      if (!seen.has(id)) {
        this._scene.remove(group);
        this._tokenMap.delete(id);
        const arrow = this._npcArrows.get(id);
        if (arrow) { this._scene.remove(arrow); this._npcArrows.delete(id); }
      }
    }
  }

  // Reconciles the persistent aura visuals against every unit's live
  // active_status_effects (see game/state.js) - unlike playGraphicEffects
  // (a one-shot cast visual with a client-picked duration), a status aura is
  // authoritative-state-driven: it appears/disappears exactly when the
  // matching entry appears/disappears from the unit's status list, however
  // long that turns out to be (stacking/extension included), not a fixed
  // client-side timer.
  // statusCatalog: { [statusName]: { status, baseUrl } } - see App.jsx's
  // buildStatusCatalog. baseUrl travels with each entry (rather than being a
  // single argument here) since a status's defining power may have come from
  // the player's own class config or from a zone unit type's powers - two
  // different base URLs for resolving a relative auraEffect.sourceURL against.
  // Silently skips any status not in the catalog (unknown to this client -
  // e.g. applied by another player's class we haven't fetched powers for)
  // rather than guessing at its auraEffect.
  syncStatusAuras(units, statusCatalog, stockAssets) {
    const active = new Set();
    for (const [unitId, unit] of Object.entries(units)) {
      const entry = this._tokenMap.get(unitId);
      if (!entry) continue;
      for (const eff of unit.active_status_effects ?? []) {
        const catalogEntry = statusCatalog[eff.status_name];
        const auraEffect = catalogEntry?.status?.auraEffect;
        if (!auraEffect) continue;
        const key = `${unitId}:${eff.status_name}:${eff.applier_id}`;
        active.add(key);
        if (!this._statusAuras.has(key)) {
          this._spawnStatusAura(key, auraEffect, entry.group, catalogEntry.baseUrl, stockAssets);
        }
      }
    }

    for (const [key, aura] of this._statusAuras) {
      if (active.has(key)) continue;
      if (aura.plane) {
        aura.plane.removeFromParent();
        aura.mat.dispose();
        aura.texture?.dispose();
      }
      this._statusAuras.delete(key);
    }
  }

  _spawnStatusAura(key, auraEffect, tokenGroup, baseUrl, stockAssets) {
    // Registered synchronously (as a pending placeholder, no `plane` yet) so
    // a status that expires again before its texture finishes loading is
    // detected below rather than spawning a plane nobody wants anymore.
    const pending = { pending: true };
    this._statusAuras.set(key, pending);

    const url = resolveStockAssetUrl(auraEffect.sourceURL, "graphics", stockAssets) ?? new URL(auraEffect.sourceURL, baseUrl).href;
    const { color, scale = 1.0, opacity = 1.0, spriteColumns, spriteRows } = auraEffect;
    const isSpriteSheet = spriteColumns > 0 && spriteRows > 0;
    const frameCount = auraEffect.spriteFrameCount ?? (spriteColumns * spriteRows);
    const frameRate = auraEffect.spriteFrameRate ?? DEFAULT_SPRITE_FRAME_RATE;

    new THREE.TextureLoader().load(url, (texture) => {
      if (this._statusAuras.get(key) !== pending) {
        texture.dispose();
        return;
      }
      if (isSpriteSheet) {
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.repeat.set(1 / spriteColumns, 1 / spriteRows);
        texture.offset.set(0, 1 - 1 / spriteRows);
      }

      const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity });
      if (color) mat.color.set(`#${color.replace(/^#/, "")}`);

      const plane = new THREE.Mesh(new THREE.PlaneGeometry(4 * scale, 4 * scale), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = EFFECT_HEIGHT;
      tokenGroup.add(plane);

      this._statusAuras.set(key, {
        plane, mat, texture,
        startedAt: performance.now(),
        isSpriteSheet, spriteColumns, spriteRows, frameCount, frameRate,
      });
    });
  }

  _updateStatusAuras(now) {
    for (const aura of this._statusAuras.values()) {
      if (!aura.isSpriteSheet) continue;
      const elapsed = now - aura.startedAt;
      const frame = Math.floor((elapsed / 1000) * aura.frameRate) % aura.frameCount;
      const col = frame % aura.spriteColumns;
      const row = Math.floor(frame / aura.spriteColumns);
      aura.texture.offset.set(col / aura.spriteColumns, 1 - (row + 1) / aura.spriteRows);
    }
  }

  startLoop() {
    let lastTime = null;
    const tick = (time) => {
      this._animId = requestAnimationFrame(tick);
      const elapsed = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const keys = this._turnKeysRef?.current;
      if (keys) {
        let turned = false;
        if (keys.has("turn_left"))  { this._camFacing -= TURN_RATE * elapsed; turned = true; }
        if (keys.has("turn_right")) { this._camFacing += TURN_RATE * elapsed; turned = true; }
        if (turned) this._onFacingChange?.(this._camFacing / DEG);
      }

      // Right stick: continuous console-style camera look, read every frame
      // (not event-driven) so holding a constant deflection keeps rotating
      // even though nipplejs only fires "move" while the finger itself moves.
      const camStick = this._cameraStickRef?.current;
      if (camStick && (camStick.x || camStick.y)) {
        const k = this._cameraSensitivityRef?.current ?? 1;
        const orbit = orbitFromStick(this._camFacing, this._camPitch, camStick.x * k, camStick.y * k, elapsed);
        this._camFacing = orbit.facing;
        this._camPitch = orbit.pitch;
        this._onFacingChange?.(this._camFacing / DEG);
      }

      // Self unit: apply local movement prediction each frame.
      if (this._selfInitialized && this._selfToken && !this._selfDead) {
        const mkeys = this._movementKeysRef?.current;
        let moved = false;
        if (mkeys && mkeys.size > 0) {
          const sinA = Math.sin(this._camFacing);
          const cosA = Math.cos(this._camFacing);
          let dx = 0, dy = 0;
          if (mkeys.has("forward"))      { dx += sinA; dy += cosA; }
          if (mkeys.has("backward"))     { dx -= sinA; dy -= cosA; }
          if (mkeys.has("strafe_right")) { dx += cosA; dy -= sinA; }
          if (mkeys.has("strafe_left"))  { dx -= cosA; dy += sinA; }
          const mag = Math.sqrt(dx * dx + dy * dy);
          if (mag > 0) {
            const backward = mkeys.has("backward") && !mkeys.has("forward");
            const speed = backward ? this._selfSpeed * 0.6 : this._selfSpeed;
            const dist = speed * elapsed / mag;
            this._selfMapX += dx * dist;
            this._selfMapY += dy * dist;
            moved = true;
          }
        }
        if (!moved) {
          // Stopped: converge toward _selfMapTargetX/Y (see reconciledTarget)
          // - not the raw server-echoed position, which is normally just a
          // stale snapshot of somewhere we already predicted correctly one
          // round trip ago and would visibly yank the token backward under
          // any real latency. The target is only ever the *actual*
          // correction (e.g. a feasibility clamp near a wall - see
          // move_feasibility.go - or a collision push-out), so it's ~0 in
          // the common case and converging to it is a no-op.
          const cf = 1 - Math.exp(-10 * elapsed);
          this._selfMapX += (this._selfMapTargetX - this._selfMapX) * cf;
          this._selfMapY += (this._selfMapTargetY - this._selfMapY) * cf;
        }

        // Apply client-side collision so predicted position stays out of walls.
        const barriers = this._barriersByMap.get(this._selfMapIdentifier) ?? [];
        if (barriers.length > 0) {
          [this._selfMapX, this._selfMapY] = resolveBarrierCollisions(
            this._selfMapX, this._selfMapY, TOKEN_RADIUS, barriers
          );
        }
        const dims = this._dimsByMap.get(this._selfMapIdentifier);
        if (dims) {
          this._selfMapX = Math.max(0, Math.min(dims.width, this._selfMapX));
          this._selfMapY = Math.max(0, Math.min(dims.height, this._selfMapY));
        }

        // Send position to server ~3-4x per server tick (every ~30ms).
        // GameConnection records what was sent, keyed by the seq it stamps
        // on the message - see positionForMoveSeq/reconciledTarget above.
        if (this._onSelfPosition && time - this._lastPosSendTime >= 30) {
          this._onSelfPosition({ x: this._selfMapX, y: this._selfMapY });
          this._lastPosSendTime = time;
        }

        const [sx, sz] = this._toWorld(this._selfMapX, this._selfMapY);
        this._selfToken.position.set(sx, 0, sz);
        this._selfToken.rotation.y = -this._camFacing;
      }

      // Interpolate NPC tokens toward their server-side target positions.
      const f = elapsed > 0 ? 1 - Math.exp(-20 * elapsed) : 0;
      for (const { group, isSelf, targetX, targetZ, targetRotY } of this._tokenMap.values()) {
        if (isSelf) continue;
        group.position.x += (targetX - group.position.x) * f;
        group.position.z += (targetZ - group.position.z) * f;
        let dRot = targetRotY - group.rotation.y;
        if (dRot > Math.PI) dRot -= Math.PI * 2;
        if (dRot < -Math.PI) dRot += Math.PI * 2;
        group.rotation.y += dRot * f;
      }

      this._updateTargetVisuals();
      this._updateGraphicEffects(time);
      this._updateStatusAuras(time);
      this._updateLootBeams(time);
      this._positionCamera();
      this._renderer.render(this._scene, this._camera);
    };
    tick();
  }

  // effects: array of graphicEffect objects from the power config
  // positions: { self: {x,y}, target: {x,y}, selfId, targetId } in map coords.
  // selfId/targetId are server unit IDs - when present, a travelling effect
  // re-aims at that unit's live position every frame (see _updateGraphicEffects)
  // instead of the point it was at when the effect fired, so it doesn't visibly
  // whiff against a moving target.
  // baseUrl: used to resolve relative sourceURLs
  // travelOverrideMs: when the power has a `speed`, this is the computed
  // distance/speed travel time - it overrides a traveling effect's own
  // `duration` so its visual flight matches when it's actually due to arrive.
  // stockAssets: the {icons, graphics, sounds} shape from Content::StockAssets.client_json -
  // a ":name:" sourceURL resolves against this app's own origin instead of baseUrl.
  playGraphicEffects(effects, positions, baseUrl, travelOverrideMs = 0, stockAssets) {
    if (!this._selfMapIdentifier) return;
    const resolve = (key) => key === "self" ? positions.self : positions.target;
    const resolveId = (key) => key === "self" ? positions.selfId : positions.targetId;
    // A stationary (non-travelling) effect still faces self→target, so an
    // impact graphic points at whoever it's landing on rather than defaulting
    // to "north". Only meaningful when both parties are known.
    let facingHint = null;
    if (positions.self && positions.target) {
      const [sx, sz] = this._toWorld(positions.self.x, positions.self.y);
      const [tx, tz] = this._toWorld(positions.target.x, positions.target.y);
      facingHint = facingToward(sx, sz, tx, tz);
    }
    for (const effect of effects) {
      const fromKey = effect.from ?? "self";
      const toKey   = effect.to   ?? "affected";
      const fromRaw = resolve(fromKey);
      const toRaw   = resolve(toKey);
      if (!fromRaw || !toRaw) continue;
      // Anchor each endpoint at the edge of its own token nearest the other
      // party, rather than dead center, when we know that token's radius.
      const fromPos = edgeTowards(fromRaw, resolve(fromKey === "self" ? "affected" : "self"));
      const toPos   = edgeTowards(toRaw, resolve(toKey === "self" ? "affected" : "self"));
      const url = resolveStockAssetUrl(effect.sourceURL, "graphics", stockAssets) ?? new URL(effect.sourceURL, baseUrl).href;
      const [fromX, fromZ] = this._toWorld(fromPos.x, fromPos.y);
      const [toX,   toZ  ] = this._toWorld(toPos.x,   toPos.y);
      const track = { fromId: resolveId(fromKey), toId: resolveId(toKey) };
      this._spawnGraphicEffect(url, effect, fromX, fromZ, toX, toZ, travelOverrideMs, facingHint, track);
    }
  }

  // Sprite-sheet playback (spriteColumns/spriteRows/spriteFrameCount/spriteFrameRate)
  // runs at spriteFrameRate (fps, independent of `duration`) and loops for as long
  // as the effect is alive.
  _spawnGraphicEffect(url, effect, fromX, fromZ, toX, toZ, travelOverrideMs = 0, facingHint = null, track = null) {
    const { duration, color, scale = 1.0, opacity = 1.0, spriteColumns, spriteRows } = effect;
    const isSpriteSheet = spriteColumns > 0 && spriteRows > 0;
    const frameCount = effect.spriteFrameCount ?? (spriteColumns * spriteRows);
    const frameRate = effect.spriteFrameRate ?? DEFAULT_SPRITE_FRAME_RATE;

    new THREE.TextureLoader().load(url, (texture) => {
      if (isSpriteSheet) {
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.repeat.set(1 / spriteColumns, 1 / spriteRows);
        texture.offset.set(0, 1 - 1 / spriteRows);
      }

      const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity });
      if (color) mat.color.set(`#${color.replace(/^#/, "")}`);

      const plane = new THREE.Mesh(new THREE.PlaneGeometry(4 * scale, 4 * scale), mat);
      plane.rotation.x = -Math.PI / 2; // lie flat; image "up" faces -Z before the group rotates it

      const traveling = fromX !== toX || fromZ !== toZ;
      const angle = traveling ? facingToward(fromX, fromZ, toX, toZ) : (facingHint ?? 0);

      const group = new THREE.Group();
      group.add(plane);
      group.rotation.y = -angle;
      group.position.set(fromX, EFFECT_HEIGHT, fromZ);
      this._scene.add(group);

      // duration may be omitted on a travelling effect (see docs/schema/graphic_effect.md)
      // when the power sets `speed`, which is the normal case (travelOverrideMs > 0)
      // - the ?? 0 guard only matters for the degenerate case of a travelling effect
      // with neither speed nor duration, so it fades instantly rather than never.
      const durationMs = (traveling && travelOverrideMs > 0) ? travelOverrideMs : (duration ?? 0) * 1000;
      this._activeEffects.push({
        group, mat, texture, opacity,
        startedAt: performance.now(),
        durationMs,
        fadeStartMs: durationMs * 0.6,
        fromX, fromZ, toX, toZ,
        traveling,
        fromId: track?.fromId ?? null, toId: track?.toId ?? null,
        isSpriteSheet, spriteColumns, spriteRows, frameCount, frameRate,
      });
    });
  }

  _updateGraphicEffects(now) {
    this._activeEffects = this._activeEffects.filter(e => {
      const elapsed = now - e.startedAt;
      if (elapsed >= e.durationMs) {
        this._scene.remove(e.group);
        e.mat.dispose();
        e.texture?.dispose();
        return false;
      }
      // Re-aim at each tracked endpoint's live center (its token may have
      // moved since this effect fired) instead of a point frozen at spawn
      // time, so a travelling effect "homes in" rather than visibly missing.
      // The spawn-time edge anchor is deliberately dropped here: it was a
      // fixed offset pointing toward wherever the other party stood at
      // spawn, and dragging that stale direction along as the target moves
      // makes the effect look like it's swerving toward an arbitrary point
      // near the token's edge rather than tracking the target itself.
      if (e.traveling && e.fromId) {
        const entry = this._tokenMap.get(e.fromId);
        if (entry) {
          e.fromX = entry.group.position.x;
          e.fromZ = entry.group.position.z;
        }
      }
      if (e.traveling && e.toId) {
        const entry = this._tokenMap.get(e.toId);
        if (entry) {
          e.toX = entry.group.position.x;
          e.toZ = entry.group.position.z;
        }
      }
      const t = elapsed / e.durationMs;
      e.group.position.x = e.fromX + (e.toX - e.fromX) * t;
      e.group.position.z = e.fromZ + (e.toZ - e.fromZ) * t;
      if (e.traveling && (e.fromId || e.toId)) {
        e.group.rotation.y = -facingToward(e.fromX, e.fromZ, e.toX, e.toZ);
      }
      if (e.isSpriteSheet) {
        const frame = Math.floor((elapsed / 1000) * e.frameRate) % e.frameCount;
        const col = frame % e.spriteColumns;
        const row = Math.floor(frame / e.spriteColumns);
        e.texture.offset.set(col / e.spriteColumns, 1 - (row + 1) / e.spriteRows);
      }
      if (elapsed >= e.fadeStartMs) {
        e.mat.opacity = e.opacity * (1 - (elapsed - e.fadeStartMs) / (e.durationMs - e.fadeStartMs));
      }
      return true;
    });
  }

  isInView(mapX, mapY) {
    if (!this._selfMapIdentifier || !this._camera) return true;
    const [wx, wz] = this._toWorld(mapX, mapY);
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        this._camera.projectionMatrix,
        this._camera.matrixWorldInverse
      )
    );
    return frustum.containsPoint(new THREE.Vector3(wx, 0, wz));
  }

  handleResize() {
    const parent = this._canvas.parentElement;
    if (!parent) return;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    if (pw === 0 || ph === 0) return;
    const w = pw / ph > 4 / 3 ? Math.round(ph * 4 / 3) : pw;
    const h = pw / ph > 4 / 3 ? ph : Math.round(pw * 3 / 4);
    this._canvas.style.width = `${w}px`;
    this._canvas.style.height = `${h}px`;
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(w, h, false);
    this._camera.aspect = 4 / 3;
    this._camera.updateProjectionMatrix();
    // Canvas is letterboxed/pillarboxed (centered) within its parent at a
    // fixed 4:3 - report its actual on-screen rect so UI meant to sit
    // "inside the canvas" (not just inside the viewport) can position
    // itself against real edges instead of the screen's.
    this._onCanvasResize?.(this._canvas.getBoundingClientRect());
  }

  dispose() {
    if (this._animId) cancelAnimationFrame(this._animId);
    for (const aura of this._statusAuras.values()) {
      if (aura.plane) {
        aura.plane.removeFromParent();
        aura.mat.dispose();
        aura.texture?.dispose();
      }
    }
    this._statusAuras.clear();
    this._renderer.dispose();
  }

  _buildNPCArrow() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.75, depthTest: false, side: THREE.DoubleSide });

    // Body: 1 unit long on X (scaled at runtime), 0.15ft wide on Z, flat on ground.
    const bodyGeo = new THREE.BoxGeometry(1, 0.04, 0.15);
    bodyGeo.translate(0.5, 0, 0); // origin at start so scale.x = length
    const body = new THREE.Mesh(bodyGeo, mat);
    body.frustumCulled = false;

    // Head: cone pointing in +X (rotated from default +Y).
    const HEAD_LEN = 0.5, HEAD_R = 0.3;
    const headGeo = new THREE.ConeGeometry(HEAD_R, HEAD_LEN, 10);
    headGeo.rotateZ(-Math.PI / 2); // apex now at +X
    const head = new THREE.Mesh(headGeo, mat);
    head.frustumCulled = false;

    const group = new THREE.Group();
    group.add(body);
    group.add(head);
    group._body = body;
    group._head = head;
    group._headLen = HEAD_LEN;
    group.position.y = 0.05;
    group.visible = false;
    return group;
  }

  _updateNPCArrows() {
    const active = new Set();
    for (const [id, entry] of this._tokenMap) {
      if (entry.isSelf || !entry.targetUnitId) continue;
      const targetEntry = this._tokenMap.get(entry.targetUnitId);
      if (!targetEntry) continue;

      const npcX = entry.group.position.x, npcZ = entry.group.position.z;
      const tgX  = targetEntry.group.position.x, tgZ = targetEntry.group.position.z;
      const dx = tgX - npcX, dz = tgZ - npcZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.1) continue;

      active.add(id);

      let arrow = this._npcArrows.get(id);
      if (!arrow) {
        arrow = this._buildNPCArrow();
        this._scene.add(arrow);
        this._npcArrows.set(id, arrow);
      }

      const npcInfo    = this._unitInfo.get(entry.group._zoneUnitIdentifier);
      const npcRadius  = npcInfo?.tokenRadius ?? TOKEN_RADIUS;
      const targetInfo = this._unitInfo.get(targetEntry.group._zoneUnitIdentifier);
      const targetRadius = targetInfo?.tokenRadius ?? TOKEN_RADIUS;
      const startDist = npcRadius;
      const stopDist  = Math.max(startDist, dist - 1.5 * targetRadius);
      const bodyLen   = Math.max(0, stopDist - startDist - arrow._headLen);

      arrow.visible = true;
      arrow.position.set(npcX, 0.05, npcZ);
      arrow.rotation.y = Math.atan2(-dz, dx);
      arrow._body.position.x = startDist;
      arrow._body.scale.x = bodyLen > 0 ? bodyLen : 0.001;
      arrow._head.position.x = startDist + bodyLen + arrow._headLen / 2;
    }

    for (const [id, arrow] of this._npcArrows) {
      if (!active.has(id)) arrow.visible = false;
    }
  }

  _updateTargetVisuals() {
    this._updateNPCArrows();
    if (!this._targetId) return;
    const entry = this._tokenMap.get(this._targetId);
    if (!entry) return;

    const tx = entry.group.position.x;
    const tz = entry.group.position.z;
    const info = this._unitInfo.get(entry.group._zoneUnitIdentifier);
    const radius = info?.tokenRadius ?? TOKEN_RADIUS;

    // Snap ring to target token, scaled to its radius.
    this._targetRing.position.set(tx, 0.05, tz);
    this._targetRing.scale.setScalar(radius);

    // Dotted line: evenly-spaced round dots from self to target at token-center height.
    if (this._selfToken) {
      const sx = this._selfToken.position.x;
      const sz = this._selfToken.position.z;
      const dots = computeTargetLineDots(sx, sz, tx, tz, 2.0, this._targetLine._maxDots);
      const pos = this._targetLine.geometry.attributes.position;
      dots.forEach(([x, z], i) => pos.setXYZ(i, x, 0.15, z));
      pos.needsUpdate = true;
      this._targetLine.geometry.setDrawRange(0, dots.length);
    }
  }

  _positionCamera() {
    const s = this._camZoom;
    const fwdX = Math.sin(this._camFacing);
    const fwdZ = -Math.cos(this._camFacing);
    const horiz = s * CAM_RADIUS * Math.cos(this._camPitch);
    const vert = s * CAM_RADIUS * Math.sin(this._camPitch);
    const cx = this._selfToken?.position.x ?? 0;
    const cz = this._selfToken?.position.z ?? 0;
    this._camera.position.set(
      cx - horiz * fwdX,
      vert,
      cz - horiz * fwdZ
    );
    this._camera.lookAt(
      cx + s * CAM_LOOK_AHEAD * fwdX,
      0,
      cz + s * CAM_LOOK_AHEAD * fwdZ
    );
  }
}
