// The stock effects made of simple shapes with a texture scrolling across them (visuals.js draws
// them). Each has how long it lasts in seconds, how it fades, how high it stands as a share of what
// it's on (rise) or in feet (raise), and its layers:
// - shape: sphere, cylinder, cone, ring or arc.
// - color: main or trim. Each layer's brightest parts go toward trim.
// - radius: in feet, or [from, to] to grow as it plays. bodies: radius and tall are shares of the
//   height of what it's on.
// - tall: a cylinder's height. long: a cone's length. inner: how far out a ring or arc starts, a share
//   of its radius. sweep and start: how much of a circle an arc covers, in radians.
// - texture: a repeating one, by name. repeat: how many times it goes [around, up] the shape.
//   scroll: how fast it moves that way, in repeats a second.
// - edge: how much of the shape's width fades out at its edges. rim: how much it shows only where
//   it turns away from you, as a shield does. trail: an arc fades toward its start.
// - opacity: 0 to 1.

const LAYER = { color: "main", opacity: 1, repeat: [1, 1], scroll: [0, 0], edge: 0, rim: 0, trail: false, texture: "energy" };

export const SHAPE_STOCK = {
  bolt: {
    duration: 1,
    fade: "none",
    layers: [
      { ...LAYER, shape: "sphere", radius: 0.6, texture: "energy", repeat: [2, 1], scroll: [1.5, 2], opacity: 0.85 },
      { ...LAYER, shape: "sphere", radius: 0.3, texture: "plain", color: "trim" },
    ],
  },
  burst: {
    duration: 0.45,
    fade: "out",
    rise: 0.5,
    layers: [
      { ...LAYER, shape: "sphere", radius: [0.6, 3.8], texture: "energy", repeat: [2, 1], scroll: [0.3, 0.8], opacity: 0.9 },
      { ...LAYER, shape: "sphere", radius: [0.5, 2.5], texture: "energy", repeat: [3, 2], scroll: [-0.4, 0.6], color: "trim", opacity: 0.8 },
    ],
  },
  ring: {
    duration: 0.7,
    fade: "out",
    raise: 0.15,
    layers: [
      { ...LAYER, shape: "ring", inner: 0.6, radius: [1, 8], texture: "energy", repeat: [4, 0.5], scroll: [0.3, -0.5], edge: 0.3 },
      { ...LAYER, shape: "ring", inner: 0.75, radius: [0.8, 6.5], texture: "plain", edge: 0.5, color: "trim", opacity: 0.8 },
    ],
  },
  glow: {
    duration: 0.9,
    fade: "pulse",
    rise: 0.5,
    layers: [
      { ...LAYER, shape: "sphere", bodies: true, radius: [0.45, 0.55], texture: "energy", repeat: [2, 1], scroll: [0.15, 0.4], rim: 1.2, opacity: 0.9 },
      { ...LAYER, shape: "sphere", bodies: true, radius: [0.3, 0.36], texture: "motes", repeat: [3, 2], scroll: [-0.2, 0.6], color: "trim", opacity: 0.8 },
    ],
  },
  swirl: {
    duration: 1.1,
    fade: "pulse",
    layers: [
      { ...LAYER, shape: "cylinder", radius: [1.8, 1.1], tall: 1, bodies: false, texture: "swirl", repeat: [2, 1], scroll: [0.9, -0.6], edge: 0.35 },
      { ...LAYER, shape: "cylinder", radius: [1.3, 0.8], tall: 1, bodies: false, texture: "swirl", repeat: [1, 1], scroll: [-1.3, -0.8], edge: 0.35, color: "trim", opacity: 0.8 },
    ],
  },
  beam: {
    duration: 0.5,
    fade: "pulse",
    layers: [
      { ...LAYER, shape: "cylinder", radius: 0.42, texture: "streaks", repeat: [1, 0.25], scroll: [0, 1], rim: 0.6, opacity: 0.9 },
      { ...LAYER, shape: "cylinder", radius: 0.14, texture: "energy", repeat: [1, 0.25], scroll: [0.5, 1.6], color: "trim" },
    ],
  },
  slash: {
    duration: 0.28,
    fade: "out",
    rise: 0.6,
    layers: [
      { ...LAYER, shape: "arc", inner: 0.55, radius: 3, start: -0.6, sweep: 2.4, texture: "bands", scroll: [-2, 0], edge: 0.35, trail: true },
      { ...LAYER, shape: "arc", inner: 0.78, radius: 2.8, start: -0.6, sweep: 2.4, texture: "plain", edge: 0.5, trail: true, color: "trim" },
    ],
  },
  cone: {
    duration: 0.55,
    fade: "out",
    rise: 0.65,
    grow: 0.34,
    layers: [
      { ...LAYER, shape: "cone", radius: 3, long: 12, texture: "streaks", repeat: [3, 1], scroll: [0.1, -2], edge: 0.2, opacity: 0.75 },
      { ...LAYER, shape: "cone", radius: 1.4, long: 12, texture: "streaks", repeat: [2, 1], scroll: [-0.2, -3], edge: 0.2, color: "trim", opacity: 0.85 },
    ],
  },
  shield: {
    duration: 1.2,
    fade: "hold",
    rise: 0.5,
    layers: [
      { ...LAYER, shape: "sphere", bodies: true, radius: 0.66, texture: "hex", repeat: [2, 1], scroll: [0.03, 0.06], rim: 1.1 },
      { ...LAYER, shape: "sphere", bodies: true, radius: 0.64, texture: "energy", repeat: [2, 1], scroll: [-0.1, 0.2], rim: 1.1, color: "trim", opacity: 0.55 },
    ],
  },
};

export const SHAPES = ["sphere", "cylinder", "cone", "ring", "arc"];
export const SHAPE_FADES = ["out", "pulse", "hold", "none"];
export const SHAPE_EFFECTS = Object.keys(SHAPE_STOCK);
export const isShapeEffect = (name) => Object.hasOwn(SHAPE_STOCK, name);

// How a shape's seen u of the way through, from 0 to 1.
export function fadeAt(fade, u) {
  if (fade === "pulse") return Math.sin(u * Math.PI);
  if (fade === "hold") return Math.max(0, Math.min(1, u * 5, (1 - u) * 3));
  if (fade === "none") return 1;
  return 1 - u;
}

// A stock effect with its parameters laid over it. Those about the texture and shape go to each layer.
export function shapeSpec(name, params = {}) {
  const stock = SHAPE_STOCK[name];
  const given = (key) => params[key] !== undefined && params[key] !== null;
  const layers = stock.layers.map((layer) => {
    const out = { ...layer };
    if (given("shape")) out.shape = params.shape;
    if (given("texture")) out.texture = params.texture;
    out.scroll = [given("scrollAcross") ? params.scrollAcross : layer.scroll[0], given("scroll") ? params.scroll : layer.scroll[1]];
    out.repeat = [given("repeatAcross") ? params.repeatAcross : layer.repeat[0], given("repeat") ? params.repeat : layer.repeat[1]];
    if (given("opacity")) out.opacity = layer.opacity * params.opacity;
    return out;
  });
  return { ...stock, duration: given("duration") ? params.duration : stock.duration, fade: given("fade") ? params.fade : stock.fade, layers };
}
