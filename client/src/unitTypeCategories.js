// A unit type's category (docs/schema/unit_type.md): its family, like
// "goblins", which the editors group and filter unit types by. details is
// {key: {category}}, as worldUnitTypes gives it.

export function categoryOf(details, key) {
  return details[key]?.category || null;
}

// The categories keys have, sorted.
export function categoriesOf(keys, details) {
  return [...new Set(keys.map((key) => categoryOf(details, key)).filter(Boolean))].sort();
}

// [{category, keys}], by category with the uncategorized (category null)
// last, each group keeping keys' order.
export function groupByCategory(keys, details) {
  const groups = [...categoriesOf(keys, details), null].map((category) => ({
    category, keys: keys.filter((key) => categoryOf(details, key) === category),
  }));
  return groups.filter((group) => group.keys.length > 0);
}
