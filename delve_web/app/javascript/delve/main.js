import { Scene } from 'delve/rendering/scene'

const ZONE_BASE = '/zones/'

const zone = {
  name: 'Goblin Cave',
  mapUrl: 'maps/dungeon_scrawl/dungeon.png',
  dimensions: { width: 225, height: 185 },
  startingLocations: [
    { x: 132.5, y: 77.5, facing: 0 }
  ],
  walls: [
    [
      { x: 65.0, y: 95.0 }, { x: 90.0, y: 95.0 }, { x: 90.0, y: 90.0 },
      { x: 100.0, y: 90.0 }, { x: 100.0, y: 85.0 }, { x: 120.0, y: 85.0 },
      { x: 120.0, y: 100.0 }, { x: 135.0, y: 100.0 }, { x: 135.0, y: 120.0 }
    ],
    [
      { x: 90.0, y: 60.0 }, { x: 90.0, y: 70.0 }, { x: 100.0, y: 70.0 },
      { x: 100.0, y: 75.0 }, { x: 120.0, y: 75.0 }, { x: 120.0, y: 70.0 },
      { x: 130.0, y: 70.0 }, { x: 130.0, y: 50.0 }
    ],
    [
      { x: 145.0, y: 120.0 }, { x: 145.0, y: 100.0 }, { x: 160.0, y: 100.0 }
    ]
  ],
  units: [
    {
      name: 'Goblin Raider',
      tokenColor: '#8B2500',
      maxHP: 20,
      currentHP: 14,
      tokenImageUrl: 'tokens/too-many-tokens/GoblinGrasslandMaleGreenMelee (15).webp',
      facingAngle: 2.756,
      location: { x: 131.2, y: 80.7 },
      tokenScale: 0.75
    },
    {
      name: 'Goblin Raider',
      tokenColor: '#8B2500',
      maxHP: 20,
      tokenImageUrl: 'tokens/too-many-tokens/GoblinGrasslandMaleRedMelee (1).webp',
      facingAngle: 1.952,
      location: { x: 128.8, y: 79.0 },
      tokenScale: 0.75
    },
    {
      name: 'Goblin Archer',
      tokenColor: '#8B2500',
      maxHP: 20,
      currentHP: 8,
      tokenImageUrl: 'tokens/too-many-tokens/GoblinUnderdarkMaleYellowMelee (13).webp',
      facingAngle: 1.5708,
      location: { x: 110.5, y: 77.5 },
      tokenScale: 0.75
    }
  ]
}

const protagonist = {
  name: 'Zyllani',
  tokenColor: '#228B22',
  maxHP: 40,
  currentHP: 34,
  tokenImageUrl: 'tokens/too-many-tokens/ThugElfFemaleRanged (7).webp'
}

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)

const scene = new Scene({ zone, zoneBase: ZONE_BASE, canvas, protagonist })

const TICK_MS = 100
const TURN_RATE = 120 * Math.PI / 180 // radians/sec
const MOVE_RATE = 15 // world units/sec
const ZOOM_RATE = 0.5 // zoom scale units/sec
let lastTickTime = performance.now()
let lastFrameTime = performance.now()

const keys = new Set()
window.addEventListener('keydown', e => keys.add(e.code))
window.addEventListener('keyup', e => keys.delete(e.code))
window.addEventListener('blur', () => keys.clear())

setInterval(() => {
  lastTickTime = performance.now()
  scene.advanceTick()
}, TICK_MS)

function animate (time) {
  requestAnimationFrame(animate)
  const elapsed = (time - lastFrameTime) / 1000
  lastFrameTime = time

  if (keys.has('Equal')) scene.adjustZoom(-ZOOM_RATE * elapsed)
  if (keys.has('Minus')) scene.adjustZoom(ZOOM_RATE * elapsed)

  if (keys.has('KeyA')) scene.setProtagonistFacing(scene.protagonist.predictedState.facing - TURN_RATE * elapsed)
  if (keys.has('KeyD')) scene.setProtagonistFacing(scene.protagonist.predictedState.facing + TURN_RATE * elapsed)
  if (keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyQ') || keys.has('KeyE')) {
    const { facing, x, z } = scene.protagonist.predictedState
    const fwdX = Math.sin(facing); const fwdZ = -Math.cos(facing)
    const rightX = Math.cos(facing); const rightZ = Math.sin(facing)
    let dx = 0; let dz = 0
    if (keys.has('KeyW')) { dx += fwdX; dz += fwdZ }
    if (keys.has('KeyS')) { dx -= fwdX; dz -= fwdZ }
    if (keys.has('KeyQ')) { dx -= rightX; dz -= rightZ }
    if (keys.has('KeyE')) { dx += rightX; dz += rightZ }
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len > 0) {
      scene.protagonist.predictedState.x = x + (dx / len) * MOVE_RATE * elapsed
      scene.protagonist.predictedState.z = z + (dz / len) * MOVE_RATE * elapsed
    }
  }

  const tickProgress = Math.min((time - lastTickTime) / TICK_MS, 1)
  scene.render(tickProgress)
}
requestAnimationFrame(animate)
