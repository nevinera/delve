import * as THREE from "three"

const LETTER_SPACING = 1.2

function makeNameTexture({ text, canvas_size, canvas_arc_radius, font_size, plane_size }) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas_size
  canvas.height = canvas_size
  const ctx = canvas.getContext('2d')
  ctx.font = `bold ${font_size}px sans-serif`
  ctx.fillStyle = 'white'
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'
  ctx.lineWidth = 3
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let totalWidth = 0
  for (const char of text) totalWidth += ctx.measureText(char).width * LETTER_SPACING
  const totalAngle = totalWidth / canvas_arc_radius

  let charAngle = -totalAngle / 2
  for (const char of text) {
    const charWidth = ctx.measureText(char).width
    ctx.save()
    ctx.translate(canvas_size / 2, canvas_size / 2)
    ctx.rotate(charAngle + charWidth / (2 * canvas_arc_radius))
    ctx.translate(0, -canvas_arc_radius)
    ctx.strokeText(char, 0, 0)
    ctx.fillText(char, 0, 0)
    ctx.restore()
    charAngle += charWidth * LETTER_SPACING / canvas_arc_radius
  }

  return new THREE.CanvasTexture(canvas)
}

export function renderToken(descriptor, texture) {
  const { color, camAngle, body, disc, health_bar, facing_arc, name } = descriptor
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
      health_bar.inner_radius, health_bar.outer_radius, 64, 1,
      health_bar.missing_arc.theta_start, health_bar.missing_arc.theta_length
    ),
    new THREE.MeshBasicMaterial({ color: 0x333333 })
  )
  hpBg.rotation.x = -Math.PI / 2
  hpBg.rotation.z = camAngle
  hpBg.position.y = body.height + 0.02
  group.add(hpBg)

  const hpBar = new THREE.Mesh(
    new THREE.RingGeometry(
      health_bar.inner_radius, health_bar.outer_radius, 64, 1,
      health_bar.current_arc.theta_start, health_bar.current_arc.theta_length
    ),
    new THREE.MeshBasicMaterial({ color: 0x44dd44 })
  )
  hpBar.rotation.x = -Math.PI / 2
  hpBar.rotation.z = camAngle
  hpBar.position.y = body.height + 0.021
  group.add(hpBar)

  if (facing_arc !== null) {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, facing_arc.outer_radius, facing_arc.theta_start, facing_arc.theta_end, false)
    shape.absarc(0, 0, facing_arc.inner_radius, facing_arc.theta_end, facing_arc.theta_start, true)
    shape.closePath()

    const facingMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: facing_arc.height, bevelEnabled: false }),
      new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.85 })
    )
    facingMesh.rotation.x = -Math.PI / 2
    facingMesh.position.y = facing_arc.position_y
    group.add(facingMesh)
  }

  const namePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(name.plane_size, name.plane_size),
    new THREE.MeshBasicMaterial({ map: makeNameTexture(name), transparent: true })
  )
  namePlane.rotation.x = -Math.PI / 2
  namePlane.rotation.z = camAngle
  namePlane.position.y = name.position_y
  group.add(namePlane)

  return group
}
