import { TokenState } from 'delve/rendering/token_state'

const TICK_SECONDS = 0.1
const MOVE_AMOUNT = 15 * TICK_SECONDS
const TURN_AMOUNT = 120 * Math.PI / 180 * TICK_SECONDS

export class Unit {
  constructor (data) {
    this.data = data
  }

  tick (state) {
    const roll = Math.random()
    if (roll < 1 / 3) {
      const dir = Math.random() < 0.5 ? -1 : 1
      return new TokenState({ x: state.x, z: state.z, facing: state.facing + dir * TURN_AMOUNT, hp: state.hp, maxHp: state.maxHp })
    } else if (roll < 2 / 3) {
      return new TokenState({
        x: state.x + Math.sin(state.facing) * MOVE_AMOUNT,
        z: state.z - Math.cos(state.facing) * MOVE_AMOUNT,
        facing: state.facing, hp: state.hp, maxHp: state.maxHp
      })
    } else {
      return new TokenState({ x: state.x, z: state.z, facing: state.facing, hp: state.hp, maxHp: state.maxHp })
    }
  }
}
