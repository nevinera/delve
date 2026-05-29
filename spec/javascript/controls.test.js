// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Controls } from 'delve/controls'

const TURN_RATE = 120 * Math.PI / 180
const ZOOM_RATE = 0.5

function press (...codes) {
  for (const code of codes) window.dispatchEvent(new KeyboardEvent('keydown', { code }))
}

function makeControls () {
  const cbs = { onZoom: vi.fn(), onTurn: vi.fn(), onTranslate: vi.fn() }
  const controls = new Controls(cbs)
  return { controls, cbs }
}

describe('Controls', () => {
  beforeEach(() => {
    window.dispatchEvent(new Event('blur'))
  })

  describe('zoom', () => {
    it('calls onZoom with negative delta when Equal held', () => {
      const { controls, cbs } = makeControls()
      press('Equal')
      controls.update(1)
      expect(cbs.onZoom).toHaveBeenCalledWith(-ZOOM_RATE)
    })

    it('calls onZoom with positive delta when Minus held', () => {
      const { controls, cbs } = makeControls()
      press('Minus')
      controls.update(1)
      expect(cbs.onZoom).toHaveBeenCalledWith(ZOOM_RATE)
    })

    it('scales by elapsed', () => {
      const { controls, cbs } = makeControls()
      press('Equal')
      controls.update(0.5)
      expect(cbs.onZoom).toHaveBeenCalledWith(-ZOOM_RATE * 0.5)
    })
  })

  describe('turn', () => {
    it('calls onTurn with negative rads when A held', () => {
      const { controls, cbs } = makeControls()
      press('KeyA')
      controls.update(1)
      expect(cbs.onTurn).toHaveBeenCalledWith(-TURN_RATE)
    })

    it('calls onTurn with positive rads when D held', () => {
      const { controls, cbs } = makeControls()
      press('KeyD')
      controls.update(1)
      expect(cbs.onTurn).toHaveBeenCalledWith(TURN_RATE)
    })

    it('scales by elapsed', () => {
      const { controls, cbs } = makeControls()
      press('KeyD')
      controls.update(0.016)
      expect(cbs.onTurn.mock.calls[0][0]).toBeCloseTo(TURN_RATE * 0.016)
    })
  })

  describe('translate', () => {
    it('calls onTranslate(1, 0) when W held', () => {
      const { controls, cbs } = makeControls()
      press('KeyW')
      controls.update(1)
      expect(cbs.onTranslate).toHaveBeenCalledWith(1, 0)
    })

    it('calls onTranslate(-1, 0) when S held', () => {
      const { controls, cbs } = makeControls()
      press('KeyS')
      controls.update(1)
      expect(cbs.onTranslate).toHaveBeenCalledWith(-1, 0)
    })

    it('calls onTranslate(0, 1) when E held', () => {
      const { controls, cbs } = makeControls()
      press('KeyE')
      controls.update(1)
      expect(cbs.onTranslate).toHaveBeenCalledWith(0, 1)
    })

    it('calls onTranslate(0, -1) when Q held', () => {
      const { controls, cbs } = makeControls()
      press('KeyQ')
      controls.update(1)
      expect(cbs.onTranslate).toHaveBeenCalledWith(0, -1)
    })

    it('calls onTranslate(1, 1) when W and E held together', () => {
      const { controls, cbs } = makeControls()
      press('KeyW', 'KeyE')
      controls.update(1)
      expect(cbs.onTranslate).toHaveBeenCalledWith(1, 1)
    })

    it('does not call onTranslate when no movement keys held', () => {
      const { controls, cbs } = makeControls()
      controls.update(1)
      expect(cbs.onTranslate).not.toHaveBeenCalled()
    })
  })

  describe('blur', () => {
    it('clears all keys so no callbacks fire after losing focus', () => {
      const { controls, cbs } = makeControls()
      press('KeyW')
      window.dispatchEvent(new Event('blur'))
      controls.update(1)
      expect(cbs.onTranslate).not.toHaveBeenCalled()
    })
  })
})
