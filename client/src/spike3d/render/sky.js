import * as THREE from "three";

// A gradient dome that follows the camera. Its horizon is the fog color,
// so terrain fades into it at the edge of vision.
export class Sky {
  constructor(parent) {
    this.uniforms = {uTop: {value: new THREE.Color()}, uHorizon: {value: new THREE.Color()}};
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon;
        varying vec3 vDir;
        void main() {
          float t = smoothstep(-0.02, 0.45, vDir.y);
          gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), material);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  update(camera, top, horizon) {
    this.mesh.position.copy(camera.position);
    this.uniforms.uTop.value.copy(top);
    this.uniforms.uHorizon.value.copy(horizon);
  }
}
