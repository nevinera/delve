// Built objects that ship with the game (builtObjects.js's format), for scattered types made of
// pieces. They're in feet at the size given by their type's unitFt (objects.js). Their colors are
// parameters, which scattering picks from the type's ranges; the palette holds a likely default.

const wood = (color) => [{ color, param: true, name: "wood" }];
const box = (size, at, turn = [0, 0, 0]) => ({ type: "box", size, at, turn, color: 0 });
// A log lying along x, its narrower end to the west, resting a little into the ground.
const log = (radius) => ({ type: "cylinder", taper: 0.85, size: [radius * 2, 30, radius * 2], at: [0, radius * 0.9, 0], turn: [0, 0, 90], color: 0 });

export const KIT_OBJECTS = {
  fence: {
    id: "kitfence",
    name: "fence",
    palette: wood("#c4bcae"),
    pieces: [
      box([0.48, 4, 0.48], [-4.8, 2, 0]),
      box([0.48, 2.8, 0.48], [0, 1.4, 0]),
      box([0.48, 4, 0.48], [4.8, 2, 0]),
      box([10.4, 0.32, 0.2], [0, 3.2, 0]),
      box([5.6, 0.32, 0.2], [-2.4, 1.4, 0], [0, 0, -20]),
    ],
  },
  log: { id: "kitlog00", name: "log", palette: wood("#5c4630"), pieces: [log(3)] },
  driftLog: { id: "kitdrift", name: "drift log", palette: wood("#b8b0a0"), pieces: [log(2.1)] },
};
