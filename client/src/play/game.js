// The play page's connection to the game server (.agents/formats.md): it enters with
// the page's entry token, reports how your character moves, puts your character back where the
// server says when it corrects you, and hands what it hears about everyone else to `on`.

const TICK_MS = 100; // how often to look at how you're moving
const HEARTBEAT_MS = { moving: 500, still: 1000 };

// How the walker's character is moving, as the protocol's `move`.
export function movementOf(walker) {
  const key = (k) => (walker.held.has(k) ? 1 : 0);
  const swim = Boolean(walker.motion?.swimming);
  return {
    forward: key("w") - key("s"),
    strafe: key("q") - key("e"),
    turn: key("a") - key("d"),
    gait: walker.sprinting && !swim ? "sprint" : walker.gait === "walk" ? "walk" : "run",
    swim,
    jump: false,
  };
}

const sameMove = (a, b) => a && b && Object.keys(a).every((k) => a[k] === b[k]);
const moving = (m) => Boolean(m.forward || m.strafe || m.turn);

// What to send now, given what was sent last ({ move, yaw, at: ms }): a move when the movement
// has changed or a jump has started, a heartbeat when one is due, or null.
export function nextReport(last, move, yaw, jumped, now) {
  if (!last || !sameMove(last.move, move) || jumped) return "move";
  const turning = moving(move) || yaw !== last.yaw;
  return now - last.at >= (turning ? HEARTBEAT_MS.moving : HEARTBEAT_MS.still) ? "heartbeat" : null;
}

export class GameConnection {
  // game: { url, token } from the page. on: { welcome, snapshot, appear, vanish, moved, error, closed }.
  constructor(game, on) {
    this.on = on;
    this.socket = new WebSocket(`${game.url}/play?token=${encodeURIComponent(game.token)}`);
    this.socket.addEventListener("message", (e) => {
      const message = JSON.parse(e.data);
      if (message.type === "correct") this.correct(message);
      else this.on[message.type]?.(message);
    });
    this.socket.addEventListener("close", () => {
      clearInterval(this.timer);
      this.on.closed?.();
    });
  }

  // Reports the movement of the view's walker from now on.
  report(view) {
    this.view = view;
    this.last = null;
    this.timer = setInterval(() => this.tick(view), TICK_MS);
  }

  // Asks to use an ability, after saying where you are so it's checked against that.
  use(ability, target, spot) {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    if (this.view) this.tick(this.view, true);
    this.socket.send(JSON.stringify({ type: "use", ability, target, ...(spot ? { spot } : {}) }));
  }

  stop() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "stop" }));
  }

  // now: report even if nothing's due.
  tick(view, now = false) {
    const { walker, origin } = view;
    // Paused, it still sends heartbeats, so the server knows you're there.
    if (!walker?.pos || this.socket.readyState !== WebSocket.OPEN) return;
    const move = movementOf(walker);
    const jumped = this.jumpedAt !== undefined && walker.jumpedAt !== this.jumpedAt;
    this.jumpedAt = walker.jumpedAt;
    const type = nextReport(this.last, move, walker.yaw, jumped, performance.now()) ?? (now ? "heartbeat" : null);
    if (!type) return;
    const at = [walker.pos.x + origin[0], walker.pos.y, walker.pos.z + origin[1]];
    const message = { type, t: performance.now(), at, yaw: walker.yaw };
    if (type === "move") message.move = { ...move, jump: jumped };
    this.socket.send(JSON.stringify(message));
    this.last = { move, yaw: walker.yaw, at: performance.now() };
  }

  // The server didn't take a move: back to where it has you, and report afresh from there.
  correct({ at, yaw }) {
    const { walker, origin } = this.view ?? {};
    if (!walker?.pos) return;
    walker.pos.set(at[0] - origin[0], at[1], at[2] - origin[1]);
    walker.vy = 0;
    walker.yaw = yaw;
    this.last = null;
  }

  close() {
    clearInterval(this.timer);
    this.socket.close();
  }
}
