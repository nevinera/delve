import { describe, it, expect, vi, afterEach } from 'vitest'
import { Unit } from 'delve/unit'
import { TokenState } from 'delve/rendering/token_state'

const TURN_AMOUNT = 120 * Math.PI / 180 * 0.1
const MOVE_AMOUNT = 15 * 0.1

function makeState (facing = 0) {
  return new TokenState({ x: 0, z: 0, facing, hp: 10, maxHp: 20 })
}

function makeUnit () {
  return new Unit({ diameter: 3 })
}

describe('Unit', () => {
  afterEach(() => vi.restoreAllMocks())

  describe('constructor', () => {
    it('stores radius from diameter', () => {
      expect(new Unit({ diameter: 3 }).radius).toBe(1.5)
    })

    it('starts with still action', () => {
      expect(makeUnit()._action).toBe('still')
    })
  })

  describe('tick - action selection', () => {
    it('keeps current action when roll >= 0.25', () => {
      const unit = makeUnit()
      unit._action = 'forward'
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const next = unit.tick(makeState(0))
      expect(unit._action).toBe('forward')
      expect(next.z).toBeCloseTo(-MOVE_AMOUNT)
    })

    it('picks a new action when roll < 0.25', () => {
      const unit = makeUnit()
      // roll < 0.25 → change; floor(0.1 * 4) = 0 → 'turnLeft'
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.1)
      unit.tick(makeState(0))
      expect(unit._action).toBe('turnLeft')
    })

    it('selects all four actions based on second roll', () => {
      const cases = [
        [0.0, 'turnLeft'],
        [0.3, 'turnRight'],
        [0.55, 'forward'],
        [0.9, 'still']
      ]
      for (const [roll, expected] of cases) {
        const unit = makeUnit()
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.0).mockReturnValueOnce(roll)
        unit.tick(makeState(0))
        expect(unit._action).toBe(expected)
        vi.restoreAllMocks()
      }
    })
  })

  describe('tick - action behavior', () => {
    it('turnLeft decreases facing by TURN_AMOUNT', () => {
      const unit = makeUnit()
      unit._action = 'turnLeft'
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // persist
      const next = unit.tick(makeState(0))
      expect(next.facing).toBeCloseTo(-TURN_AMOUNT)
      expect(next.x).toBe(0)
      expect(next.z).toBe(0)
    })

    it('turnRight increases facing by TURN_AMOUNT', () => {
      const unit = makeUnit()
      unit._action = 'turnRight'
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const next = unit.tick(makeState(0))
      expect(next.facing).toBeCloseTo(TURN_AMOUNT)
    })

    it('forward moves in facing direction', () => {
      const unit = makeUnit()
      unit._action = 'forward'
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const next = unit.tick(makeState(0)) // facing north (-z)
      expect(next.x).toBeCloseTo(0)
      expect(next.z).toBeCloseTo(-MOVE_AMOUNT)
    })

    it('forward moves in correct direction when facing east', () => {
      const unit = makeUnit()
      unit._action = 'forward'
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const next = unit.tick(makeState(Math.PI / 2))
      expect(next.x).toBeCloseTo(MOVE_AMOUNT)
      expect(next.z).toBeCloseTo(0)
    })

    it('forward calls pushOut each substep', () => {
      const unit = makeUnit()
      unit._action = 'forward'
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const pushOut = vi.fn((x, z) => ({ x, z: Math.max(z, -0.5) }))
      const next = unit.tick(makeState(0), pushOut)
      expect(pushOut).toHaveBeenCalled()
      expect(next.z).toBeCloseTo(-0.5)
    })

    it('still preserves position and facing', () => {
      const unit = makeUnit()
      unit._action = 'still'
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const next = unit.tick(makeState(0))
      expect(next.x).toBe(0)
      expect(next.z).toBe(0)
      expect(next.facing).toBe(0)
    })

    it('does not call pushOut for turn or still actions', () => {
      const pushOut = vi.fn((x, z) => ({ x, z }))
      for (const action of ['turnLeft', 'turnRight', 'still']) {
        const unit = makeUnit()
        unit._action = action
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        unit.tick(makeState(0), pushOut)
        vi.restoreAllMocks()
      }
      expect(pushOut).not.toHaveBeenCalled()
    })

    it('preserves hp and maxHp', () => {
      const unit = makeUnit()
      unit._action = 'still'
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const state = new TokenState({ x: 0, z: 0, facing: 0, hp: 7, maxHp: 20 })
      const next = unit.tick(state)
      expect(next.hp).toBe(7)
      expect(next.maxHp).toBe(20)
    })
  })
})
