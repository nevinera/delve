export class CollisionChecker {
  constructor (segments) {
    this._segments = segments
  }

  _closestPointOnSegment (px, pz, { x1, z1, x2, z2 }) {
    const dx = x2 - x1
    const dz = z2 - z1
    const lenSq = dx * dx + dz * dz
    if (lenSq === 0) return { x: x1, z: z1 }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq))
    return { x: x1 + t * dx, z: z1 + t * dz }
  }

  crossedWalls (x, z, radius) {
    for (const seg of this._segments) {
      const cp = this._closestPointOnSegment(x, z, seg)
      const dx = x - cp.x
      const dz = z - cp.z
      if (dx * dx + dz * dz < radius * radius) return true
    }
    return false
  }

  pushOutFromWalls (x, z, radius) {
    let px = x
    let pz = z
    for (const seg of this._segments) {
      const cp = this._closestPointOnSegment(px, pz, seg)
      const dx = px - cp.x
      const dz = pz - cp.z
      const distSq = dx * dx + dz * dz
      if (distSq > 0 && distSq < radius * radius) {
        const dist = Math.sqrt(distSq)
        const push = radius - dist
        px += (dx / dist) * push
        pz += (dz / dist) * push
      }
    }
    return { x: px, z: pz }
  }
}
