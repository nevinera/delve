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

  describe('healthBar', () => {
    it('current arc starts at PI and spans health * PI', () => {
      const desc = new TokenDescriptor({ ...base, health: 0.75 })
      expect(desc.healthBar.current_arc.theta_start).toBe(Math.PI)
      expect(desc.healthBar.current_arc.theta_length).toBeCloseTo(0.75 * Math.PI)
    })

    it('missing arc starts after the current arc and covers the rest', () => {
      const desc = new TokenDescriptor({ ...base, health: 0.75 })
      expect(desc.healthBar.missing_arc.theta_start).toBeCloseTo(Math.PI + 0.75 * Math.PI)
      expect(desc.healthBar.missing_arc.theta_length).toBeCloseTo(0.25 * Math.PI)
    })

    it('missing arc has zero length at full health', () => {
      const desc = new TokenDescriptor({ ...base, health: 1.0 })
      expect(desc.healthBar.missing_arc.theta_length).toBe(0)
    })

    it('current arc has zero length at zero health', () => {
      const desc = new TokenDescriptor({ ...base, health: 0 })
      expect(desc.healthBar.current_arc.theta_length).toBe(0)
      expect(desc.healthBar.missing_arc.theta_length).toBeCloseTo(Math.PI)
    })
  })

  describe('facingArc', () => {
    it('is null when facing is not provided', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.facingArc).toBeNull()
    })

    it('centers the arc span on the facing direction', () => {
      const facing = Math.PI / 2
      const desc = new TokenDescriptor({ ...base, facing })
      const centeredAt = Math.PI / 2 - facing
      expect(desc.facingArc.theta_start).toBeCloseTo(centeredAt - Math.PI / 8)
      expect(desc.facingArc.theta_end).toBeCloseTo(centeredAt + Math.PI / 8)
    })

    it('scales radii from token radius', () => {
      const desc = new TokenDescriptor({ ...base, facing: 0 })
      expect(desc.facingArc.inner_radius).toBeCloseTo(1.5 + 1 / 12)
      expect(desc.facingArc.outer_radius).toBeCloseTo(1.5 + 5 / 12)
    })
  })

  describe('name', () => {
    it('stores the text', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.name.text).toBe('Tyllani')
    })

    it('uses canvasSize 1024', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.name.canvasSize).toBe(1024)
    })

    it('planeSize matches diameter', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.name.planeSize).toBe(3)
    })
  })
})
