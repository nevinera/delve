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
const ORBIT_RATE = 20 * Math.PI / 180 // radians/sec, for demo rotation
let lastTickTime = performance.now()
let lastFrameTime = performance.now()

setInterval(() => {
  lastTickTime = performance.now()
  scene.advanceTick()
}, TICK_MS)

function animate (time) {
  requestAnimationFrame(animate)
  const elapsed = (time - lastFrameTime) / 1000
  lastFrameTime = time
  scene.setProtagonistFacing(scene.protagonist.predictedState.facing + ORBIT_RATE * elapsed)
  const tickProgress = Math.min((time - lastTickTime) / TICK_MS, 1)
  scene.render(tickProgress)
}
requestAnimationFrame(animate)
