import { describe, it, expect } from 'vitest'
import { TokenState } from 'delve/rendering/token_state'

describe('TokenState', () => {
  const a = new TokenState({ x: 0, z: 0, facing: 0, hp: 30, maxHp: 40 })
  const b = new TokenState({ x: 10, z: 20, facing: Math.PI / 2, hp: 20, maxHp: 40 })

  describe('interpolate', () => {
    it('lerps x and z', () => {
      const mid = TokenState.interpolate(a, b, 0.5)
      expect(mid.x).toBeCloseTo(5)
      expect(mid.z).toBeCloseTo(10)
    })

    it('lerps facing', () => {
      const mid = TokenState.interpolate(a, b, 0.5)
      expect(mid.facing).toBeCloseTo(Math.PI / 4)
    })

    it('snaps hp and maxHp to b', () => {
      const mid = TokenState.interpolate(a, b, 0.5)
      expect(mid.hp).toBe(20)
      expect(mid.maxHp).toBe(40)
    })

    it('snaps alive to b', () => {
      const dead = new TokenState({ ...b, alive: false })
      const mid = TokenState.interpolate(a, dead, 0.5)
      expect(mid.alive).toBe(false)
    })

    it('takes the short path across the 0/2pi boundary', () => {
      const near0 = new TokenState({ x: 0, z: 0, facing: 0.1, hp: 10, maxHp: 10 })
      const near2pi = new TokenState({ x: 0, z: 0, facing: 2 * Math.PI - 0.1, hp: 10, maxHp: 10 })
      const mid = TokenState.interpolate(near0, near2pi, 0.5)
      // Short path is -0.2 radians, so midpoint is near 0 (not near pi)
      expect(Math.abs(mid.facing)).toBeLessThan(0.5)
    })
  })
})
