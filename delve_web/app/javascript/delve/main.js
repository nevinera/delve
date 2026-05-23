import * as THREE from "three"

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)
scene.fog = new THREE.Fog(0x87ceeb, 60, 150)

const ASPECT = 16 / 9

const camera = new THREE.PerspectiveCamera(48, ASPECT, 0.1, 500)
const CAM_LOOK_AT = new THREE.Vector3(0, 0, 25)
const CAM_ANGLE = 37 * Math.PI / 180
camera.position.set(
  45 * Math.sin(CAM_ANGLE),
  50,
  25 + 45 * Math.cos(CAM_ANGLE)
)
camera.lookAt(CAM_LOOK_AT)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
document.body.appendChild(renderer.domElement)

function fitToWindow() {
  if (window.innerWidth / window.innerHeight > ASPECT) {
    const height = window.innerHeight
    renderer.setSize(Math.round(height * ASPECT), height)
  } else {
    const width = window.innerWidth
    renderer.setSize(width, Math.round(width / ASPECT))
  }
}
fitToWindow()

const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
sunLight.position.set(5, 10, 5)
scene.add(sunLight)
scene.add(new THREE.AmbientLight(0xffffff, 0.4))

const dungeonUrl = document.querySelector('meta[name="dungeon-url"]').content
const texture = new THREE.TextureLoader().load(dungeonUrl)

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(225, 185),
  new THREE.MeshLambertMaterial({ map: texture })
)
plane.rotation.x = -Math.PI / 2
plane.position.set(-20, 0, 10)
scene.add(plane)

const token = new THREE.Mesh(
  new THREE.CylinderGeometry(1.5, 1.5, 1, 32),
  new THREE.MeshLambertMaterial({ color: 0x8888ff })
)
token.position.set(0, 0.5, 25)
scene.add(token)

window.addEventListener("resize", fitToWindow)

function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
}
animate()
