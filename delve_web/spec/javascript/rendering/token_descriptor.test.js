import { describe, it, expect } from 'vitest'
import { TokenDescriptor } from 'delve/rendering/token_descriptor'

describe('TokenDescriptor', () => {
  const base = { color: 0x228b22, name: 'Tyllani', diameter: 3 }

  describe('body', () => {
    it('derives radius and height from diameter', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.body.radius).toBe(1.5)
      expect(desc.body.height).toBe(1)
    })
  })

  describe('healthBar', () => {
    it('derives inner and outer radii from body radius', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.healthBar.innerRadius).toBeCloseTo(1.5 * 0.8)
      expect(desc.healthBar.outerRadius).toBeCloseTo(1.5 * 0.95)
    })

    it('positions just above the body', () => {
      const desc = new TokenDescriptor(base)
      expect(desc.healthBar.positionY).toBeCloseTo(1 + 0.02)
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
