// Every unit belongs to a group (docs/schema/unit.md's groupIdentifier -
// units sharing one aggro together); a unit on its own is a group of one.
// New groups are named "group-" plus six random lowercase letters, renamable
// afterwards.
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export function newGroupIdentifier(units, random = Math.random) {
  const taken = new Set(units.map((unit) => unit.groupIdentifier));
  for (;;) {
    let suffix = "";
    for (let i = 0; i < 6; i++) suffix += LETTERS[Math.floor(random() * LETTERS.length)];
    const identifier = `group-${suffix}`;
    if (!taken.has(identifier)) return identifier;
  }
}

// The map's groups in units-array order, each {identifier, memberIndices}.
// A unit with no groupIdentifier (authored before every unit had one) is a
// group of one with identifier null.
export function unitGroups(units) {
  const groups = [];
  const byIdentifier = new Map();
  units.forEach((unit, i) => {
    const identifier = unit.groupIdentifier || null;
    if (!identifier) {
      groups.push({identifier: null, memberIndices: [i]});
      return;
    }
    if (!byIdentifier.has(identifier)) {
      const group = {identifier, memberIndices: []};
      byIdentifier.set(identifier, group);
      groups.push(group);
    }
    byIdentifier.get(identifier).memberIndices.push(i);
  });
  return groups;
}
