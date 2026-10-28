import { validateWorld } from "../world/validate.js";

// Checks a world's stored files off the main thread (validation.js).
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ problems: validateWorld(data.files) });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
