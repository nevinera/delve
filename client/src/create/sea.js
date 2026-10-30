import * as THREE from "three";
import { CHUNK_FT, PLATTER_FT } from "../v2/sizes.js";
import { withGrid } from "./grid.js";

// The open sea, a plane a little under sea level kept round the builder, showing where no ground's
// drawn. It's darker over platters with nothing in them, so you can see where the world ends.

const COLOR = 0x2e608c;
const EMPTY_SHADE = 0.55;
const AROUND = 8; // platters a side of the map of which have something in them

export class Sea {
  constructor(scene, size, renditions) {
    this.renditions = renditions;
    this.data = new Uint8Array(AROUND * AROUND);
    this.map = new THREE.DataTexture(this.data, AROUND, AROUND, THREE.RedFormat, THREE.UnsignedByteType);
    this.corner = new THREE.Vector2(); // the platter at the map's corner
    this.key = null;
    const material = new THREE.MeshLambertMaterial({ color: COLOR });
    material.customProgramCacheKey = () => "sea";
    material.onBeforeCompile = (shader) => {
      shader.uniforms.seaPlatters = { value: this.map };
      shader.uniforms.seaCorner = { value: this.corner };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vSeaXZ;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D seaPlatters;
          uniform vec2 seaCorner;
          varying vec2 vSeaXZ;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          vec2 platter = floor(vSeaXZ / ${PLATTER_FT.toFixed(1)}) - seaCorner;
          bool known = all(greaterThanEqual(platter, vec2(0.0))) && all(lessThan(platter, vec2(${AROUND}.0)));
          if (!known || texture2D(seaPlatters, (platter + 0.5) / ${AROUND}.0).r < 0.5) diffuseColor.rgb *= ${EMPTY_SHADE};`,
        );
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), withGrid(material, CHUNK_FT));
    this.mesh.rotation.x = -Math.PI / 2;
    scene.add(this.mesh);
  }

  // Keeps the sea round (x, z), at height y, and its map of platters up to date.
  tick(x, y, z) {
    this.mesh.position.set(x, y, z);
    const [cx, cz] = [Math.floor(x / PLATTER_FT) - AROUND / 2, Math.floor(z / PLATTER_FT) - AROUND / 2];
    const key = `${cx},${cz},${this.renditions.platters.size}`;
    if (key === this.key) return;
    this.key = key;
    this.corner.set(cx, cz);
    for (let j = 0; j < AROUND; j++) for (let i = 0; i < AROUND; i++) this.data[j * AROUND + i] = this.renditions.platters.has(`${cx + i},${cz + j}`) ? 255 : 0;
    this.map.needsUpdate = true;
  }
}
