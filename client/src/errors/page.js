import "./install.js";
import "./page.css";
import { SourceMapConsumer } from "source-map-js";

// The errors page: turns each stack's lines in built files back into source lines, from the maps
// the build writes beside them. A map from an older build is gone, and those lines stay as they are.

const FRAME = /(https?:\/\/[^\s()]+\/client\/[^\s():]+\.js):(\d+):(\d+)/g;
const maps = new Map(); // url -> its map, or null

function mapOf(url) {
  if (!maps.has(url)) {
    maps.set(
      url,
      fetch(`${url}.map`)
        .then((response) => (response.ok ? response.json() : null))
        .then((map) => (map ? new SourceMapConsumer(map) : null))
        .catch(() => null),
    );
  }
  return maps.get(url);
}

async function unminify(stack) {
  const frames = [...stack.matchAll(FRAME)];
  let out = stack;
  for (const [whole, url, line, column] of frames) {
    const map = await mapOf(url);
    const at = map?.originalPositionFor({ line: Number(line), column: Number(column) - 1 });
    if (at?.source) out = out.replace(whole, `${at.source.replace(/^(\.\.\/)+/, "")}:${at.line}:${at.column + 1}${at.name ? ` (${at.name})` : ""}`);
  }
  return out;
}

for (const pre of document.querySelectorAll("[data-stack]")) {
  if (pre.textContent.trim()) unminify(pre.textContent).then((text) => (pre.textContent = text));
}
