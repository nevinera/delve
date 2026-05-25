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

  move (forward, side, elapsed) {
    const len = Math.sqrt(forward * forward + side * side)
    if (len === 0) return
    const { facing } = this.predictedState
    const fwdX = Math.sin(facing); const fwdZ = -Math.cos(facing)
    const rightX = Math.cos(facing); const rightZ = Math.sin(facing)
    const scale = MOVE_RATE * elapsed / len
    this.predictedState.x += (forward * fwdX + side * rightX) * scale
    this.predictedState.z += (forward * fwdZ + side * rightZ) * scale
  }

  render () {
    this.sceneNode.update(this.predictedState)
  }
}
