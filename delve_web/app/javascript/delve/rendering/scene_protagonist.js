export class SceneProtagonist {
  constructor (sceneNode, initialState) {
    this.sceneNode = sceneNode
    this.predictedState = initialState
  }

  setFacing (facing) {
    this.predictedState.facing = facing
  }

  render () {
    this.sceneNode.update(this.predictedState)
  }
}
