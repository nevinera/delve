import { describe, it, expect, vi } from 'vitest'
import { SceneProtagonist } from 'delve/rendering/scene_protagonist'
import { TokenState } from 'delve/rendering/token_state'

function makeState (facing = 0) {
  return new TokenState({ x: 0, z: 0, facing, hp: 30, maxHp: 40 })
}

function makeSceneNode () {
  return { update: vi.fn() }
}

function makeProtagonist (facing = 0) {
  return new SceneProtagonist(makeSceneNode(), makeState(facing), 1.5)
}

describe('SceneProtagonist', () => {
  describe('constructor', () => {
    it('stores initialState as predictedState', () => {
      const state = makeState()
      const p = new SceneProtagonist(makeSceneNode(), state, 1.5)
      expect(p.predictedState).toBe(state)
    })

    it('stores radius', () => {
      const p = new SceneProtagonist(makeSceneNode(), makeState(), 2)
      expect(p.radius).toBe(2)
    })
  })

  describe('setFacing', () => {
    it('updates predictedState.facing', () => {
      const p = makeProtagonist(0)
      p.setFacing(Math.PI / 2)
      expect(p.predictedState.facing).toBeCloseTo(Math.PI / 2)
    })
  })

  describe('move', () => {
    it('moves forward along facing direction', () => {
      const p = makeProtagonist(0) // facing north (-Z)
      p.move(1, 0, 1)
      expect(p.predictedState.x).toBeCloseTo(0)
      expect(p.predictedState.z).toBeCloseTo(-15) // MOVE_RATE * elapsed
    })

    it('moves sideways perpendicular to facing', () => {
      const p = makeProtagonist(0) // facing north
      p.move(0, 1, 1)
      expect(p.predictedState.x).toBeCloseTo(15) // east
      expect(p.predictedState.z).toBeCloseTo(0)
    })

    it('normalizes diagonal movement to same speed as cardinal', () => {
      const p = makeProtagonist(0)
      p.move(1, 1, 1)
      const dist = Math.sqrt(p.predictedState.x ** 2 + p.predictedState.z ** 2)
      expect(dist).toBeCloseTo(15) // same as forward-only
    })

    it('scales by elapsed', () => {
      const p = makeProtagonist(0)
      p.move(1, 0, 0.5)
      expect(p.predictedState.z).toBeCloseTo(-7.5)
    })

    it('does nothing when both axes are zero', () => {
      const p = makeProtagonist(0)
      p.move(0, 0, 1)
      expect(p.predictedState.x).toBe(0)
      expect(p.predictedState.z).toBe(0)
    })
  })

  describe('render', () => {
    it('calls sceneNode.update with predictedState', () => {
      const state = makeState(1)
      const node = makeSceneNode()
      const p = new SceneProtagonist(node, state, 1.5)
      p.render()
      expect(node.update).toHaveBeenCalledOnce()
      expect(node.update).toHaveBeenCalledWith(state)
    })

    it('reflects facing changes immediately', () => {
      const node = makeSceneNode()
      const p = new SceneProtagonist(node, makeState(0), 1.5)
      p.setFacing(Math.PI)
      p.render()
      expect(node.update.mock.calls[0][0].facing).toBeCloseTo(Math.PI)
    })
  })
})
