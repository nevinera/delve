import { gzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_SPAN_FT, NET_SLUG, TILE_COLUMNS, decodeCaves, emptyColumns, encodeCaves, openAir } from "./caves.js";
import { loadZipper } from "./zstd.js";

const COLUMNS = TILE_COLUMNS * TILE_COLUMNS;

// The file's cells line for one tile, and the tile read back.
function roundTrip(columns) {
  const bytes = encodeCaves([-1, 2], new Map([[9, columns]]));
  const lines = new TextDecoder().decode(bytes).split("\n");
  const { coords, tiles, old } = decodeCaves(bytes);
  expect(coords).toEqual([-1, 2]);
  expect(old).toBe(false);
  expect(lines.slice(0, 2)).toEqual(["caves 2 -1 2", "tile 9 deep-hollow"]);
  return { line: lines[2], back: tiles.get(9) };
}

// A tile with a tunnel along its middle row, a span or two in each column, and `shallow` columns
// with a span just under the ground.
function tunnel(depth = 0, shallow = 5000) {
  const columns = emptyColumns();
  const net = "deep-hollow";
  for (let i = 0; i < TILE_COLUMNS; i++) {
    columns[64 * TILE_COLUMNS + i] = [{ floor: -40 + 2 * Math.round(depth * i), ceiling: -30 + 2 * Math.round(depth * i), stone: [0, 1, 6], net }];
    if (i % 2) columns[64 * TILE_COLUMNS + i].push({ floor: -20, ceiling: 2, stone: [3, 3, 3], net });
  }
  for (let k = 0; k < shallow; k++) columns[k] = [{ floor: -8, ceiling: -4, stone: [5, 5, 1], net }];
  return columns;
}

describe("caves files, unzipped", () => {
  it("lists few spans by column", () => {
    const columns = emptyColumns();
    const net = "deep-hollow";
    columns[5] = [{ floor: -10, ceiling: -2, stone: [2, 6, 0], net }, { floor: 4, ceiling: 10, stone: [0, 0, 7], net }];
    columns[COLUMNS - 1] = [{ floor: -900, ceiling: 100, stone: [1, 1, 1], net }];
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
    const columns = tunnel(15);
    const { line, back } = roundTrip(columns);
    expect(line.startsWith("c3 ")).toBe(true);
    expect(back).toEqual(columns);
  });

  it("writes each network's spans in a tile on a line of their own, the highest first", () => {
    const columns = emptyColumns();
    columns[3] = [
      { floor: -120, ceiling: -110, stone: [0, 0, 0], net: "low-run" },
      { floor: -40, ceiling: -30, stone: [1, 1, 1], net: "high-run" },
    ];
    columns[4] = [{ floor: -118, ceiling: -100, stone: [0, 0, 0], net: "low-run" }];
    const bytes = encodeCaves([0, 0], new Map([[1, columns], [0, tunnel()]]));
    const tileLines = new TextDecoder().decode(bytes).split("\n").filter((l) => l.startsWith("tile "));
    expect(tileLines).toEqual(["tile 0 deep-hollow", "tile 1 high-run", "tile 1 low-run"]);
    const { tiles } = decodeCaves(bytes);
    expect(tiles.get(1)).toEqual(columns);
    expect(tiles.get(0)).toEqual(tunnel());
  });

  it("takes files from before cave networks as having none", () => {
    const old = decodeCaves(new TextEncoder().encode("caves 1 3 -4\ntile 2\nc1 AA\n"));
    expect(old).toEqual({ coords: [3, -4], tiles: new Map(), old: true });
    const binary = decodeCaves(gzipSync(new TextEncoder().encode("DLC1")));
    expect(binary.old).toBe(true);
    expect(binary.tiles.size).toBe(0);
  });

  it("names networks with slugs", () => {
    expect(NET_SLUG.test("wailing-hollow")).toBe(true);
    expect(NET_SLUG.test("Wailing Hollow")).toBe(false);
    expect(NET_SLUG.test("-x")).toBe(false);
  });

  it("keeps spans under 1,024 ft high", () => {
    const [span] = openAir(null, -2000, 0, { stone: [0, 0, 0] });
    expect(span.ceiling - span.floor).toBe(MAX_SPAN_FT);
  });
});

describe("caves files, zipped", () => {
  beforeAll(() => loadZipper());

  it("zips a tile where that's shorter", () => {
    for (const columns of [tunnel(), tunnel(15)]) {
      const { line, back } = roundTrip(columns);
      expect(line.split(" ")[0]).toMatch(/^c[23]z$/);
      expect(back).toEqual(columns);
    }
  });
});
