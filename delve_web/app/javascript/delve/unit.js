import { TokenState } from 'delve/rendering/token_state'

const TICK_SECONDS = 0.1
const MOVE_AMOUNT = 15 * TICK_SECONDS
const TURN_AMOUNT = 120 * Math.PI / 180 * TICK_SECONDS

export class Unit {
  constructor (data) {
    this.data = data
    this.radius = data.diameter / 2
  }

  tick (state, pushOut = null) {
    const roll = Math.random()
    if (roll < 1 / 3) {
      const dir = Math.random() < 0.5 ? -1 : 1
      return new TokenState({ x: state.x, z: state.z, facing: state.facing + dir * TURN_AMOUNT, hp: state.hp, maxHp: state.maxHp })
    } else if (roll < 2 / 3) {
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
