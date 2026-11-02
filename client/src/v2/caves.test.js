import { gzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_SPAN_FT, TILE_CELLS, decodeCaves, emptyColumns, encodeCaves, openAir } from "./caves.js";
import { loadZipper } from "./zstd.js";

const COLUMNS = TILE_CELLS * TILE_CELLS;

// The file's cells line for one tile, and the tile read back.
function roundTrip(columns) {
  const bytes = encodeCaves([-1, 2], new Map([[9, columns]]));
  const lines = new TextDecoder().decode(bytes).split("\n");
  const { coords, tiles } = decodeCaves(bytes);
  expect(coords).toEqual([-1, 2]);
  expect(lines.slice(0, 2)).toEqual(["caves 1 -1 2", "tile 9"]);
  return { line: lines[2], back: tiles.get(9) };
}

// A tile with a tunnel along its middle row, a span or two in each cell.
function tunnel(depth = 0) {
  const columns = emptyColumns();
  for (let i = 0; i < TILE_CELLS; i++) {
    columns[32 * TILE_CELLS + i] = [{ floor: -40.25 + depth * i, ceiling: -30 + depth * i, stone: [0, 1, 6] }];
    if (i % 2) columns[32 * TILE_CELLS + i].push({ floor: -20, ceiling: 2, stone: [3, 3, 3] });
  }
  for (let k = 0; k < 2000; k++) columns[k] = [{ floor: -8, ceiling: -4, stone: [5, 5, 1] }];
  return columns;
}

describe("caves files, unzipped", () => {
  it("keeps entrances after the tiles, a line each, to a hundredth of a foot", () => {
    const join = { cells: [[3, 4], [4, 4]], plane: { center: [1.004, -2, 3], normal: [0, 1, 0] }, ground: [[0, 1.2345, 0], [1, 1, 0], [1, 1, 1]], rock: [[0, 0, 0], [1, -0.001, 1], [0, 0, 1]], steps: "abab" };
    const bytes = encodeCaves([-1, 2], new Map([[9, tunnel()]]), [{ id: "n7", ...join }]);
    const lines = new TextDecoder().decode(bytes).trim().split("\n");
    expect(lines.at(-2)).toBe("entrances");
    const { tiles, entrances } = decodeCaves(bytes);
    expect(tiles.get(9)).toEqual(tunnel());
    expect(entrances).toEqual([{ id: "n7", ...join, plane: { center: [1, -2, 3], normal: [0, 1, 0] }, ground: [[0, 1.23, 0], [1, 1, 0], [1, 1, 1]], rock: [[0, 0, 0], [1, 0, 1], [0, 0, 1]] }]);
  });

  it("lists few spans by cell", () => {
    const columns = emptyColumns();
    columns[5] = [{ floor: -10.25, ceiling: -2, stone: [2, 6, 0] }, { floor: 4, ceiling: 9.5, stone: [0, 0, 7] }];
    columns[COLUMNS - 1] = [{ floor: -900, ceiling: 100, stone: [1, 1, 1] }];
    const { line, back } = roundTrip(columns);
    expect(line.startsWith("c1 AD ")).toBe(true);
    expect(back).toEqual(columns);
  });

  it("keeps starts over a base where they're within 1,024 ft", () => {
    const columns = tunnel();
    const { line, back } = roundTrip(columns);
    expect(line.startsWith("c2 ")).toBe(true);
    expect(back).toEqual(columns);
  });

  it("writes starts absolutely where they spread wider", () => {
    const columns = tunnel(30);
    const { line, back } = roundTrip(columns);
    expect(line.startsWith("c3 ")).toBe(true);
    expect(back).toEqual(columns);
  });

  it("reads the binary files written before", () => {
    const bytes = new Uint8Array(17 + 1 + COLUMNS + 10);
    const view = new DataView(bytes.buffer);
    bytes.set([..."DLC1"].map((c) => c.charCodeAt(0)));
    view.setUint32(4, 1, true);
    view.setInt32(8, 3, true);
    view.setInt32(12, -4, true);
    [bytes[16], bytes[17], bytes[18 + 7]] = [1, 2, 1];
    view.setInt32(18 + COLUMNS, -41, true);
    view.setInt32(18 + COLUMNS + 4, -8, true);
    [bytes[18 + COLUMNS + 8], bytes[18 + COLUMNS + 9]] = [2, 1];
    const { coords, tiles } = decodeCaves(gzipSync(bytes));
    expect(coords).toEqual([3, -4]);
    expect(tiles.get(2)[7]).toEqual([{ floor: -10.25, ceiling: -2, stone: [6, 6, 6] }]);
  });

  it("keeps spans under 1,024 ft high", () => {
    const [span] = openAir(null, -2000, 0, { stone: [0, 0, 0] });
    expect(span.ceiling - span.floor).toBe(MAX_SPAN_FT);
  });
});

describe("caves files, zipped", () => {
  beforeAll(() => loadZipper());

  it("zips a tile where that's shorter", () => {
    for (const columns of [tunnel(), tunnel(30)]) {
      const { line, back } = roundTrip(columns);
      expect(line.split(" ")[0]).toMatch(/^c[23]z$/);
      expect(back).toEqual(columns);
    }
  });
});
