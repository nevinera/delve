// World item operations over the whole live draft (see
// plans/world-editor/README.md, "Two layers"). A world's items live at
// worlds/<w>/items/<key>.json, the key also being the item's identifier -
// what map units' loot tables and zones' items dicts refer to it by.
import {blankItem} from "../../itemEditor/blankItem";
import {worldQuests, zoneData} from "./zoneOps";
import {worldMaps} from "./mapOps";
import {zoneKeys} from "./worldOps";
import {isValidIdentifier, itemFile, mapFile, relativePath, worldDir, zoneFile} from "./worldPaths";
import {updateQuest} from "./questOps";

const itemsDir = (draft) => `${worldDir(draft.worldKey)}/items`;

export function itemKeys(draft) {
  const dir = `${itemsDir(draft)}/`;
  return draft.paths(itemsDir(draft)).filter((p) => p.endsWith(".json") && !p.slice(dir.length).includes("/"))
    .map((p) => p.slice(dir.length, -".json".length)).sort();
}

export const itemData = (draft, key) => draft.read(itemFile(draft.worldKey, key));

// The identifier always follows the key (see renameItem).
export function updateItem(draft, key, data) {
  return draft.write(itemFile(draft.worldKey, key), {...data, identifier: key});
}

function checkNewKey(draft, key) {
  if (!isValidIdentifier(key)) throw new Error(`"${key}" isn't a valid identifier (letters, digits, "_" and "-" only)`);
  if (draft.exists(itemFile(draft.worldKey, key))) throw new Error(`Item "${key}" already exists`);
}

export function createItem(draft, key, name) {
  checkNewKey(draft, key);
  const blank = blankItem(key);
  return draft.write(itemFile(draft.worldKey, key), name ? {...blank, name} : blank);
}

const drops = (unit, key) => Object.hasOwn(unit.lootTable ?? {}, key);

// Which units drop it: [{zone, map, count}].
export function itemUses(draft, key) {
  return worldMaps(draft).flatMap(([zone, map, data]) => {
    const count = (data.units ?? []).filter((unit) => drops(unit, key)).length;
    return count ? [{zone, map, count}] : [];
  });
}

// Adds the item to the zone's items (a no-op if it's there), so quest
// rewards can name it without any unit dropping it.
export function addItemToZone(draft, zone, key) {
  const data = zoneData(draft, zone);
  if (!data || Object.hasOwn(data.items ?? {}, key)) return draft;
  const ref = {$ref: relativePath(zoneFile(draft.worldKey, zone), itemFile(draft.worldKey, key)), referenceTo: "item"};
  return draft.write(zoneFile(draft.worldKey, zone), {...data, items: {...(data.items ?? {}), [key]: ref}});
}

// The quests that reward it, by identifier.
export function itemRewards(draft, key) {
  return worldQuests(draft).filter((quest) => (quest.rewards ?? []).some((reward) => reward.item === key)).map((quest) => quest.identifier);
}

// Moves the file (setting its identifier) and rewrites every reference:
// each map unit's loot table entry, each zone's items entry, and each
// quest reward.
export function renameItem(draft, from, to) {
  if (from === to) return draft;
  checkNewKey(draft, to);
  const world = draft.worldKey;
  let next = updateItem(draft.remove(itemFile(world, from)), to, itemData(draft, from));
  const renameKey = (dict) => Object.fromEntries(Object.entries(dict).map(([key, value]) => [key === from ? to : key, value]));
  for (const [zone, map, data] of worldMaps(next)) {
    if (!(data.units ?? []).some((unit) => drops(unit, from))) continue;
    next = next.write(mapFile(world, zone, map), {...data, units: data.units.map((unit) => (drops(unit, from) ? {...unit, lootTable: renameKey(unit.lootTable)} : unit))});
  }
  for (const zone of zoneKeys(next)) {
    const data = zoneData(next, zone);
    if (!Object.hasOwn(data?.items ?? {}, from)) continue;
    const items = Object.fromEntries(Object.entries(data.items).map(([key, ref]) => (key === from
      ? [to, {...ref, $ref: relativePath(zoneFile(world, zone), itemFile(world, to))}]
      : [key, ref])));
    next = next.write(zoneFile(world, zone), {...data, items});
  }
  for (const identifier of itemRewards(next, from)) {
    const quest = worldQuests(next).find((q) => q.identifier === identifier);
    next = updateQuest(next, identifier, {...quest, rewards: quest.rewards.map((reward) => (reward.item === from ? {...reward, item: to} : reward))});
  }
  return next;
}

// Refused while any unit drops it or quest rewards it (the error lists
// where); otherwise
// removes the file and every zone's items entry for it.
export function deleteItem(draft, key) {
  const uses = itemUses(draft, key);
  if (uses.length) {
    throw new Error(`"${key}" is still dropped on ${uses.map(({zone, map, count}) => `${zone}/${map} (${count})`).join(", ")}`);
  }
  const rewards = itemRewards(draft, key);
  if (rewards.length) throw new Error(`"${key}" is still a reward of ${rewards.join(", ")}`);
  let next = draft.remove(itemFile(draft.worldKey, key));
  for (const zone of zoneKeys(next)) {
    const data = zoneData(next, zone);
    if (!Object.hasOwn(data?.items ?? {}, key)) continue;
    const {[key]: _dropped, ...items} = data.items;
    next = next.write(zoneFile(draft.worldKey, zone), {...data, items});
  }
  return next;
}
