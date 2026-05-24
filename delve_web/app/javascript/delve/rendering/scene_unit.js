import { TokenState } from 'delve/rendering/token_state'

export class SceneUnit {
  constructor (sceneNode, initialState) {
    this.sceneNode = sceneNode
    this.fromState = initialState
    this.toState = initialState
  }

  advanceTick (nextState) {
    this.fromState = this.toState
    this.toState = nextState
  }

  render (t) {
    this.sceneNode.update(TokenState.interpolate(this.fromState, this.toState, t))
  }
}
