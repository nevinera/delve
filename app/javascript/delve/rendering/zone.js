import * as THREE from 'three'

export function renderZone (descriptor) {
  const group = new THREE.Group()
  for (const wall of descriptor.walls) group.add(renderWall(wall))
  return group
}

function renderWall ({ polygonPoints, height, color }) {
  const shape = new THREE.Shape()
  polygonPoints.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  })
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.5 })))
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x000000 })))
  group.rotation.x = -Math.PI / 2
  return group
}
