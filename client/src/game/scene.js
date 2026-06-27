import * as THREE from "three";

const DEG = Math.PI / 180;
const TOKEN_RADIUS = 2.2;
const CAM_BACK = 45;
const CAM_HEIGHT = 50;
const CAM_RADIUS = Math.sqrt(CAM_BACK ** 2 + CAM_HEIGHT ** 2);
const CAM_LOOK_AHEAD = 10;
const TURN_RATE = 120 * DEG; // radians/sec
const PITCH_MIN = 20 * DEG;
const PITCH_MAX = 60 * DEG;

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

// ---------------------------------------------------------------------------
// SceneManager
// ---------------------------------------------------------------------------

export class SceneManager {
  constructor(canvas, { turnKeysRef, onFacingChange } = {}) {
    this._canvas = canvas;
    this._turnKeysRef = turnKeysRef;
    this._onFacingChange = onFacingChange;

    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x000000);
    this._scene.fog = new THREE.Fog(0x000000, 60, 150);
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(5, 10, 5);
    this._scene.add(sun);

    this._camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);

    this._tokenMap = new Map();
    this._mapToWorld = null;
    this._zoneBaseUrl = null;
    this._unitInfo = new Map();
    this._animId = null;

    // Camera state — client-owned; position synced from server, facing/pitch local
    this._camX = 0;
    this._camZ = 0;
    this._camFacing = 0; // radians
    this._camPitch = Math.atan2(CAM_HEIGHT, CAM_BACK); // radians

    this._initMouseDrag();
  }

  _initMouseDrag() {
    let lastX = null, lastY = null;
    this._canvas.addEventListener("mousedown", (e) => {
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
    window.addEventListener("mouseup", () => { lastX = null; lastY = null; });
    this._canvas.addEventListener("contextmenu", (e) => e.preventDefault());
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

    const map = json.maps?.[0];
    if (!map) return;

    const { width, height } = map.feetDimensions;
    const originX = -width / 2;
    const originZ = height / 2;
    this._mapToWorld = (x, y) => [x + originX, originZ - y];

    const baseUrl = new URL(".", url).href;
    this._zoneBaseUrl = baseUrl;

    // Build lookup across all maps: zone_unit_identifier → { tokenImageUrl, hostility, tokenRadius }
    const unitTypes = json.unitTypes ?? {};
    for (const m of json.maps ?? []) {
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

    if (map.imageUrl) {
      const mapUrl = new URL(map.imageUrl, baseUrl).href;
      new THREE.TextureLoader().load(mapUrl, (texture) => {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(width, height),
          new THREE.MeshLambertMaterial({ map: texture })
        );
        plane.rotation.x = -Math.PI / 2;
        this._scene.add(plane);
      });
    }

    for (const barrier of map.barriers ?? []) {
      if (barrier.type !== "wall") continue;
      const pts = barrier.locations.map(({ x, y }) => this._mapToWorld(x, y));
      this._scene.add(buildWall(pts));
    }

    for (const conn of map.connections ?? []) {
      if (conn.type === "line") {
        const pts = [conn.start, conn.end].map(({ x, y }) => this._mapToWorld(x, y));
        this._scene.add(buildWall(pts, { color: 0xff00ff, opacity: 0.4 }));
      }
    }
  }

  updateUnits(units, selfIdentifier, characterTokenUrl) {
    if (!this._mapToWorld) return;

    const selfUnit = Object.values(units).find(
      (u) => u.zone_unit_identifier === selfIdentifier
    );
    const currentMap = selfUnit?.map_identifier;

    const seen = new Set();
    for (const [id, unit] of Object.entries(units)) {
      if (unit.map_identifier !== currentMap) continue;
      seen.add(id);
      const isSelf = unit.zone_unit_identifier === selfIdentifier;
      const [wx, wz] = this._mapToWorld(unit.position.x, unit.position.y);
      const angle = -(unit.position.angle * DEG);

      if (this._tokenMap.has(id)) {
        const { group } = this._tokenMap.get(id);
        group.position.set(wx, 0, wz);
        group.rotation.y = angle;
      } else {
        const info = this._unitInfo.get(unit.zone_unit_identifier);
        const radius = info?.tokenRadius ?? TOKEN_RADIUS;
        const group = isSelf
          ? createPlayerToken(radius, characterTokenUrl)
          : createNpcToken(radius, info?.hostility, info?.tokenImageUrl, this._zoneBaseUrl);
        group.position.set(wx, 0, wz);
        group.rotation.y = angle;
        this._scene.add(group);
        this._tokenMap.set(id, { group, isSelf });
      }

      if (isSelf) {
        this._camX = wx;
        this._camZ = wz;
      }
    }

    for (const [id, { group }] of this._tokenMap) {
      if (!seen.has(id)) {
        this._scene.remove(group);
        this._tokenMap.delete(id);
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

      this._positionCamera();
      this._renderer.render(this._scene, this._camera);
    };
    tick();
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

  _positionCamera() {
    const fwdX = Math.sin(this._camFacing);
    const fwdZ = -Math.cos(this._camFacing);
    const horiz = CAM_RADIUS * Math.cos(this._camPitch);
    const vert = CAM_RADIUS * Math.sin(this._camPitch);
    this._camera.position.set(
      this._camX - horiz * fwdX,
      vert,
      this._camZ - horiz * fwdZ
    );
    this._camera.lookAt(
      this._camX + CAM_LOOK_AHEAD * fwdX,
      0,
      this._camZ + CAM_LOOK_AHEAD * fwdZ
    );
  }
}
