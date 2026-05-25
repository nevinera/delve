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
  })

  describe('tick', () => {
    it('stands still when roll >= 2/3', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.8)
      const next = makeUnit().tick(makeState(0))
      expect(next.x).toBe(0)
      expect(next.z).toBe(0)
      expect(next.facing).toBe(0)
    })

    it('turns left when roll < 1/3 and direction roll < 0.5', () => {
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.3)
      const next = makeUnit().tick(makeState(0))
      expect(next.facing).toBeCloseTo(-TURN_AMOUNT)
      expect(next.x).toBe(0)
      expect(next.z).toBe(0)
    })

    it('turns right when roll < 1/3 and direction roll >= 0.5', () => {
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.7)
      const next = makeUnit().tick(makeState(0))
      expect(next.facing).toBeCloseTo(TURN_AMOUNT)
    })

    it('moves forward along facing when roll is 1/3 to 2/3', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const next = makeUnit().tick(makeState(0)) // facing north (-z)
      expect(next.x).toBeCloseTo(0)
      expect(next.z).toBeCloseTo(-MOVE_AMOUNT)
    })

    it('moves in the correct direction when facing east', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const next = makeUnit().tick(makeState(Math.PI / 2)) // facing east (+x)
      expect(next.x).toBeCloseTo(MOVE_AMOUNT)
      expect(next.z).toBeCloseTo(0)
    })

    it('calls pushOut each substep and applies result when moving', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const pushOut = vi.fn((x, z) => ({ x, z: Math.max(z, -0.5) }))
      const next = makeUnit().tick(makeState(0), pushOut) // facing north
      expect(pushOut).toHaveBeenCalled()
      expect(next.z).toBeCloseTo(-0.5)
    })

    it('does not call pushOut when turning', () => {
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.3)
      const pushOut = vi.fn((x, z) => ({ x, z }))
      makeUnit().tick(makeState(0), pushOut)
      expect(pushOut).not.toHaveBeenCalled()
    })

    it('does not call pushOut when standing still', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.8)
      const pushOut = vi.fn((x, z) => ({ x, z }))
      makeUnit().tick(makeState(0), pushOut)
      expect(pushOut).not.toHaveBeenCalled()
    })

    it('preserves hp and maxHp across all actions', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.8)
      const state = new TokenState({ x: 0, z: 0, facing: 0, hp: 7, maxHp: 20 })
      const next = makeUnit().tick(state)
      expect(next.hp).toBe(7)
      expect(next.maxHp).toBe(20)
    })
  })
})
