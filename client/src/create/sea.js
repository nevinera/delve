import * as THREE from "three";
import { CHUNK_FT, PLATE_TILES, PLATTER_TILES, TILE_FT } from "../v2/sizes.js";
import { withGrid } from "./grid.js";

// The open sea, a plane a little under sea level kept round the builder, showing where no ground's
// drawn. Where there's nothing it's darker, the more so the bigger the nothing: darkest over a
// platter with nothing in it, less over an empty plate, and a little over an empty tile.

const COLOR = 0x2e608c;
const SHADES = [0.55, 0.7, 0.85, 1]; // over an empty platter, plate and tile, and over a tile
const AROUND = 256; // tiles a side of the map of what's there, kept round the builder
const RECENTER = 16; // how many tiles the builder goes from the map's middle before it's made again
const NEW_TILES_MS = 500; // how long new tiles wait to be shown on the map, while a brush makes them

export class Sea {
  constructor(scene, size, renditions) {
    this.renditions = renditions;
    this.data = new Uint8Array(AROUND * AROUND);
    this.map = new THREE.DataTexture(this.data, AROUND, AROUND, THREE.RedFormat, THREE.UnsignedByteType);
    this.corner = new THREE.Vector2(); // the tile at the map's corner
    this.middle = null;
    this.key = null;
    this.made = 0; // when the map was last made
    const material = new THREE.MeshLambertMaterial({ color: COLOR });
    material.customProgramCacheKey = () => "sea";
    material.onBeforeCompile = (shader) => {
      shader.uniforms.seaTiles = { value: this.map };
      shader.uniforms.seaCorner = { value: this.corner };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vSeaXZ;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D seaTiles;
          uniform vec2 seaCorner;
          varying vec2 vSeaXZ;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          vec2 tile = floor(vSeaXZ / ${TILE_FT.toFixed(1)}) - seaCorner;
          bool known = all(greaterThanEqual(tile, vec2(0.0))) && all(lessThan(tile, vec2(${AROUND}.0)));
          int there = known ? int(texture2D(seaTiles, (tile + 0.5) / ${AROUND}.0).r * 3.0 + 0.5) : 0;
          const float SHADES[4] = float[](${SHADES.map((s) => s.toFixed(2)).join(", ")});
          diffuseColor.rgb *= SHADES[there];`,
        );
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), withGrid(material, CHUNK_FT));
    this.mesh.rotation.x = -Math.PI / 2;
    scene.add(this.mesh);
  }

  // Keeps the sea round (x, z), at height y, and its map of what's there up to date.
  tick(x, y, z) {
    this.mesh.position.set(x, y, z);
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    if (!this.middle || Math.abs(tx - this.middle[0]) > RECENTER || Math.abs(tz - this.middle[1]) > RECENTER) this.middle = [tx, tz];
    const r = this.renditions;
    const key = `${this.middle},${r.platters.size},${r.layout}`;
    if (key === this.key) return;
    const now = performance.now();
    if (this.key?.startsWith(`${this.middle},${r.platters.size},`) && now - this.made < NEW_TILES_MS) return;
    this.key = key;
    this.made = now;
    const [cx, cz] = [this.middle[0] - AROUND / 2, this.middle[1] - AROUND / 2];
    this.corner.set(cx, cz);
    for (let j = 0; j < AROUND; j++) {
      for (let i = 0; i < AROUND; i++) {
        const [a, b] = [cx + i, cz + j];
        let there = 0;
        if (r.platters.has(`${Math.floor(a / PLATTER_TILES)},${Math.floor(b / PLATTER_TILES)}`)) there = r.tile(a, b) ? 3 : r.plate(Math.floor(a / PLATE_TILES), Math.floor(b / PLATE_TILES)) ? 2 : 1;
        this.data[j * AROUND + i] = there * 85;
      }
    }
    this.map.needsUpdate = true;
  }
}
