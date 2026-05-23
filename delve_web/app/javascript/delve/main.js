import * as THREE from "three"
import { createToken } from "delve/token"

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)
scene.fog = new THREE.Fog(0x87ceeb, 60, 150)

const ASPECT = 16 / 9

const camera = new THREE.PerspectiveCamera(34, ASPECT, 0.1, 500)
const CAM_ANGLE = 37 * Math.PI / 180
const CAM_ORBIT_RADIUS = 45
// lookAt is shifted forward from the token so it appears in the lower portion of the screen
const CAM_LOOK_AT = new THREE.Vector3(
  -10 * Math.sin(CAM_ANGLE),
  0,
  25 - 10 * Math.cos(CAM_ANGLE)
)
camera.position.set(
  CAM_LOOK_AT.x + CAM_ORBIT_RADIUS * Math.sin(CAM_ANGLE),
  50,
  CAM_LOOK_AT.z + CAM_ORBIT_RADIUS * Math.cos(CAM_ANGLE)
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

const loader = new THREE.TextureLoader()

const dungeonTexture = loader.load(document.querySelector('meta[name="dungeon-url"]').content)
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(225, 185),
  new THREE.MeshLambertMaterial({ map: dungeonTexture })
)
plane.rotation.x = -Math.PI / 2
plane.position.set(-20, 0, 10)
scene.add(plane)

const tyllani = createToken({
  color: 0x228b22,
  name: 'Tyllani',
  texture: loader.load(document.querySelector('meta[name="token-url"]').content),
  diameter: 3,
  camAngle: CAM_ANGLE,
  health: 0.85
})
tyllani.position.set(0, 0, 25)
scene.add(tyllani)

const goblinColor = 0x8B2500

const grubs = createToken({
  color: goblinColor,
  name: 'Goblin Raider',
  texture: loader.load(document.querySelector('meta[name="goblin-green-url"]').content),
  diameter: 3,
  camAngle: CAM_ANGLE,
  health: 0.7,
  facing: Math.atan2(0 - (-1.3), -(25 - 21.8))
})
grubs.position.set(-1.3, 0, 21.8)
scene.add(grubs)

const skrit = createToken({
  color: goblinColor,
  name: 'Goblin Raider',
  texture: loader.load(document.querySelector('meta[name="goblin-red-url"]').content),
  diameter: 3,
  camAngle: CAM_ANGLE,
  health: 1.0,
  facing: Math.atan2(0 - (-3.7), -(25 - 23.5))
})
skrit.position.set(-3.7, 0, 23.5)
scene.add(skrit)

const morg = createToken({
  color: goblinColor,
  name: 'Goblin Archer',
  texture: loader.load(document.querySelector('meta[name="goblin-yellow-url"]').content),
  diameter: 3,
  camAngle: CAM_ANGLE,
  health: 0.4,
  facing: Math.PI / 2
})
morg.position.set(-22, 0, 25)
scene.add(morg)

function createWall(x1, z1, x2, z2, { thickness = 1, height = 2, color = 0x333333 } = {}) {
  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.sqrt(dx * dx + dz * dz)
  const geo = new THREE.BoxGeometry(thickness, height, length)
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.5 })))
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x000000 })))
  group.rotation.y = Math.atan2(dx, dz)
  group.position.set((x1 + x2) / 2, height / 2, (z1 + z2) / 2)
  return group
}


scene.add(createWall(-42.5, 7.5, -67.5, 7.5))
scene.add(createWall(-42.5, 12.5, -42.5, 7.5))
scene.add(createWall(-32.5, 12.5, -42.5, 12.5))
scene.add(createWall(-32.5, 17.5, -32.5, 12.5))
scene.add(createWall(-12.5, 17.5, -32.5, 17.5))
scene.add(createWall(-12.5, 2.5, -12.5, 17.5))
scene.add(createWall(-12.5, 2.5, 2.5, 2.5))
scene.add(createWall(2.5, 2.5, 2.5, -17.5))

scene.add(createWall(-42.5, 32.5, -42.5, 42.5))
scene.add(createWall(-32.5, 32.5, -42.5, 32.5))
scene.add(createWall(-32.5, 27.5, -32.5, 32.5))
scene.add(createWall(-12.5, 27.5, -32.5, 27.5))
scene.add(createWall(-12.5, 27.5, -12.5, 32.5))
scene.add(createWall(-12.5, 32.5, -2.5, 32.5))
scene.add(createWall(-2.5, 32.5, -2.5, 52.5))

scene.add(createWall(12.5, 2.5, 12.5, -17.5))
scene.add(createWall(12.5, 2.5, 27.5, 2.5))

window.addEventListener("resize", fitToWindow)

function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
}
animate()
