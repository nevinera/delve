import {createRequire} from "module";
import {writeFileSync} from "fs";
import {it} from "vitest";
import {renderCellMap} from "../render";
import {generateCellMap} from "../generate";
const require = createRequire("/private/tmp/claude-501/-Users-albrights-src-nev-delve/d795efb6-7883-400e-898c-eadca12e5784/scratchpad/canvas/");
const {createCanvas} = require("@napi-rs/canvas");
it("previews", () => {
  for (const [name, tags] of [["plain", []], ["chamber", ["chamber"]], ["hub", ["hub"]], ["burrow", ["burrow", "chaotic"]], ["coral", ["coral", "tight"]], ["cavities", ["cavities", "tree"]], ["wet", ["wet"]], ["rough", ["rough", "chamber"]], ["paths", ["paths", "chamber"]]]) {
    const map = generateCellMap({cols: 40, rows: 30, seed: 7, connections: 4, tags});
    const {canvas} = renderCellMap(map, {pixelsPerFoot: 4, createCanvas});
    writeFileSync("/private/tmp/claude-501/-Users-albrights-src-nev-delve/d795efb6-7883-400e-898c-eadca12e5784/scratchpad/prev/gen-" + name + ".png", canvas.toBuffer("image/png"));
  }
});
