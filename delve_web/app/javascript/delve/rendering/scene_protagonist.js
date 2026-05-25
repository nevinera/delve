const MOVE_RATE = 15 // world units/sec

export class SceneProtagonist {
  constructor (sceneNode, initialState, radius) {
    this.sceneNode = sceneNode
    this.predictedState = initialState
    this.radius = radius
  }

  setFacing (facing) {
    this.predictedState.facing = facing
  }

  move (forward, side, elapsed, pushOut = null) {
    const len = Math.sqrt(forward * forward + side * side)
    if (len === 0) return
    const steps = Math.max(1, Math.ceil(MOVE_RATE * elapsed / (this.radius * 0.9)))
    const stepElapsed = elapsed / steps
    for (let i = 0; i < steps; i++) {
      const { facing } = this.predictedState
      const fwdX = Math.sin(facing); const fwdZ = -Math.cos(facing)
      const rightX = Math.cos(facing); const rightZ = Math.sin(facing)
      const scale = MOVE_RATE * stepElapsed / len
      this.predictedState.x += (forward * fwdX + side * rightX) * scale
      this.predictedState.z += (forward * fwdZ + side * rightZ) * scale
      if (pushOut) {
        const corrected = pushOut(this.predictedState.x, this.predictedState.z)
        this.predictedState.x = corrected.x
        this.predictedState.z = corrected.z
      }
    }
  }

  render () {
    this.sceneNode.update(this.predictedState)
  }
}
