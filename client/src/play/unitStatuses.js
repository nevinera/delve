// What each unit holds, as the game server says, for the unit frames. Times are in milliseconds, on
// the clock given.

const keyOf = ({ status, from }) => `${status}/${from}`;

export class UnitStatuses {
  constructor(clock = () => performance.now()) {
    this.clock = clock;
    this.units = new Map(); // unit id -> key -> { status, from, class, stacks, until }
  }

  // A character coming into view, with what it holds then.
  seen({ id, statuses }) {
    this.units.delete(id);
    (statuses ?? []).forEach((held) => this.on({ id, ...held }));
  }

  on({ id, status, from, class: classId, stacks, lasts }) {
    if (!this.units.has(id)) this.units.set(id, new Map());
    this.units.get(id).set(keyOf({ status, from }), { status, from, class: classId, stacks, until: lasts ? this.clock() + lasts * 1000 : null });
  }

  changed({ id, status, from, stacks, lasts }) {
    const held = this.units.get(id)?.get(keyOf({ status, from }));
    if (!held) return;
    held.stacks = stacks;
    held.until = lasts ? this.clock() + lasts * 1000 : null;
  }

  gone({ id, status, from }) {
    this.units.get(id)?.delete(keyOf({ status, from }));
  }

  vanish(id) {
    this.units.delete(id);
  }

  // What a unit holds, oldest to end last, those that never end first. Those whose time has run out
  // are about to be taken off.
  of(id) {
    const now = this.clock();
    return [...(this.units.get(id)?.values() ?? [])]
      .filter((held) => held.until === null || held.until > now)
      .sort((a, b) => (a.until ?? 0) - (b.until ?? 0) || a.status.localeCompare(b.status));
  }
}

// How a status's time left reads on its icon.
export function timeLeft(until, now) {
  if (until === null) return "";
  const seconds = Math.max(0, (until - now) / 1000);
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}m`;
  return seconds >= 10 ? `${Math.ceil(seconds)}` : seconds.toFixed(1);
}

// The stand-in for an icon: a status's initials.
export function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
