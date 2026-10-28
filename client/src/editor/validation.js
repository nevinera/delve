import { validateWorld } from "../world/validate.js";

// A world's stored files checked (world/validate.js) on a worker, or here where there are none.
// Resolves with the problems found.
export function validateStored(files) {
  if (typeof Worker === "undefined") return Promise.resolve(validateWorld(files));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./validateWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.problems);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "the validator stopped"));
    };
    worker.postMessage({ files });
  });
}
