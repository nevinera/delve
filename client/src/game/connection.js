import { computeChecksum } from "./checksum";
import { applyFullState, applyDelta, applyFullNCUs, applyNCUDelta } from "./state";

const HEARTBEAT_MS = 300;
// How long to remember what we've sent, keyed by seq, for matching a server
// echo back to exactly the send it answers. Generous on purpose: once
// matching is by exact id rather than guessing from position/timing, a
// longer window only costs a few bytes per entry, not precision - see
// positionForSeq/rttForSeq.
const SENT_RETENTION_MS = 10000;

export class GameConnection {
  constructor({
    gameServerUrl,
    instanceId,
    slotId,
    slotToken,
    onOpen,
    onClose,
    onStateChange,
    // Artificial one-way delay applied to every send and every receive, for
    // reproducing latency-dependent bugs (e.g. movement reconciliation)
    // without relying on Chrome's network throttling - which throttles the
    // WebSocket's opening HTTP handshake but not its ongoing frame traffic,
    // and has no jitter control at all. simulatedJitterMs adds independent
    // uniform random variance (+/-) to each direction of each message.
    simulatedLatencyMs = 0,
    simulatedJitterMs = 0,
  }) {
    this._onOpen = onOpen;
    this._onClose = onClose;
    this._onStateChange = onStateChange;
    this._simulatedLatencyMs = simulatedLatencyMs;
    this._simulatedJitterMs = simulatedJitterMs;

    const url = new URL(gameServerUrl);
    const scheme = url.protocol === "https:" ? "wss" : "ws";
    this._wsUrl = `${scheme}://${url.host}/instances/${instanceId}/slots/${slotId}/connect?token=${slotToken}`;

    this._ws = null;
    this._heartbeatTimer = null;
    this._units = {};
    this._ncus = {};
    // Latest scheduled delivery time (epoch ms) for each direction, so
    // _scheduleOrdered can enforce in-order delivery - see its comment.
    this._nextSendAt = 0;
    this._nextRecvAt = 0;

    // A single monotonically increasing id, stamped as a hex string on every
    // outgoing message (see _send) - not just heartbeat/move - so any
    // message type can be acked the same way without new plumbing.
    this._seq = 0;
    // seq -> the local Date.now() it was sent at, for every message (used by
    // rttForSeq). Map iteration order is insertion order, which is
    // chronological here, so _pruneOld can stop at the first still-fresh
    // entry rather than scanning the whole map.
    this._sentAt = new Map();
    // seq -> {x, y} for move messages that included a position, so
    // positionForSeq can match a server-echoed position (last_move_seq) back
    // to exactly the local prediction it answers - see scene.js's
    // reconciledTarget.
    this._sentPositions = new Map();
  }

  connect() {
    this._ws = new WebSocket(this._wsUrl);

    this._ws.onopen = () => {
      this._heartbeatTimer = setInterval(() => {
        this._send({ direction: "up", type: "heartbeat" });
      }, HEARTBEAT_MS);
      this._onOpen?.();
    };

    this._ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!this._simulatedLatencyMs && !this._simulatedJitterMs) {
        this._handleMessage(msg);
      } else {
        this._scheduleOrdered("_nextRecvAt", () => this._handleMessage(msg));
      }
    };

    this._ws.onclose = () => {
      clearInterval(this._heartbeatTimer);
      this._onClose?.();
    };

    this._ws.onerror = (e) => {
      console.error("WebSocket error", e);
    };
  }

  send(data) {
    this._send(data);
  }

  close() {
    clearInterval(this._heartbeatTimer);
    this._ws?.close();
  }

  async _handleMessage(msg) {
    if (msg.direction !== "down") return;

    if (msg.type === "instance-state") {
      this._units = applyFullState(msg);
      this._ncus = applyFullNCUs(msg);
      const local = await computeChecksum(this._units);
      if (local !== msg.checksum) {
        console.warn("checksum mismatch after full state", { server: msg.checksum, local });
      }
      this._onStateChange?.({ units: this._units, ncus: this._ncus });
    } else if (msg.type === "delta") {
      this._units = applyDelta(this._units, msg);
      this._ncus = applyNCUDelta(this._ncus, msg);
      const local = await computeChecksum(this._units);
      if (local !== msg.checksum) {
        console.warn("checksum mismatch after delta", { server: msg.checksum, local });
        this._send({ direction: "up", type: "full-state-request" });
      }
      this._onStateChange?.({ units: this._units, ncus: this._ncus, combatEvents: msg.combat_events ?? [], lootEvents: msg.loot_events ?? [], lootFailures: msg.loot_failures ?? [] });
    }
  }

  // Round-trip time in ms for a seq echoed back by the server (e.g. on our
  // own unit's last_heartbeat_seq), or null if we no longer have that send
  // recorded (evicted, or from before this connection).
  rttForSeq(seq) {
    const sentAt = this._sentAt.get(seq);
    return sentAt == null ? null : Date.now() - sentAt;
  }

  // The {x, y} we sent for a seq echoed back by the server (e.g. on our own
  // unit's last_move_seq), or null if we no longer have that send recorded,
  // or it wasn't a move with a position.
  positionForSeq(seq) {
    return this._sentPositions.get(seq) ?? null;
  }

  // Deletes entries older than SENT_RETENTION_MS from the front of `map`
  // (insertion order = chronological), stopping at the first still-fresh
  // one. `getAt` extracts the sent-at timestamp from an entry.
  _pruneOld(map, now, getAt) {
    for (const [key, entry] of map) {
      if (now - getAt(entry) > SENT_RETENTION_MS) map.delete(key);
      else break;
    }
  }

  // Base delay plus uniform jitter in [-jitter, +jitter], floored at 0. Each
  // call rolls its own jitter, so consecutive messages on the same direction
  // don't get a fixed offset - closer to real network jitter than a
  // constant delay. Ordering across calls is enforced separately, by
  // _scheduleOrdered - this is just "how long would this one message take".
  _simulatedDelayMs() {
    const jitter = this._simulatedJitterMs ? (Math.random() * 2 - 1) * this._simulatedJitterMs : 0;
    return Math.max(0, this._simulatedLatencyMs + jitter);
  }

  // Runs fn after this message's own simulated delay, but never before the
  // previously scheduled message on the same direction (nextAtProp is
  // "_nextSendAt" or "_nextRecvAt"). A WebSocket runs over one TCP
  // connection, which guarantees in-order delivery - variable latency
  // changes the *spacing* between messages on a real network, never their
  // order. Scheduling each message independently (a first attempt at this)
  // let a later message's shorter roll jump ahead of an earlier one still in
  // flight, which doesn't happen on a real connection and produced movement
  // reconciliation artifacts a real laggy connection never would.
  _scheduleOrdered(nextAtProp, fn) {
    const now = Date.now();
    const deliverAt = Math.max(now + this._simulatedDelayMs(), this[nextAtProp] + 1);
    this[nextAtProp] = deliverAt;
    setTimeout(fn, deliverAt - now);
  }

  _send(data) {
    if (this._ws?.readyState !== WebSocket.OPEN) return;

    this._seq += 1;
    const seq = this._seq.toString(16);
    const now = Date.now();
    this._sentAt.set(seq, now);
    this._pruneOld(this._sentAt, now, (at) => at);
    if (data.type === "move" && data.x != null && data.y != null) {
      this._sentPositions.set(seq, { x: data.x, y: data.y, at: now });
      this._pruneOld(this._sentPositions, now, (entry) => entry.at);
    }

    const payload = JSON.stringify({ ...data, seq });
    if (!this._simulatedLatencyMs && !this._simulatedJitterMs) {
      this._ws.send(payload);
      return;
    }
    this._scheduleOrdered("_nextSendAt", () => {
      if (this._ws?.readyState === WebSocket.OPEN) this._ws.send(payload);
    });
  }
}
