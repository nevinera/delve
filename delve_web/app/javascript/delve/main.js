import * as THREE from "three"
import { TokenDescriptor } from "delve/rendering/token_descriptor"
import { WallDescriptor, ZoneDescriptor } from "delve/rendering/zone_descriptor"
import { renderToken } from "delve/rendering/token"
import { renderZone } from "delve/rendering/zone"

// Map coordinates: origin at lower-left, y increasing northward.
// World coordinates: origin at scene center, z increasing southward.
// These constants place the map's lower-left corner in world space.
const MAP_ORIGIN_X = -132.5
const MAP_ORIGIN_Z = 102.5
function mapToWorld(x, y) { return [x + MAP_ORIGIN_X, MAP_ORIGIN_Z - y] }

const zoneUrl = document.querySelector('meta[name="zone-url"]').content
const zoneBase = zoneUrl.substring(0, zoneUrl.lastIndexOf('/') + 1)
const zone = await fetch(zoneUrl).then(r => r.json())
function assetUrl(path) { return zoneBase + path }

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)
scene.fog = new THREE.Fog(0x87ceeb, 60, 150)

const ASPECT = 16 / 9
const camera = new THREE.PerspectiveCamera(34, ASPECT, 0.1, 500)
const CAM_ANGLE = 37 * Math.PI / 180
const CAM_ORBIT_RADIUS = 45
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

const dungeonTexture = loader.load(assetUrl(zone.mapUrl))
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(zone.dimensions.width, zone.dimensions.height),
  new THREE.MeshLambertMaterial({ map: dungeonTexture })
)
plane.rotation.x = -Math.PI / 2
plane.position.set(MAP_ORIGIN_X + zone.dimensions.width / 2, 0, MAP_ORIGIN_Z - zone.dimensions.height / 2)
scene.add(plane)

scene.add(renderZone(new ZoneDescriptor(
  zone.walls.map(path => new WallDescriptor(path.map(({ x, y }) => mapToWorld(x, y))))
)))

for (const unit of zone.units) {
  const [wx, wz] = mapToWorld(unit.location.x, unit.location.y)
  const currentHP = unit.currentHP ?? unit.maxHP
  const token = renderToken(
    new TokenDescriptor({
      color: parseInt(unit.tokenColor.slice(1), 16),
      name: unit.name,
      diameter: 3,
      camAngle: CAM_ANGLE,
      health: currentHP / unit.maxHP,
      facing: unit.facingAngle ?? null
    }),
    loader.load(assetUrl(unit.tokenImageUrl))
  )
  token.scale.setScalar(unit.tokenScale ?? 1.0)
  token.position.set(wx, 0, wz)
  scene.add(token)
}

window.addEventListener("resize", fitToWindow)

function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
}
animate()
