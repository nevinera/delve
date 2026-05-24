import { describe, it, expect } from 'vitest'
import { WallDescriptor, ZoneDescriptor } from 'delve/rendering/zone_descriptor'

describe('WallDescriptor', () => {
  describe('polygon_points', () => {
    it('offsets a horizontal segment symmetrically', () => {
      const wall = new WallDescriptor([[0, 0], [10, 0]], { thickness: 2 })
      // Segment direction (1,0): normal is (0,1) in XZ, so left=+Z, right=-Z
      expect(wall.polygon_points).toEqual([
        [0, 1], [10, 1],
        [10, -1], [0, -1]
      ])
    })

    it('offsets a vertical segment symmetrically', () => {
      const wall = new WallDescriptor([[0, 0], [0, 10]], { thickness: 2 })
      // Segment direction (0,1): normal is (-1,0) in XZ, so left=-X, right=+X
      expect(wall.polygon_points).toEqual([
        [-1, 0], [-1, 10],
        [1, 10], [1, 0]
      ])
    })

    it('computes a miter at a right-angle corner', () => {
      const wall = new WallDescriptor([[0, 0], [10, 0], [10, 10]], { thickness: 2 })
      const pts = wall.polygon_points
      // Left miter at (10,0): inner corner of the 90-degree turn
      expect(pts[1][0]).toBeCloseTo(9)
      expect(pts[1][1]).toBeCloseTo(1)
      // Right miter at (10,0): outer corner
      expect(pts[pts.length - 2][0]).toBeCloseTo(11)
      expect(pts[pts.length - 2][1]).toBeCloseTo(-1)
    })

    it('produces 2*n polygon points for n path points', () => {
      const wall = new WallDescriptor([[0, 0], [5, 0], [5, 5], [10, 5]])
      expect(wall.polygon_points).toHaveLength(8)
    })
  })
})

describe('ZoneDescriptor', () => {
  it('holds an array of WallDescriptors', () => {
    const wall1 = new WallDescriptor([[0, 0], [10, 0]])
    const wall2 = new WallDescriptor([[10, 0], [10, 10]])
    const zone = new ZoneDescriptor([wall1, wall2])
    expect(zone.walls).toHaveLength(2)
    expect(zone.walls[0]).toBe(wall1)
    expect(zone.walls[1]).toBe(wall2)
  })
})
