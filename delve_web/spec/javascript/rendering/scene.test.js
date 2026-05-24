// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { Scene } from 'delve/rendering/scene'
import { TokenState } from 'delve/rendering/token_state'

// Map coords (50, 50) -> world (-82.5, 52.5)
const zone = {
  name: 'Test Zone',
  mapUrl: 'map.png',
  dimensions: { width: 100, height: 100 },
  startingLocations: [{ x: 50, y: 50, facing: 0 }],
  walls: [],
  units: [
    {
      name: 'Goblin',
      tokenColor: '#8B2500',
      maxHP: 10,
      tokenImageUrl: 'goblin.png',
      facingAngle: 0,
      location: { x: 55, y: 50 },
      tokenScale: 1
    }
  ]
}

const protagonist = {
  name: 'Hero',
  tokenColor: '#228B22',
  maxHP: 30,
  currentHP: 30,
  tokenImageUrl: 'hero.png'
}

function makeRenderer () {
  return {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    domElement: document.createElement('canvas')
  }
}

function makeScene (overrides = {}) {
  return new Scene({
    zone,
    zoneBase: '/',
    canvas: document.createElement('canvas'),
    protagonist,
    renderer: makeRenderer(),
    textureLoader: { load: vi.fn(() => new THREE.Texture()) },
    ...overrides
  })
}

describe('Scene', () => {
  describe('constructor', () => {
    it('creates one SceneUnit per zone unit', () => {
      const scene = makeScene()
      expect(scene._units.size).toBe(1)
    })
  })

  describe('render', () => {
    it('calls renderer.render each frame', () => {
      const renderer = makeRenderer()
      const scene = makeScene({ renderer })
      scene.render(0)
      scene.render(0.5)
      expect(renderer.render).toHaveBeenCalledTimes(2)
    })
  })

  describe('camera position', () => {
    // Starting world pos: (-82.5, 52.5). At facing=0 (north, -Z):
    //   fwd = (0, -1), so camera sits south of protagonist at z + CAM_BACK
    it('places camera behind protagonist when facing north', () => {
      const scene = makeScene()
      scene.render(0)
      expect(scene._camera.position.x).toBeCloseTo(-82.5)
      expect(scene._camera.position.z).toBeCloseTo(52.5 + 45) // CAM_BACK=45
    })

    it('places camera at CAM_HEIGHT above ground', () => {
      const scene = makeScene()
      scene.render(0)
      expect(scene._camera.position.y).toBeCloseTo(50) // CAM_HEIGHT=50
    })

    it('shifts camera when facing east (pi/2)', () => {
      const scene = makeScene()
      scene.setProtagonistFacing(Math.PI / 2)
      scene.render(0)
      // fwd = (1, 0), camera is west of protagonist
      expect(scene._camera.position.x).toBeCloseTo(-82.5 - 45)
      expect(scene._camera.position.z).toBeCloseTo(52.5)
    })
  })

  describe('zoom', () => {
    it('scales camera distance', () => {
      const scene = makeScene()
      scene.setZoom(0.5)
      scene.render(0)
      expect(scene._camera.position.y).toBeCloseTo(25) // 50 * 0.5
      expect(scene._camera.position.z).toBeCloseTo(52.5 + 22.5) // CAM_BACK * 0.5
    })

    it('scales fog near and far', () => {
      const scene = makeScene()
      scene.setZoom(0.5)
      scene.render(0)
      expect(scene._threeScene.fog.near).toBeCloseTo(30) // 60 * 0.5
      expect(scene._threeScene.fog.far).toBeCloseTo(75) // 150 * 0.5
    })
  })

  describe('updateUnits / advanceTick', () => {
    it('advances unit state from pending map on tick', () => {
      const scene = makeScene()
      const unit = scene._units.get('0')
      const initialToState = unit.toState
      const nextState = new TokenState({ x: 99, z: 99, facing: 0, hp: 5, maxHp: 10 })
      scene.updateUnits(new Map([['0', nextState]]))
      scene.advanceTick()
      expect(unit.fromState).toBe(initialToState)
      expect(unit.toState).toBe(nextState)
    })

    it('holds unit at toState when no pending state', () => {
      const scene = makeScene()
      const unit = scene._units.get('0')
      const toStateBefore = unit.toState
      scene.advanceTick()
      expect(unit.toState).toBe(toStateBefore)
    })
  })
})
