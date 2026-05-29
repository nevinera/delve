import { TokenState } from 'delve/rendering/token_state'

const TICK_SECONDS = 0.1
const MOVE_AMOUNT = 15 * TICK_SECONDS
const TURN_AMOUNT = 120 * Math.PI / 180 * TICK_SECONDS

const ACTIONS = ['turnLeft', 'turnRight', 'forward', 'still']

export class Unit {
  constructor (data) {
    this.data = data
    this.radius = data.diameter / 2
    this._action = 'still'
  }

  tick (state, pushOut = null) {
    if (Math.random() < 0.25) {
      this._action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)]
    }
    return this._applyAction(state, pushOut)
  }

  _applyAction (state, pushOut) {
    if (this._action === 'turnLeft') {
      return new TokenState({ x: state.x, z: state.z, facing: state.facing - TURN_AMOUNT, hp: state.hp, maxHp: state.maxHp })
    } else if (this._action === 'turnRight') {
      return new TokenState({ x: state.x, z: state.z, facing: state.facing + TURN_AMOUNT, hp: state.hp, maxHp: state.maxHp })
    } else if (this._action === 'forward') {
      const steps = Math.max(1, Math.ceil(MOVE_AMOUNT / (this.radius * 0.9)))
      const stepDist = MOVE_AMOUNT / steps
      let x = state.x
      let z = state.z
      for (let i = 0; i < steps; i++) {
        x += Math.sin(state.facing) * stepDist
        z -= Math.cos(state.facing) * stepDist
        if (pushOut) ({ x, z } = pushOut(x, z))
      }
      return new TokenState({ x, z, facing: state.facing, hp: state.hp, maxHp: state.maxHp })
    } else {
      return new TokenState({ x: state.x, z: state.z, facing: state.facing, hp: state.hp, maxHp: state.maxHp })
    }
  }
}
