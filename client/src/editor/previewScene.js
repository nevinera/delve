// A minimal, standalone Three.js scene for previewing a single ability: a
// ground plane and two tokens (self/target) with no map, no other units, and
// no server connection. Ported from tools/ability.html's scene code (not the
// real game's SceneManager in game/scene.js, which is tightly coupled to
// full gameplay state) so this stays a lightweight preview, not a second
// game client.
import * as THREE from "three";

const DEG_TO_RAD = Math.PI / 180;
const CAM_BACK = 45 * 0.7;
const CAM_HEIGHT = 50 * 0.7;
const CAM_RADIUS = Math.sqrt(CAM_BACK * CAM_BACK + CAM_HEIGHT * CAM_HEIGHT);
const PITCH_MIN = 20 * DEG_TO_RAD;
const PITCH_MAX = 60 * DEG_TO_RAD;
// Same limits/rate as the real client's scroll-zoom (game/scene.js ZOOM_MIN/ZOOM_MAX/wheel handler).
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_RATE = 0.001;
const EFFECT_HEIGHT = 0.4;
const DEFAULT_SPRITE_FRAME_RATE = 8;

function addFacingArrow(group, radius, color) {
  const hw = (0.3 * radius) / Math.sqrt(3);
  const y = 0.31;
  const verts = [0, y, -1.4 * radius, -hw, y, -1.1 * radius, hw, y, -1.1 * radius];
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  fillGeo.setIndex([0, 1, 2]);
  fillGeo.computeVertexNormals();
  group.add(new THREE.Mesh(fillGeo, new THREE.MeshLambertMaterial({color, side: THREE.DoubleSide})));

  const borderVerts = verts.map((v, i) => (i % 3 === 1 ? v + 0.005 : v));
  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute("position", new THREE.Float32BufferAttribute(borderVerts, 3));
  group.add(new THREE.LineLoop(borderGeo, new THREE.LineBasicMaterial({color: 0x000000})));
}

function createToken(radius, bodyColor, arrowColor) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.3, 32),
    new THREE.MeshLambertMaterial({color: bodyColor})
  );
  body.position.y = 0.15;
  group.add(body);

  const portraitMat = new THREE.MeshLambertMaterial({color: 0xffffff});
  const portrait = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.8, 32), portraitMat);
  portrait.rotation.x = -Math.PI / 2;
  portrait.position.y = 0.31;
  group.add(portrait);
  group._portraitMat = portraitMat;

  addFacingArrow(group, radius, arrowColor);
  return group;
}

function facingToward(x1, z1, x2, z2) {
  return Math.atan2(x2 - x1, -(z2 - z1));
}

export class PreviewSceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.activeEffects = [];
    this.orbit = {azimuth: Math.PI / 4, pitch: Math.atan2(CAM_HEIGHT, CAM_BACK)};
    this.zoom = 1.0;
    this.targetDistanceFt = 5;

    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14181c);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(5, 10, 5);
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({color: 0x4d6b4d}));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.scene.add(new THREE.GridHelper(200, 40, 0x8a8a8a, 0x5a5a5a));

    this.camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 1000);

    this.selfToken = createToken(2.2, 0x2e7d32, 0x81c784);
    this.scene.add(this.selfToken);
    this.targetToken = createToken(2.0, 0xc62828, 0xef9a9a);
    this.targetToken.rotation.y = Math.PI;
    this.scene.add(this.targetToken);

    this._bindEvents();
    this.setTargetDistance(this.targetDistanceFt);
    this._positionCamera();
  }

  handleResize() {
    const aspect = 4 / 3;
    const parent = this.canvas.parentElement;
    const aw = parent.clientWidth, ah = parent.clientHeight;
    const w = aw / ah > aspect ? Math.round(ah * aspect) : aw;
    const h = aw / ah > aspect ? ah : Math.round(aw / aspect);
    this.renderer.setSize(w, h);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setTokenUrls(selfUrl, targetUrl) {
    this._loadTokenTexture(this.selfToken, selfUrl);
    this._loadTokenTexture(this.targetToken, targetUrl);
  }

  _loadTokenTexture(tokenGroup, url) {
    if (!url) return;
    new THREE.TextureLoader().load(url, (texture) => {
      tokenGroup._portraitMat.map = texture;
      tokenGroup._portraitMat.needsUpdate = true;
    });
  }

  setTargetDistance(ft) {
    this.targetDistanceFt = ft;
    this.targetToken.position.set(0, 0, -ft);
    this._positionCamera();
  }

  positions() {
    return {self: {x: this.selfToken.position.x, y: this.selfToken.position.z}, target: {x: this.targetToken.position.x, y: this.targetToken.position.z}};
  }

  _positionCamera() {
    const radius = (CAM_RADIUS + this.targetDistanceFt * 0.6) * this.zoom;
    const horiz = radius * Math.cos(this.orbit.pitch);
    const height = radius * Math.sin(this.orbit.pitch);
    this.camera.position.set(Math.sin(this.orbit.azimuth) * horiz, height, Math.cos(this.orbit.azimuth) * horiz);
    this.camera.lookAt(0, 1.5, 0);
  }

  _bindEvents() {
    this._onResize = () => this.handleResize();
    window.addEventListener("resize", this._onResize);

    this._dragLast = null;
    this._onMouseDown = (e) => {
      this._dragLast = {x: e.clientX, y: e.clientY};
    };
    this._onMouseMove = (e) => {
      if (!this._dragLast) return;
      this.orbit.azimuth -= (e.clientX - this._dragLast.x) * 0.008;
      this.orbit.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.orbit.pitch + (e.clientY - this._dragLast.y) * 0.008));
      this._dragLast = {x: e.clientX, y: e.clientY};
      this._positionCamera();
    };
    this._onMouseUp = () => {
      this._dragLast = null;
    };
    this._onContextMenu = (e) => e.preventDefault();
    this._onWheel = (e) => {
      e.preventDefault();
      this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom + e.deltaY * ZOOM_RATE));
      this._positionCamera();
    };

    this.canvas.addEventListener("mousedown", this._onMouseDown);
    this.canvas.addEventListener("contextmenu", this._onContextMenu);
    this.canvas.addEventListener("wheel", this._onWheel, {passive: false});
    window.addEventListener("mousemove", this._onMouseMove);
    window.addEventListener("mouseup", this._onMouseUp);
  }

  startLoop() {
    const animate = (time) => {
      this._frame = requestAnimationFrame(animate);
      this._updateGraphicEffects(time);
      this.renderer.render(this.scene, this.camera);
    };
    this._frame = requestAnimationFrame(animate);
  }

  dispose() {
    cancelAnimationFrame(this._frame);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("mousemove", this._onMouseMove);
    window.removeEventListener("mouseup", this._onMouseUp);
    this.canvas.removeEventListener("mousedown", this._onMouseDown);
    this.canvas.removeEventListener("contextmenu", this._onContextMenu);
    this.canvas.removeEventListener("wheel", this._onWheel);
    this.renderer.dispose();
  }

  // Matches the (effects, positions, baseUrl, travelOverrideMs) signature
  // game/effectPlayback.js's firePowerEffects expects from a sceneManager.
  playGraphicEffects(effects, positions, baseUrl, travelOverrideMs = 0) {
    const threePositions = {
      self: this.selfToken.position,
      affected: this.targetToken.position,
    };
    for (const effect of effects) {
      const fromPos = threePositions[effect.from] ?? threePositions.self;
      const toPos = threePositions[effect.to] ?? fromPos;
      const url = new URL(effect.sourceURL, baseUrl).href;
      this._spawnGraphicEffect(url, effect, fromPos, toPos, travelOverrideMs);
    }
  }

  _spawnGraphicEffect(url, effect, fromPos, toPos, travelOverrideMs) {
    const {duration, color, scale = 1.0, opacity = 1.0, spriteColumns, spriteRows} = effect;
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

      const mat = new THREE.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false, opacity});
      if (color) mat.color.set(`#${color.replace(/^#/, "")}`);

      const plane = new THREE.Mesh(new THREE.PlaneGeometry(4 * scale, 4 * scale), mat);
      plane.rotation.x = -Math.PI / 2;

      const traveling = fromPos.x !== toPos.x || fromPos.z !== toPos.z;
      const angle = traveling ? facingToward(fromPos.x, fromPos.z, toPos.x, toPos.z) : 0;

      const group = new THREE.Group();
      group.add(plane);
      group.rotation.y = -angle;
      group.position.set(fromPos.x, EFFECT_HEIGHT, fromPos.z);
      this.scene.add(group);

      const durationMs = (traveling && travelOverrideMs > 0) ? travelOverrideMs : duration * 1000;
      this.activeEffects.push({
        group, mat, texture, opacity,
        startedAt: performance.now(),
        durationMs,
        fadeStartMs: durationMs * 0.6,
        fromX: fromPos.x, fromZ: fromPos.z, toX: toPos.x, toZ: toPos.z,
        isSpriteSheet, spriteColumns, spriteRows, frameCount, frameRate,
      });
    });
  }

  _updateGraphicEffects(now) {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const e = this.activeEffects[i];
      const elapsed = now - e.startedAt;
      if (elapsed >= e.durationMs) {
        this.scene.remove(e.group);
        e.mat.dispose();
        e.texture.dispose();
        this.activeEffects.splice(i, 1);
        continue;
      }
      const t = elapsed / e.durationMs;
      e.group.position.x = e.fromX + (e.toX - e.fromX) * t;
      e.group.position.z = e.fromZ + (e.toZ - e.fromZ) * t;
      if (e.isSpriteSheet) {
        const frame = Math.floor((elapsed / 1000) * e.frameRate) % e.frameCount;
        const col = frame % e.spriteColumns;
        const row = Math.floor(frame / e.spriteColumns);
        e.texture.offset.set(col / e.spriteColumns, 1 - (row + 1) / e.spriteRows);
      }
      if (elapsed >= e.fadeStartMs) {
        e.mat.opacity = e.opacity * (1 - (elapsed - e.fadeStartMs) / (e.durationMs - e.fadeStartMs));
      }
    }
  }
}
