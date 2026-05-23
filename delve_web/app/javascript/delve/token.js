import * as THREE from "three"

const LETTER_SPACING = 1.2

function makeNameTexture(name, hpInner, hpOuter, diameter) {
  const canvasSize = 1024
  const canvasScale = canvasSize / diameter
  const arcRadius = ((hpInner + hpOuter) / 2) * canvasScale
  const fontSize = Math.round((hpOuter - hpInner) * canvasScale * 1.187)

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
  for (const char of name) totalWidth += ctx.measureText(char).width * LETTER_SPACING
  const totalAngle = totalWidth / arcRadius

  let charAngle = -totalAngle / 2
  for (const char of name) {
    const charWidth = ctx.measureText(char).width
    ctx.save()
    ctx.translate(canvasSize / 2, canvasSize / 2)
    ctx.rotate(charAngle + charWidth / (2 * arcRadius))
    ctx.translate(0, -arcRadius)
    ctx.strokeText(char, 0, 0)
    ctx.fillText(char, 0, 0)
    ctx.restore()
    charAngle += charWidth * LETTER_SPACING / arcRadius
  }

  return new THREE.CanvasTexture(canvas)
}

export function createToken({ color, name, texture, diameter, camAngle, health = 1.0, facing = null }) {
  const radius = diameter / 2
  const height = diameter / 3
  const top = height

  const group = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 32),
    new THREE.MeshLambertMaterial({ color })
  )
  body.position.y = height / 2
  group.add(body)

  const discRadius = radius * 0.75
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(discRadius, 32),
    new THREE.MeshBasicMaterial({ map: texture })
  )
  disc.rotation.x = -Math.PI / 2
  disc.rotation.z = camAngle
  disc.position.y = top + 0.01
  group.add(disc)

  const hpInner = radius * 0.8
  const hpOuter = radius * 0.95

  const hpBg = new THREE.Mesh(
    new THREE.RingGeometry(hpInner, hpOuter, 64, 1, Math.PI + health * Math.PI, (1 - health) * Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x333333 })
  )
  hpBg.rotation.x = -Math.PI / 2
  hpBg.rotation.z = camAngle
  hpBg.position.y = top + 0.02
  group.add(hpBg)

  const hpBar = new THREE.Mesh(
    new THREE.RingGeometry(hpInner, hpOuter, 64, 1, Math.PI, health * Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x44dd44 })
  )
  hpBar.rotation.x = -Math.PI / 2
  hpBar.rotation.z = camAngle
  hpBar.position.y = top + 0.021
  group.add(hpBar)

  if (facing !== null) {
    const arcInnerR = radius + 1/12
    const arcOuterR = radius + 5/12
    const arcHeight = height * 0.25
    const centeredAt = Math.PI / 2 - facing
    const startAngle = centeredAt - Math.PI / 8
    const endAngle = centeredAt + Math.PI / 8

    const shape = new THREE.Shape()
    shape.absarc(0, 0, arcOuterR, startAngle, endAngle, false)
    shape.absarc(0, 0, arcInnerR, endAngle, startAngle, true)
    shape.closePath()

    const facingArc = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: arcHeight, bevelEnabled: false }),
      new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.85 })
    )
    facingArc.rotation.x = -Math.PI / 2
    facingArc.position.y = height
    group.add(facingArc)
  }

  const namePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(diameter, diameter),
    new THREE.MeshBasicMaterial({ map: makeNameTexture(name, hpInner, hpOuter, diameter), transparent: true })
  )
  namePlane.rotation.x = -Math.PI / 2
  namePlane.rotation.z = camAngle
  namePlane.position.y = top + 0.03
  group.add(namePlane)

  return group
}
