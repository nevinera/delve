import { describe, it, expect } from 'vitest'
import { CollisionChecker } from 'delve/rendering/collision_checker'

// Horizontal segment along z=0 from x=-10 to x=10
const hSeg = { x1: -10, z1: 0, x2: 10, z2: 0 }
// Vertical segment along x=0 from z=-10 to z=10
const vSeg = { x1: 0, z1: -10, x2: 0, z2: 10 }

describe('CollisionChecker', () => {
  describe('crossedWalls', () => {
    it('returns false when point is outside radius', () => {
      const c = new CollisionChecker([hSeg])
      expect(c.crossedWalls(0, 5, 2)).toBe(false)
    })

    it('returns true when point is within radius of wall midpoint', () => {
      const c = new CollisionChecker([hSeg])
      expect(c.crossedWalls(0, 1, 2)).toBe(true)
    })

    it('returns true when point is within radius of endpoint', () => {
      const c = new CollisionChecker([hSeg])
      expect(c.crossedWalls(11, 0, 2)).toBe(true)
    })

    it('returns false when point is beyond endpoint', () => {
      const c = new CollisionChecker([hSeg])
      expect(c.crossedWalls(13, 0, 2)).toBe(false)
    })

    it('returns true when only the second segment is hit', () => {
      const c = new CollisionChecker([hSeg, vSeg])
      // Far from hSeg (z=20) but within radius of vSeg endpoint (0, 10)
      expect(c.crossedWalls(1, 10, 2)).toBe(true)
    })
  })

  describe('pushOutFromWalls', () => {
    it('returns same position when no collision', () => {
      const c = new CollisionChecker([hSeg])
      const result = c.pushOutFromWalls(0, 5, 2)
      expect(result.x).toBeCloseTo(0)
      expect(result.z).toBeCloseTo(5)
    })

    it('pushes point out perpendicular to wall', () => {
      const c = new CollisionChecker([hSeg])
      // Point at z=1 is 1 unit from wall, radius=2 - should land at z=2
      const result = c.pushOutFromWalls(0, 1, 2)
      expect(result.x).toBeCloseTo(0)
      expect(result.z).toBeCloseTo(2)
    })

    it('pushes out from wall endpoint', () => {
      const c = new CollisionChecker([hSeg])
      // Closest point on segment is (10, 0), distance=1, push to distance=2
      const result = c.pushOutFromWalls(11, 0, 2)
      expect(result.x).toBeCloseTo(12)
      expect(result.z).toBeCloseTo(0)
    })

    it('result is outside both walls after push from corner', () => {
      const c = new CollisionChecker([hSeg, vSeg])
      // (1, 1) is within radius=2 of both walls; sequential pushes resolve both
      const result = c.pushOutFromWalls(1, 1, 2)
      expect(c.crossedWalls(result.x, result.z, 2)).toBe(false)
    })

    it('preserves position along wall (sliding behavior)', () => {
      const c = new CollisionChecker([hSeg])
      // Moving diagonally into wall - x component should be preserved
      const result = c.pushOutFromWalls(5, 1, 2)
      expect(result.x).toBeCloseTo(5)
      expect(result.z).toBeCloseTo(2)
    })
  })
})
