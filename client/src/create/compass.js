import * as THREE from "three";

// N, E, S and W drawn just over the horizon each way, and the 16 points of the compass to say which
// way a yaw faces. North is -z and east +x.

const AWAY_FT = 20000; // how far off the letters are drawn, under the camera's far plane
const RISE = 0.06; // how far over the horizon, as a share of AWAY_FT
const SIZE = 0.05; // the letters' height, as a share of the view's
const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

// Which of the 16 points the builder faces at `yaw` (moveBuilder's: 0 faces +z, south).
export function facing(yaw) {
  const bearing = Math.atan2(Math.sin(yaw), -Math.cos(yaw)); // clockwise from north
  return POINTS[Math.round((bearing / (2 * Math.PI)) * 16 + 16) % 16];
}

function letter(text) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  g.font = "bold 48px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(20, 20, 28, 0.8)";
  g.strokeText(text, 32, 34);
  g.fillStyle = text === "N" ? "#ffe9a0" : "#f4f0e6";
  g.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, fog: false, sizeAttenuation: false }));
  sprite.scale.set(SIZE, SIZE, 1);
  sprite.renderOrder = 11;
  return sprite;
}

export class Compass {
  constructor(scene) {
    this.letters = [
      ["N", 0, -1],
      ["E", 1, 0],
      ["S", 0, 1],
      ["W", -1, 0],
    ].map(([text, dx, dz]) => {
      const sprite = letter(text);
      scene.add(sprite);
      return { sprite, dx, dz };
    });
  }

  // Keeps the letters round the camera.
  tick(camera) {
    const { x, y, z } = camera.position;
    for (const { sprite, dx, dz } of this.letters) sprite.position.set(x + dx * AWAY_FT, y + RISE * AWAY_FT, z + dz * AWAY_FT);
  }
}
