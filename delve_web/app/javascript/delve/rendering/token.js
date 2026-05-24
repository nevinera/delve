import * as THREE from 'three'

const LETTER_SPACING = 1.2

function makeNameTexture ({ text, canvasSize, canvasArcRadius, fontSize, planeSize }) {
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

export function renderToken (descriptor, texture) {
  const { color, camAngle, body, disc, healthBar, facingArc, name } = descriptor
  const group = new THREE.Group()

  const bodyMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(body.radius, body.radius, body.height, 32),
    new THREE.MeshLambertMaterial({ color })
  )
  bodyMesh.position.y = body.height / 2
  group.add(bodyMesh)

  const discMesh = new THREE.Mesh(
    new THREE.CircleGeometry(disc.radius, 32),
    new THREE.MeshBasicMaterial({ map: texture })
  )
  discMesh.rotation.x = -Math.PI / 2
  discMesh.rotation.z = camAngle
  discMesh.position.y = disc.position_y
  group.add(discMesh)

  const hpBg = new THREE.Mesh(
    new THREE.RingGeometry(
      healthBar.inner_radius, healthBar.outer_radius, 64, 1,
      healthBar.missing_arc.theta_start, healthBar.missing_arc.theta_length
    ),
    new THREE.MeshBasicMaterial({ color: 0x333333 })
  )
  hpBg.rotation.x = -Math.PI / 2
  hpBg.rotation.z = camAngle
  hpBg.position.y = body.height + 0.02
  group.add(hpBg)

  const hpBar = new THREE.Mesh(
    new THREE.RingGeometry(
      healthBar.inner_radius, healthBar.outer_radius, 64, 1,
      healthBar.current_arc.theta_start, healthBar.current_arc.theta_length
    ),
    new THREE.MeshBasicMaterial({ color: 0x44dd44 })
  )
  hpBar.rotation.x = -Math.PI / 2
  hpBar.rotation.z = camAngle
  hpBar.position.y = body.height + 0.021
  group.add(hpBar)

  if (facingArc !== null) {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, facingArc.outer_radius, facingArc.theta_start, facingArc.theta_end, false)
    shape.absarc(0, 0, facingArc.inner_radius, facingArc.theta_end, facingArc.theta_start, true)
    shape.closePath()

    const facingMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: facingArc.height, bevelEnabled: false }),
      new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.85 })
    )
    facingMesh.rotation.x = -Math.PI / 2
    facingMesh.position.y = facingArc.position_y
    group.add(facingMesh)
  }

  const namePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(name.planeSize, name.planeSize),
    new THREE.MeshBasicMaterial({ map: makeNameTexture(name), transparent: true })
  )
  namePlane.rotation.x = -Math.PI / 2
  namePlane.rotation.z = camAngle
  namePlane.position.y = name.position_y
  group.add(namePlane)

  return group
}
