import { describe, it, expect } from 'vitest'
import { TokenDescriptor } from 'delve/rendering/token_descriptor'

describe('TokenDescriptor', () => {
  const base = { color: 0x228b22, name: 'Tyllani', diameter: 3, camAngle: 0, health: 1.0 }

  describe('body', () => {
    it('derives radius and height from diameter', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.body.radius).toBe(1.5)
      expect(desc.body.height).toBe(1)
    })
  })

  describe('health_bar', () => {
    it('current arc starts at PI and spans health * PI', () => {
      const desc = new TokenDescriptor({ ...base, health: 0.75 })
      expect(desc.health_bar.current_arc.theta_start).toBe(Math.PI)
      expect(desc.health_bar.current_arc.theta_length).toBeCloseTo(0.75 * Math.PI)
    })

    it('missing arc starts after the current arc and covers the rest', () => {
      const desc = new TokenDescriptor({ ...base, health: 0.75 })
      expect(desc.health_bar.missing_arc.theta_start).toBeCloseTo(Math.PI + 0.75 * Math.PI)
      expect(desc.health_bar.missing_arc.theta_length).toBeCloseTo(0.25 * Math.PI)
    })

    it('missing arc has zero length at full health', () => {
      const desc = new TokenDescriptor({ ...base, health: 1.0 })
      expect(desc.health_bar.missing_arc.theta_length).toBe(0)
    })

    it('current arc has zero length at zero health', () => {
      const desc = new TokenDescriptor({ ...base, health: 0 })
      expect(desc.health_bar.current_arc.theta_length).toBe(0)
      expect(desc.health_bar.missing_arc.theta_length).toBeCloseTo(Math.PI)
    })
  })

  describe('facing_arc', () => {
    it('is null when facing is not provided', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.facing_arc).toBeNull()
    })

    it('centers the arc span on the facing direction', () => {
      const facing = Math.PI / 2
      const desc = new TokenDescriptor({ ...base, facing })
      const centeredAt = Math.PI / 2 - facing
      expect(desc.facing_arc.theta_start).toBeCloseTo(centeredAt - Math.PI / 8)
      expect(desc.facing_arc.theta_end).toBeCloseTo(centeredAt + Math.PI / 8)
    })

    it('scales radii from token radius', () => {
      const desc = new TokenDescriptor(base)  // radius = 1.5
      // facing_arc is null, check with facing set
      const desc2 = new TokenDescriptor({ ...base, facing: 0 })
      expect(desc2.facing_arc.inner_radius).toBeCloseTo(1.5 + 1 / 12)
      expect(desc2.facing_arc.outer_radius).toBeCloseTo(1.5 + 5 / 12)
    })
  })

  describe('name', () => {
    it('stores the text', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.name.text).toBe('Tyllani')
    })

    it('uses canvas_size 1024', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.name.canvas_size).toBe(1024)
    })

    it('plane_size matches diameter', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.name.plane_size).toBe(3)
    })
  })
})
