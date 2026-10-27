import { runBones } from "./bones.js";

// Runs a bones file (bones.js) off the main thread, since a big one takes a while: sends back the
// land's blocks, or what was wrong with the file.
self.onmessage = ({ data }) => {
  try {
    const land = runBones(data);
    self.postMessage({ blocks: land.blocks }, [...land.blocks.values()].map((block) => block.buffer));
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
