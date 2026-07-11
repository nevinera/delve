import * as THREE from "three";
import { resolveBarrierCollisions } from "./collision.js";

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

function buildWall(worldPoints, { thickness = 0.4, height = 0.8, color = 0x333333, opacity = 0.4 } = {}) {
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

function createPlayerToken(radius, tokenUrl) {
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
  return group;
}

const HOSTILITY_COLORS = {
  hostile:  { body: 0xc62828, cone: 0xef9a9a },
  neutral:  { body: 0xe65100, cone: 0xffcc80 },
  friendly: { body: 0x1565c0, cone: 0x90caf9 },
};

function createNpcToken(radius, hostility, tokenImageUrl, zoneBaseUrl) {
  const { body: bodyColor, cone: coneColor } =
    HOSTILITY_COLORS[hostility] ?? HOSTILITY_COLORS.hostile;

  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.3, 32),
    new THREE.MeshLambertMaterial({ color: bodyColor })
  );
  body.position.y = 0.15;
  group.add(body);

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
  return group;
}

function markTokenDead(group, radius) {
  group.position.y = -0.15; // sink halfway into the floor

  const overlay = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.6 }),
  );
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.y = 0.32;
  group.add(overlay);

  const mat = new THREE.MeshBasicMaterial({ color: 0xaa1111 });
  const arm = new THREE.BoxGeometry(radius * 1.5, 0.12, radius * 0.22);
  const x1 = new THREE.Mesh(arm, mat);
  x1.position.y = 0.35;
  x1.rotation.y = Math.PI / 4;
  const x2 = new THREE.Mesh(arm, mat.clone());
  x2.position.y = 0.35;
  x2.rotation.y = -Math.PI / 4;
  group.add(x1, x2);
}

// ---------------------------------------------------------------------------
// SceneManager
// ---------------------------------------------------------------------------

export class SceneManager {
  constructor(canvas, { turnKeysRef, movementKeysRef, onFacingChange, onSelfPosition, onUnitClick } = {}) {
    this._canvas = canvas;
    this._turnKeysRef = turnKeysRef;
    this._movementKeysRef = movementKeysRef;
    this._onFacingChange = onFacingChange;
    this._onSelfPosition = onSelfPosition;
    this._onUnitClick = onUnitClick;
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

    // Targeting visuals
    this._targetId = null;
    this._targetRing = this._buildTargetRing();
    this._targetLine = this._buildTargetLine();
    this._scene.add(this._targetRing);
    this._scene.add(this._targetLine);
    this._npcArrows = new Map(); // unitId → arrow group

    // Client-side movement prediction for the self unit
    this._selfMapX = 0;
    this._selfMapY = 0;
    this._selfSpeed = BASE_PLAYER_SPEED; // updated from server unit state
    this._serverMapX = 0;
    this._serverMapY = 0;
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

  setTarget(id) {
    this._targetId = id;
    this._targetRing.visible = !!id;
    this._targetLine.visible = !!id;
  }

  _initMouseControls() {
    let downX = null, downY = null, lastX = null, lastY = null;
    this._canvas.addEventListener("mousedown", (e) => {
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    this._canvas.addEventListener("mousemove", (e) => {
      if (lastX === null) return;
      this._camFacing += (e.clientX - lastX) * 0.005;
      this._camPitch = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, this._camPitch + (e.clientY - lastY) * 0.005)
      );
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener("mouseup", (e) => {
      if (downX !== null) {
        const dx = e.clientX - downX, dy = e.clientY - downY;
        if (dx * dx + dy * dy < 9) this._handleClick(e);
      }
      downX = null; downY = null; lastX = null; lastY = null;
    });
    this._canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this._canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this._camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._camZoom + e.deltaY * 0.001));
    }, { passive: false });
  }

  _handleClick(e) {
    if (!this._onUnitClick) return;
    const rect = this._canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this._camera);

    // Collect all meshes from token groups, mapped back to their unit ID.
    const meshes = [];
    const meshToID = new Map();
    for (const [id, { group, isSelf }] of this._tokenMap) {
      if (isSelf) continue;
      group.traverse((obj) => {
        if (obj.isMesh) {
          meshes.push(obj);
          meshToID.set(obj.uuid, id);
        }
      });
    }

    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const id = meshToID.get(hits[0].object.uuid);
      if (id) { this._onUnitClick(id); return; }
    }
    this._onUnitClick(null); // clicked empty space - deselect
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
        new THREE.TextureLoader().load(mapUrl, (texture) => {
          const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshLambertMaterial({ map: texture })
          );
          plane.rotation.x = -Math.PI / 2;
          group.add(plane);
        });
      }

      for (const barrier of m.barriers ?? []) {
        if (barrier.type !== "wall") continue;
        const pts = barrier.locations.map(({ x, y }) => toWorld(x, y));
        group.add(buildWall(pts));
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

    const selfUnit = Object.values(units).find(
      (u) => u.zone_unit_identifier === selfIdentifier
    );
    const currentMap = selfUnit?.map_identifier;

    const seen = new Set();
    for (const [id, unit] of Object.entries(units)) {
      if (unit.map_identifier !== currentMap) continue;
      seen.add(id);
      const isSelf = unit.zone_unit_identifier === selfIdentifier;
      const [wx, wz] = this._toWorld(unit.position.x, unit.position.y);
      const angle = -(unit.position.angle * DEG);

      if (isSelf) {
        this._serverMapX = unit.position.x;
        this._serverMapY = unit.position.y;
        if (unit.map_identifier !== this._selfMapIdentifier) {
          for (const [mid, group] of this._mapGroups) {
            group.visible = mid === unit.map_identifier;
          }
          this._selfMapIdentifier = unit.map_identifier;
          this._selfMapX = unit.position.x;
          this._selfMapY = unit.position.y;
        }
        if (unit.speed) this._selfSpeed = unit.speed;
        if (!this._selfInitialized) {
          this._selfMapX = unit.position.x;
          this._selfMapY = unit.position.y;
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
        }
        if (!entry.dead && unit.status === "dead") {
          markTokenDead(entry.group, entry.radius);
          entry.dead = true;
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
        const dead = unit.status === "dead";
        if (dead) markTokenDead(group, radius);
        this._tokenMap.set(id, { group, isSelf, targetX: wx, targetZ: wz, targetRotY: angle, targetUnitId: unit.target ?? null, radius, dead });
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

      // Self unit: apply local movement prediction each frame.
      if (this._selfInitialized && this._selfToken) {
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
            const dist = this._selfSpeed * elapsed / mag;
            this._selfMapX += dx * dist;
            this._selfMapY += dy * dist;
            moved = true;
          }
        }
        if (!moved) {
          // Stopped: converge quickly to server-confirmed position.
          const cf = 1 - Math.exp(-10 * elapsed);
          this._selfMapX += (this._serverMapX - this._selfMapX) * cf;
          this._selfMapY += (this._serverMapY - this._selfMapY) * cf;
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
          this._selfMapX = Math.max(TOKEN_RADIUS, Math.min(dims.width - TOKEN_RADIUS, this._selfMapX));
          this._selfMapY = Math.max(TOKEN_RADIUS, Math.min(dims.height - TOKEN_RADIUS, this._selfMapY));
        }

        // Send position to server ~3-4x per server tick (every ~30ms).
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
      this._positionCamera();
      this._renderer.render(this._scene, this._camera);
    };
    tick();
  }

  // effects: array of graphicEffect objects from the power config
  // positions: { self: {x,y}, target: {x,y} } in map coords
  // baseUrl: used to resolve relative sourceURLs
  playGraphicEffects(effects, positions, baseUrl) {
    if (!this._selfMapIdentifier) return;
    for (const effect of effects) {
      const pos = effect.to === "self" ? positions.self : positions.target;
      if (!pos) continue;
      const url = new URL(effect.sourceURL, baseUrl).href;
      const [wx, wz] = this._toWorld(pos.x, pos.y);
      this._spawnGraphicEffect(url, effect.duration, wx, wz);
    }
  }

  _spawnGraphicEffect(url, duration, wx, wz) {
    new THREE.TextureLoader().load(url, (texture) => {
      const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(wx, 2.0, wz);
      sprite.scale.set(4, 4, 1);
      this._scene.add(sprite);
      const durationMs = duration * 1000;
      this._activeEffects.push({
        sprite, mat,
        startedAt: performance.now(),
        durationMs,
        fadeStartMs: durationMs * 0.6,
      });
    });
  }

  _updateGraphicEffects(now) {
    this._activeEffects = this._activeEffects.filter(e => {
      const elapsed = now - e.startedAt;
      if (elapsed >= e.durationMs) {
        this._scene.remove(e.sprite);
        e.mat.dispose();
        return false;
      }
      if (elapsed >= e.fadeStartMs) {
        e.mat.opacity = 1 - (elapsed - e.fadeStartMs) / (e.durationMs - e.fadeStartMs);
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
    const w = this._canvas.offsetWidth;
    const h = this._canvas.offsetHeight;
    if (w === 0 || h === 0) return;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  dispose() {
    if (this._animId) cancelAnimationFrame(this._animId);
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
      const dx = tx - sx, dz = tz - sz;
      const totalDist = Math.sqrt(dx * dx + dz * dz);
      const spacing = 2.0; // feet between dot centers
      const count = Math.min(Math.floor(totalDist / spacing) + 1, this._targetLine._maxDots);
      const pos = this._targetLine.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) : 0;
        pos.setXYZ(i, sx + dx * t, 0.15, sz + dz * t);
      }
      pos.needsUpdate = true;
      this._targetLine.geometry.setDrawRange(0, count);
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
