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
grubs.scale.setScalar(0.75)
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
skrit.scale.setScalar(0.75)
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
morg.scale.setScalar(0.75)
morg.position.set(-22, 0, 25)
scene.add(morg)

function createWallPath(points, { thickness = 1, height = 2, color = 0x333333 } = {}) {
  const half = thickness / 2

  const normals = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1][0] - points[i][0]
    const dz = points[i + 1][1] - points[i][1]
    const len = Math.sqrt(dx * dx + dz * dz)
    normals.push([-dz / len, dx / len])
  }

  function offsetAt(i, side) {
    let ox, oz
    if (i === 0) {
      ox = normals[0][0] * half; oz = normals[0][1] * half
    } else if (i === points.length - 1) {
      ox = normals[i - 1][0] * half; oz = normals[i - 1][1] * half
    } else {
      const [n0x, n0z] = normals[i - 1]
      const [n1x, n1z] = normals[i]
      const mx = n0x + n1x, mz = n0z + n1z
      const mlen = Math.sqrt(mx * mx + mz * mz)
      const dot = n0x * mx / mlen + n0z * mz / mlen
      ox = mx / mlen * half / dot; oz = mz / mlen * half / dot
    }
    return [points[i][0] + side * ox, points[i][1] + side * oz]
  }

  const shape = new THREE.Shape()
  for (let i = 0; i < points.length; i++) {
    const [x, z] = offsetAt(i, 1)
    if (i === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  }
  for (let i = points.length - 1; i >= 0; i--) {
    const [x, z] = offsetAt(i, -1)
    shape.lineTo(x, -z)
  }
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.5 })))
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x000000 })))
  group.rotation.x = -Math.PI / 2
  return group
}

scene.add(createWallPath([[-67.5,7.5],[-42.5,7.5],[-42.5,12.5],[-32.5,12.5],[-32.5,17.5],[-12.5,17.5],[-12.5,2.5],[2.5,2.5],[2.5,-17.5]]))
scene.add(createWallPath([[-42.5,42.5],[-42.5,32.5],[-32.5,32.5],[-32.5,27.5],[-12.5,27.5],[-12.5,32.5],[-2.5,32.5],[-2.5,52.5]]))
scene.add(createWallPath([[12.5,-17.5],[12.5,2.5],[27.5,2.5]]))

window.addEventListener("resize", fitToWindow)

function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
}
animate()
