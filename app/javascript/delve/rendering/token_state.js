export class TokenState {
  constructor ({ x, z, facing, hp, maxHp, alive = true }) {
    this.x = x
    this.z = z
    this.facing = facing
    this.hp = hp
    this.maxHp = maxHp
    this.alive = alive
  }

  static interpolate (a, b, t) {
    // Lerp facing via shortest angular path
    const facingDelta = ((b.facing - a.facing + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
    return new TokenState({
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      facing: a.facing + facingDelta * t,
      hp: b.hp,
      maxHp: b.maxHp,
      alive: b.alive
    })
  }
}
