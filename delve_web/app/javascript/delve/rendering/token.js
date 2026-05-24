import * as THREE from 'three'

const LETTER_SPACING = 1.2

function makeNameTexture ({ text, canvasSize, canvasArcRadius, fontSize }) {
  const canvas = document.createElement('canvas')
  canvas.width = canvasSize
  canvas.height = canvasSize
  const ctx = canvas.getContext('2d')
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.fillStyle = 'white'
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'
  ctx.lineWidth = 3
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let totalWidth = 0
  for (const char of text) totalWidth += ctx.measureText(char).width * LETTER_SPACING
  const totalAngle = totalWidth / canvasArcRadius

  let charAngle = -totalAngle / 2
  for (const char of text) {
    const charWidth = ctx.measureText(char).width
    ctx.save()
    ctx.translate(canvasSize / 2, canvasSize / 2)
    ctx.rotate(charAngle + charWidth / (2 * canvasArcRadius))
    ctx.translate(0, -canvasArcRadius)
    ctx.strokeText(char, 0, 0)
    ctx.fillText(char, 0, 0)
    ctx.restore()
    charAngle += charWidth * LETTER_SPACING / canvasArcRadius
  }

  return new THREE.CanvasTexture(canvas)
}

function drawHpRing (canvas, healthBar, hpFraction) {
  const { innerRadius, outerRadius, canvasSize, canvasScale } = healthBar
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvasSize, canvasSize)

  const cx = canvasSize / 2
  const cy = canvasSize / 2
  const innerR = innerRadius * canvasScale
  const outerR = outerRadius * canvasScale
  const startAngle = Math.PI
  const hpEnd = Math.PI + hpFraction * Math.PI

  if (hpFraction < 1) {
    ctx.beginPath()
    ctx.arc(cx, cy, outerR, hpEnd, 2 * Math.PI, false)
    ctx.arc(cx, cy, innerR, 2 * Math.PI, hpEnd, true)
    ctx.closePath()
    ctx.fillStyle = '#333333'
    ctx.fill()
  }

  if (hpFraction > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, outerR, startAngle, hpEnd, false)
    ctx.arc(cx, cy, innerR, hpEnd, startAngle, true)
    ctx.closePath()
    ctx.fillStyle = '#44dd44'
    ctx.fill()
  }
}

export class TokenSceneNode {
  constructor (descriptor, texture) {
    const { color, body, disc, healthBar, name } = descriptor

    this._healthBar = healthBar
    this._lastHp = null
    this._lastMaxHp = null

    this.group = new THREE.Group()

    const cameraGroup = new THREE.Group()
    this.group.add(cameraGroup)
    this._cameraGroup = cameraGroup

    const bodyMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(body.radius, body.radius, body.height, 32),
      new THREE.MeshLambertMaterial({ color })
    )
    bodyMesh.position.y = body.height / 2
    this.group.add(bodyMesh)

    const discMesh = new THREE.Mesh(
      new THREE.CircleGeometry(disc.radius, 32),
      new THREE.MeshBasicMaterial({ map: texture })
    )
    discMesh.rotation.x = -Math.PI / 2
    discMesh.position.y = disc.position_y
    cameraGroup.add(discMesh)

    this._hpCanvas = document.createElement('canvas')
    this._hpCanvas.width = healthBar.canvasSize
    this._hpCanvas.height = healthBar.canvasSize
    this._hpTexture = new THREE.CanvasTexture(this._hpCanvas)

    const hpPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(name.planeSize, name.planeSize),
      new THREE.MeshBasicMaterial({ map: this._hpTexture, transparent: true })
    )
    hpPlane.rotation.x = -Math.PI / 2
    hpPlane.position.y = healthBar.positionY
    cameraGroup.add(hpPlane)

    const namePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(name.planeSize, name.planeSize),
      new THREE.MeshBasicMaterial({ map: makeNameTexture(name), transparent: true })
    )
    namePlane.rotation.x = -Math.PI / 2
    namePlane.position.y = name.position_y
    cameraGroup.add(namePlane)
  }

  update (state) {
    this.group.position.set(state.x, 0, state.z)

    if (state.hp !== this._lastHp || state.maxHp !== this._lastMaxHp) {
      drawHpRing(this._hpCanvas, this._healthBar, state.hp / state.maxHp)
      this._hpTexture.needsUpdate = true
      this._lastHp = state.hp
      this._lastMaxHp = state.maxHp
    }
  }
}
