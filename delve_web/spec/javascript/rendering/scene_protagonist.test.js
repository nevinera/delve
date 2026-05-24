import { describe, it, expect, vi } from 'vitest'
import { SceneProtagonist } from 'delve/rendering/scene_protagonist'
import { TokenState } from 'delve/rendering/token_state'

function makeState (facing = 0) {
  return new TokenState({ x: 0, z: 0, facing, hp: 30, maxHp: 40 })
}

function makeSceneNode () {
  return { update: vi.fn() }
}

describe('SceneProtagonist', () => {
  describe('constructor', () => {
    it('stores initialState as predictedState', () => {
      const state = makeState()
      const p = new SceneProtagonist(makeSceneNode(), state)
      expect(p.predictedState).toBe(state)
    })
  })

  describe('setFacing', () => {
    it('updates predictedState.facing', () => {
      const p = new SceneProtagonist(makeSceneNode(), makeState(0))
      p.setFacing(Math.PI / 2)
      expect(p.predictedState.facing).toBeCloseTo(Math.PI / 2)
    })
  })

  describe('render', () => {
    it('calls sceneNode.update with predictedState', () => {
      const state = makeState(1)
      const node = makeSceneNode()
      const p = new SceneProtagonist(node, state)
      p.render()
      expect(node.update).toHaveBeenCalledOnce()
      expect(node.update).toHaveBeenCalledWith(state)
    })

    it('reflects facing changes immediately', () => {
      const node = makeSceneNode()
      const p = new SceneProtagonist(node, makeState(0))
      p.setFacing(Math.PI)
      p.render()
      expect(node.update.mock.calls[0][0].facing).toBeCloseTo(Math.PI)
    })
  })
})
