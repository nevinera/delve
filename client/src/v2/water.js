// Water: bodies (sea, lakes, ponds, swamp pools) and, later, courses (rivers, streams), drawn by
// hand and baked into plate files (plate.js) as each cell's water: the height its surface stands
// at, in continent feet, and its type. A tile with no water keeps none.
//
// A tile's water is null, or { level: 64×64 feet, NaN where the cell's dry, type: 64×64 indexes
// into WATER_TYPES }, cells in row order.

export const WATER_TYPES = ["sea", "lake", "pond", "swamp", "river", "stream"];

// A tile's water with every cell dry.
export const dryWater = (cells) => ({ level: new Float32Array(cells).fill(NaN), type: new Uint8Array(cells) });
