export class WallDescriptor {
  constructor(points, { thickness = 1, height = 2, color = 0x333333 } = {}) {
    this.height = height
    this.color = color
    this.polygon_points = this._computePolygon(points, thickness / 2)
  }

  _computePolygon(points, half) {
    const normals = []
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1][0] - points[i][0]
      const dz = points[i + 1][1] - points[i][1]
      const len = Math.sqrt(dx * dx + dz * dz)
      normals.push([-dz / len, dx / len])
    }

    const offsetAt = (i, side) => {
      let ox, oz
      if (i === 0) {
        ox = normals[0][0] * half; oz = normals[0][1] * half
      } else if (i === points.length - 1) {
        ox = normals[i - 1][0] * half; oz = normals[i - 1][1] * half
      } else {
        const [n0x, n0z] = normals[i - 1]
        const [n1x, n1z] = normals[i]
        const mx = n0x + n1x, mz = n0z + n1z
        const mlen = Math.sqrt(mx * mx + mz * mz)
        const dot = n0x * mx / mlen + n0z * mz / mlen
        ox = mx / mlen * half / dot; oz = mz / mlen * half / dot
      }
      return [points[i][0] + side * ox, points[i][1] + side * oz]
    }

    const result = []
    for (let i = 0; i < points.length; i++) result.push(offsetAt(i, 1))
    for (let i = points.length - 1; i >= 0; i--) result.push(offsetAt(i, -1))
    return result
  }
}

export class ZoneDescriptor {
  constructor(walls) {
    this.walls = walls
  }
}
