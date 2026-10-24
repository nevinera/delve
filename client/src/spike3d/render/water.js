import * as THREE from "three";

const SEGMENTS = 96;

// One flat water sheet over the whole world, with a per-vertex swampiness
// that turns it from clear blue to murky green-brown.
export class Water {
  constructor(world, parent) {
    this.world = world;
    const geo = new THREE.PlaneGeometry(world.widthFt, world.depthFt, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    geo.translate(world.widthFt / 2, world.waterLevel, world.depthFt / 2);
    geo.setAttribute("aSwamp", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {uTime: {value: 0}}]);
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: true,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aSwamp;
        varying float vSwamp;
        varying vec3 vW;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          vSwamp = aSwamp;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime;
        varying float vSwamp;
        varying vec3 vW;
        #include <common>
        #include <fog_pars_fragment>
        float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 p = vW.xz;
          float speed = 1.0 - vSwamp * 0.8;
          float r = wNoise(p * 0.09 + vec2(uTime * 0.06, uTime * 0.035) * speed)
                  + 0.5 * wNoise(p * 0.23 - vec2(uTime * 0.08, -uTime * 0.02) * speed);
          r /= 1.5;
          float glint = smoothstep(0.72, 0.8, r) * (1.0 - vSwamp);
          vec3 clear = mix(vec3(0.15, 0.4, 0.52), vec3(0.32, 0.6, 0.68), r) + glint * 0.35;
          vec3 murky = mix(vec3(0.18, 0.21, 0.11), vec3(0.3, 0.32, 0.17), r);
          vec3 c = pow(mix(clear, murky, vSwamp), vec3(2.2));
          gl_FragColor = vec4(c, mix(0.62, 0.88, vSwamp));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
    this.refreshTheme();
  }

  refreshTheme() {
    const geo = this.mesh.geometry;
    const pos = geo.attributes.position;
    const sw = geo.attributes.aSwamp;
    for (let i = 0; i < pos.count; i++) sw.array[i] = this.world.swampAt(pos.getX(i), pos.getZ(i));
    sw.needsUpdate = true;
  }

  update(time) {
    this.uniforms.uTime.value = time;
  }
}
