// Powers (and passives) are referred to by name - by tactics, DPS
// strategies and stacking checks - so a copied-in one that collides gets a
// numeric suffix instead.
export function uniqueName(name, takenNames) {
  const taken = new Set(takenNames);
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}
