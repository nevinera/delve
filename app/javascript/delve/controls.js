const ZOOM_RATE = 0.5
const TURN_RATE = 120 * Math.PI / 180

const KEYMAP = {
  Equal: 'zoomIn',
  Minus: 'zoomOut',
  KeyA: 'turnLeft',
  KeyD: 'turnRight',
  KeyW: 'forward',
  KeyS: 'backward',
  KeyQ: 'strafeLeft',
  KeyE: 'strafeRight'
}

export class Controls {
  constructor ({ onZoom, onTurn, onTranslate }) {
    this._onZoom = onZoom
    this._onTurn = onTurn
    this._onTranslate = onTranslate
    this._keys = new Set()

    window.addEventListener('keydown', e => { if (KEYMAP[e.code]) this._keys.add(e.code) })
    window.addEventListener('keyup', e => this._keys.delete(e.code))
    window.addEventListener('blur', () => this._keys.clear())
  }

  update (elapsed) {
    if (this._keys.has('Equal')) this._onZoom(-ZOOM_RATE * elapsed)
    if (this._keys.has('Minus')) this._onZoom(ZOOM_RATE * elapsed)

    if (this._keys.has('KeyA')) this._onTurn(-TURN_RATE * elapsed)
    if (this._keys.has('KeyD')) this._onTurn(TURN_RATE * elapsed)

    let forward = 0
    let side = 0
    if (this._keys.has('KeyW')) forward += 1
    if (this._keys.has('KeyS')) forward -= 1
    if (this._keys.has('KeyE')) side += 1
    if (this._keys.has('KeyQ')) side -= 1

    if (forward !== 0 || side !== 0) this._onTranslate(forward, side)
  }
}
