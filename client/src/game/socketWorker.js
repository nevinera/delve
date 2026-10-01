// Owns the game WebSocket off the main thread. The server drops a socket
// that's silent for 1.5s, and a phone's main thread can stall longer than
// that (rasterizing a big map, say) - so while the main thread is busy this
// worker keeps the socket alive itself with seq-less "keepalive" frames,
// which the server treats as a no-op.
const KEEPALIVE_MS = 500;

let ws = null;
let lastSentAt = 0;
let keepaliveTimer = null;

function post(msg) {
  self.postMessage(msg);
}

function stop() {
  clearInterval(keepaliveTimer);
  keepaliveTimer = null;
}

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "connect") {
    ws = new WebSocket(msg.url);
    ws.onopen = () => {
      lastSentAt = Date.now();
      keepaliveTimer = setInterval(() => {
        if (Date.now() - lastSentAt >= KEEPALIVE_MS) {
          lastSentAt = Date.now();
          ws.send(JSON.stringify({ direction: "up", type: "keepalive" }));
        }
      }, KEEPALIVE_MS / 2);
      post({ type: "open" });
    };
    ws.onmessage = (e) => post({ type: "message", data: e.data });
    ws.onclose = () => {
      stop();
      post({ type: "close" });
    };
    ws.onerror = () => post({ type: "error" });
  } else if (msg.type === "send") {
    if (ws?.readyState === WebSocket.OPEN) {
      lastSentAt = Date.now();
      ws.send(msg.data);
    }
  } else if (msg.type === "close") {
    stop();
    ws?.close();
  }
};
