export class TokenDescriptor {
  constructor ({ color, name, diameter }) {
    this.color = color

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

    this.healthBar = {
      innerRadius: hpInner,
      outerRadius: hpOuter,
      positionY: height + 0.02,
      canvasSize,
      canvasScale
    }

    this.name = {
      text: name,
      canvasSize,
      canvasArcRadius: (hpInner + hpOuter) / 2 * canvasScale,
      fontSize: Math.round((hpOuter - hpInner) * canvasScale * 1.187),
      planeSize: diameter,
      position_y: height + 0.03
    }
  }
}
