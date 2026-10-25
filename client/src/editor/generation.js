// Runs tile generation on a pool of workers. One run at a time; starting another cancels the
// first.
export class TileGenerator {
  constructor() {
    this.size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    this.current = null;
  }

  // Calls onTile({ tx, tz, gz, rgba, cells }) as each tile finishes; resolves when all are done.
  run(zones, seedKey, tiles, onTile) {
    this.cancel();
    while (this.workers.length < Math.min(this.size, tiles.length)) {
      this.workers.push(new Worker(new URL("./generateWorker.js", import.meta.url), { type: "module" }));
    }
    const queue = [...tiles];
    const run = { cancelled: false };
    this.current = run;

    return new Promise((resolve, reject) => {
      let pending = 0;
      const feed = (worker) => {
        if (run.cancelled) return;
        const next = queue.shift();
        if (!next) {
          if (pending === 0) resolve();
          return;
        }
        pending++;
        worker.postMessage({ type: "tile", tx: next[0], tz: next[1] });
      };
      for (const worker of this.workers) {
        worker.onmessage = ({ data }) => {
          pending--;
          if (run.cancelled) return;
          onTile(data);
          feed(worker);
        };
        worker.onerror = (e) => {
          run.cancelled = true;
          reject(new Error(e.message));
        };
        worker.postMessage({ type: "prepare", zones, seedKey });
        feed(worker);
      }
    });
  }

  cancel() {
    if (this.current) this.current.cancelled = true;
    this.current = null;
  }
}
