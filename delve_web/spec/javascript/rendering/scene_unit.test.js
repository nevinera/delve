import { describe, it, expect, vi } from 'vitest'
import { SceneUnit } from 'delve/rendering/scene_unit'
import { TokenState } from 'delve/rendering/token_state'

function makeState (x, z, facing = 0) {
  return new TokenState({ x, z, facing, hp: 10, maxHp: 10 })
}

function makeSceneNode () {
  return { update: vi.fn() }
}

describe('SceneUnit', () => {
  describe('constructor', () => {
    it('sets fromState and toState to initialState', () => {
      const state = makeState(1, 2)
      const unit = new SceneUnit(makeSceneNode(), state)
      expect(unit.fromState).toBe(state)
      expect(unit.toState).toBe(state)
    })
  })

  describe('advanceTick', () => {
    it('shifts toState to fromState and sets new toState', () => {
      const s0 = makeState(0, 0)
      const s1 = makeState(1, 0)
      const s2 = makeState(2, 0)
      const unit = new SceneUnit(makeSceneNode(), s0)
      unit.advanceTick(s1)
      expect(unit.fromState).toBe(s0)
      expect(unit.toState).toBe(s1)
      unit.advanceTick(s2)
      expect(unit.fromState).toBe(s1)
      expect(unit.toState).toBe(s2)
    })
  })

  describe('render', () => {
    it('calls sceneNode.update with interpolated state at t=0', () => {
      const s0 = makeState(0, 0)
      const s1 = makeState(10, 0)
      const node = makeSceneNode()
      const unit = new SceneUnit(node, s0)
      unit.advanceTick(s1)
      unit.render(0)
      expect(node.update).toHaveBeenCalledOnce()
      expect(node.update.mock.calls[0][0].x).toBeCloseTo(0)
    })

    it('calls sceneNode.update with interpolated state at t=1', () => {
      const s0 = makeState(0, 0)
      const s1 = makeState(10, 0)
      const node = makeSceneNode()
      const unit = new SceneUnit(node, s0)
      unit.advanceTick(s1)
      unit.render(1)
      expect(node.update.mock.calls[0][0].x).toBeCloseTo(10)
    })

    it('calls sceneNode.update with interpolated state at t=0.5', () => {
      const s0 = makeState(0, 0)
      const s1 = makeState(10, 0)
      const node = makeSceneNode()
      const unit = new SceneUnit(node, s0)
      unit.advanceTick(s1)
      unit.render(0.5)
      expect(node.update.mock.calls[0][0].x).toBeCloseTo(5)
    })
  })
})
