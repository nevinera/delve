export class TokenDescriptor {
  constructor({ color, name, diameter, camAngle, health = 1.0, facing = null }) {
    this.color = color
    this.camAngle = camAngle

    const radius = diameter / 2
    const height = diameter / 3
    const hpInner = radius * 0.8
    const hpOuter = radius * 0.95
    const canvasSize = 1024
    const canvasScale = canvasSize / diameter

    this.body = { radius, height }

    this.disc = {
      radius: radius * 0.75,
      position_y: height + 0.01
    }

    this.health_bar = {
      inner_radius: hpInner,
      outer_radius: hpOuter,
      current_arc: {
        theta_start: Math.PI,
        theta_length: health * Math.PI
      },
      missing_arc: {
        theta_start: Math.PI + health * Math.PI,
        theta_length: (1 - health) * Math.PI
      }
    }

    this.facing_arc = facing === null ? null : {
      inner_radius: radius + 1 / 12,
      outer_radius: radius + 5 / 12,
      height: height * 0.25,
      theta_start: Math.PI / 2 - facing - Math.PI / 8,
      theta_end: Math.PI / 2 - facing + Math.PI / 8,
      position_y: height
    }

    this.name = {
      text: name,
      canvas_size: canvasSize,
      canvas_arc_radius: (hpInner + hpOuter) / 2 * canvasScale,
      font_size: Math.round((hpOuter - hpInner) * canvasScale * 1.187),
      plane_size: diameter,
      position_y: height + 0.03
    }
  }
}
