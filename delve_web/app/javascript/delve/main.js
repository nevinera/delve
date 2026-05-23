import * as THREE from "three"

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

const dungeonUrl = document.querySelector('meta[name="dungeon-url"]').content
const texture = new THREE.TextureLoader().load(dungeonUrl)

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(225, 185),
  new THREE.MeshLambertMaterial({ map: texture })
)
plane.rotation.x = -Math.PI / 2
plane.position.set(-20, 0, 10)
scene.add(plane)

const tokenUrl = document.querySelector('meta[name="token-url"]').content
const tokenTexture = new THREE.TextureLoader().load(tokenUrl)

const token = new THREE.Group()
token.position.set(0, 0.5, 25)
scene.add(token)

token.add(new THREE.Mesh(
  new THREE.CylinderGeometry(1.5, 1.5, 1, 32),
  new THREE.MeshLambertMaterial({ color: 0x228b22 })
))

const tokenDisc = new THREE.Mesh(
  new THREE.CircleGeometry(1.125, 32),
  new THREE.MeshBasicMaterial({ map: tokenTexture })
)
tokenDisc.rotation.x = -Math.PI / 2
tokenDisc.rotation.z = CAM_ANGLE
tokenDisc.position.y = 0.51
token.add(tokenDisc)

const HP_INNER = 1.2    // 0.075 gap from disc edge
const HP_OUTER = 1.425  // 0.225 wide = 60% of 0.375 remaining radius
const HEALTH = 0.85

const hpBg = new THREE.Mesh(
  new THREE.RingGeometry(HP_INNER, HP_OUTER, 64, 1, Math.PI + HEALTH * Math.PI, (1 - HEALTH) * Math.PI),
  new THREE.MeshBasicMaterial({ color: 0x333333 })
)
hpBg.rotation.x = -Math.PI / 2
hpBg.rotation.z = CAM_ANGLE
hpBg.position.y = 0.52
token.add(hpBg)

const hpBar = new THREE.Mesh(
  new THREE.RingGeometry(HP_INNER, HP_OUTER, 64, 1, Math.PI, HEALTH * Math.PI),
  new THREE.MeshBasicMaterial({ color: 0x44dd44 })
)
hpBar.rotation.x = -Math.PI / 2
hpBar.rotation.z = CAM_ANGLE
hpBar.position.y = 0.521
token.add(hpBar)

// Canvas pixels per scene unit, for a 1024x1024 canvas covering the token's 3x3 diameter
const TOKEN_CANVAS_SCALE = 1024 / 3
const arcRadius = ((HP_INNER + HP_OUTER) / 2) * TOKEN_CANVAS_SCALE
const fontSize = Math.round((HP_OUTER - HP_INNER) * TOKEN_CANVAS_SCALE * 1.187)

const nameCanvas = document.createElement('canvas')
nameCanvas.width = 1024
nameCanvas.height = 1024
const nameCtx = nameCanvas.getContext('2d')
nameCtx.font = `bold ${fontSize}px sans-serif`
nameCtx.fillStyle = 'white'
nameCtx.strokeStyle = 'rgba(0,0,0,0.7)'
nameCtx.lineWidth = 3
nameCtx.textAlign = 'center'
nameCtx.textBaseline = 'middle'

const name = 'Tyllani'
const LETTER_SPACING = 1.2
let totalWidth = 0
for (const char of name) totalWidth += nameCtx.measureText(char).width * LETTER_SPACING
const totalAngle = totalWidth / arcRadius

let charAngle = -totalAngle / 2
for (const char of name) {
  const charWidth = nameCtx.measureText(char).width
  nameCtx.save()
  nameCtx.translate(512, 512)
  nameCtx.rotate(charAngle + charWidth / (2 * arcRadius))
  nameCtx.translate(0, -arcRadius)
  nameCtx.strokeText(char, 0, 0)
  nameCtx.fillText(char, 0, 0)
  nameCtx.restore()
  charAngle += charWidth * LETTER_SPACING / arcRadius
}

const namePlane = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nameCanvas), transparent: true })
)
namePlane.rotation.x = -Math.PI / 2
namePlane.rotation.z = CAM_ANGLE
namePlane.position.y = 0.53
token.add(namePlane)

window.addEventListener("resize", fitToWindow)

function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
}
animate()
