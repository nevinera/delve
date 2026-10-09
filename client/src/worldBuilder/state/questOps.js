// World quest operations over the whole live draft (see
// plans/world-editor/07-quests.md). A world's quests are one file, at its
// questsPath (default ./quests.json, beside the world file); the quests
// graph's positions live beside it, in <name>.layout.json.
import {stableStringify} from "./WorldDraft";
import {worldData, zoneKeys} from "./worldOps";
import {worldMaps} from "./mapOps";
import {unitTypeData} from "./unitTypeOps";
import {DEFAULT_QUESTS_PATH, worldQuests, zoneData} from "./zoneOps";
import {isValidIdentifier, resolvePath, worldFile} from "./worldPaths";

const COMPLETED = "quest/completed/";

export const completionFlag = (identifier) => `${COMPLETED}${identifier}`;

// The quests file's repo path.
export function questsFile(draft) {
  return resolvePath(worldFile(draft.worldKey), worldData(draft)?.questsPath || DEFAULT_QUESTS_PATH);
}

export const questsLayoutFile = (draft) => questsFile(draft).replace(/\.json$/, ".layout.json");

export {worldQuests};

export const questData = (draft, identifier) => worldQuests(draft).find((quest) => quest.identifier === identifier) ?? null;

// Sorted by chain, then identifier (the schema's merge-friendly order).
function writeQuests(draft, quests) {
  const sorted = [...quests].sort((a, b) =>
    (a.chainIdentifier ?? "").localeCompare(b.chainIdentifier ?? "") || a.identifier.localeCompare(b.identifier));
  return draft.write(questsFile(draft), sorted);
}

// Replaces a quest (its identifier stays; see renameQuest). Its chainName
// is the chain's, so every quest in the chain takes it.
export function updateQuest(draft, identifier, data) {
  const quest = {...data, identifier};
  return writeQuests(draft, worldQuests(draft).map((other) => {
    if (other.identifier === identifier) return quest;
    if (quest.chainIdentifier && other.chainIdentifier === quest.chainIdentifier) return {...other, chainName: quest.chainName};
    return other;
  }));
}

function checkNewIdentifier(draft, identifier) {
  if (!isValidIdentifier(identifier) || identifier.length > 54) {
    throw new Error(`"${identifier}" isn't a valid quest identifier (1-54 letters, digits, "_" and "-")`);
  }
  if (questData(draft, identifier)) throw new Error(`Quest "${identifier}" already exists`);
}

// A new quest, offered by offeredBy ({zone, ncu}) when given; its own
// chain until it's put in another.
export function createQuest(draft, identifier, offeredBy = {zone: "", ncu: ""}) {
  checkNewIdentifier(draft, identifier);
  const quest = {
    identifier, name: identifier, chainIdentifier: identifier, chainName: identifier,
    offeredBy, offerText: "", description: "", objectives: [],
  };
  return writeQuests(draft, [...worldQuests(draft), quest]);
}

// The quests whose requiresFlags include identifier's completion flag.
export function followUps(draft, identifier) {
  const flag = completionFlag(identifier);
  return worldQuests(draft).filter((quest) => (quest.requiresFlags ?? []).includes(flag)).map((quest) => quest.identifier);
}

// The quests whose completion a quest requires.
export function prerequisites(quest) {
  return (quest?.requiresFlags ?? []).filter((flag) => flag.startsWith(COMPLETED)).map((flag) => flag.slice(COMPLETED.length));
}

// Renames the quest and rewrites what refers to it: other quests'
// requirements of its completion flag, and its graph position.
export function renameQuest(draft, from, to) {
  if (from === to) return draft;
  checkNewIdentifier(draft, to);
  const [fromFlag, toFlag] = [completionFlag(from), completionFlag(to)];
  const quests = worldQuests(draft).map((quest) => {
    const renamed = quest.identifier === from ? {...quest, identifier: to} : quest;
    if (!(renamed.requiresFlags ?? []).includes(fromFlag)) return renamed;
    return {...renamed, requiresFlags: renamed.requiresFlags.map((flag) => (flag === fromFlag ? toFlag : flag))};
  });
  const next = writeQuests(draft, quests);
  const {[from]: position, ...positions} = questPositions(next);
  return position ? setQuestPositions(next, {...positions, [to]: position}) : next;
}

// Refused while other quests require it (the error lists them).
export function deleteQuest(draft, identifier) {
  const requiring = followUps(draft, identifier);
  if (requiring.length) throw new Error(`"${identifier}" is required by ${requiring.join(", ")}`);
  const next = writeQuests(draft, worldQuests(draft).filter((quest) => quest.identifier !== identifier));
  const {[identifier]: _dropped, ...positions} = questPositions(next);
  return setQuestPositions(next, positions);
}

export function questPositions(draft) {
  return draft.read(questsLayoutFile(draft))?.positions ?? {};
}

// A no-op when nothing moved, so a graph reporting its positions on mount
// never dirties the draft.
export function setQuestPositions(draft, positions) {
  if (stableStringify(positions) === stableStringify(questPositions(draft))) return draft;
  return draft.write(questsLayoutFile(draft), {positions});
}

// The quests an NCU offers and takes turned in: {offers, turnIns}, as
// quest identifiers.
export function ncuQuests(draft, zone, ncu) {
  const at = (ref) => ref?.zone === zone && ref?.ncu === ncu;
  const quests = worldQuests(draft);
  return {
    offers: quests.filter((quest) => at(quest.offeredBy)).map((quest) => quest.identifier),
    turnIns: quests.filter((quest) => at(quest.turnIn)).map((quest) => quest.identifier),
  };
}

// A free identifier for a new quest offered by ncu: "<ncu>-quest", then
// "<ncu>-quest-2" and so on.
export function newQuestIdentifier(draft, ncu) {
  const base = `${ncu}-quest`.slice(0, 50);
  let identifier = base;
  for (let n = 2; questData(draft, identifier); n++) identifier = `${base}-${n}`;
  return identifier;
}

// A colour for a chain, the same every time for the same identifier.
export function chainColor(chainIdentifier) {
  let hash = 0;
  for (const char of chainIdentifier ?? "") hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return `hsl(${hash % 360}, 65%, 55%)`;
}

// The quests graph: a node per quest, a node per other flag quests grant
// or require, and edges for prerequisites (quest -> quest that requires
// its completion), grants (quest -> flag) and requirements (flag ->
// quest). Node ids: "quest:<identifier>", "flag:<flag>".
export function questGraph(quests) {
  const known = new Set(quests.map((quest) => quest.identifier));
  const nodes = quests.map((quest) => ({
    id: `quest:${quest.identifier}`, kind: "quest", identifier: quest.identifier, name: quest.name || quest.identifier,
    chainIdentifier: quest.chainIdentifier, chainName: quest.chainName, marker: quest.marker === true,
  }));
  const flags = new Set();
  const edges = [];
  for (const quest of quests) {
    const to = `quest:${quest.identifier}`;
    for (const flag of quest.requiresFlags ?? []) {
      const prerequisite = flag.startsWith(COMPLETED) && flag.slice(COMPLETED.length);
      if (prerequisite && known.has(prerequisite)) {
        edges.push({from: `quest:${prerequisite}`, to, kind: "prerequisite"});
      } else {
        flags.add(flag);
        edges.push({from: `flag:${flag}`, to, kind: "requires"});
      }
    }
    for (const flag of quest.grantsFlags ?? []) {
      flags.add(flag);
      edges.push({from: to, to: `flag:${flag}`, kind: "grants"});
    }
  }
  for (const flag of [...flags].sort()) nodes.push({id: `flag:${flag}`, kind: "flag", flag, name: flag});
  return {nodes, edges};
}

// What the quest editor's pickers offer, from the draft: each zone (key,
// name) with its maps (key, name, NCUs, units) and unit types. (Rewards
// can be any of the world's items; see itemOps.addItemToZone.)
export function questChoices(draft) {
  const maps = worldMaps(draft);
  return zoneKeys(draft).map((zone) => {
    const data = zoneData(draft, zone) ?? {};
    return {
      key: zone,
      name: data.name || zone,
      maps: maps.filter(([z]) => z === zone).map(([, map, mapFileData]) => ({
        key: map,
        name: mapFileData.name || map,
        ncus: (mapFileData.ncus ?? []).map((ncu) => ({identifier: ncu.identifier, name: ncu.name || ncu.identifier})),
        units: (mapFileData.units ?? []).map((unit) => ({identifier: unit.identifier, unitType: unit.unitType})),
      })),
      unitTypes: Object.keys(data.unitTypes ?? {}).sort().map((key) => ({key, name: unitTypeData(draft, key)?.name || key})),
    };
  });
}

// The world's chains: [{identifier, name}], by name.
export function questChains(draft) {
  const chains = new Map();
  for (const quest of worldQuests(draft)) {
    if (quest.chainIdentifier && !chains.has(quest.chainIdentifier)) chains.set(quest.chainIdentifier, quest.chainName || quest.chainIdentifier);
  }
  return [...chains].map(([identifier, name]) => ({identifier, name})).sort((a, b) => a.name.localeCompare(b.name));
}

// Where a graph node's position is saved: a quest's under its identifier
// (so renames carry it), a flag's under its node id.
export const positionKey = (node) => (node.kind === "quest" ? node.identifier : node.id);

const COLUMN_WIDTH = 240;
const ROW_HEIGHT = 110;

// Every node's position: saved ones as they are, the rest laid out in
// columns by how many links lead to them (so prerequisites sit left of
// what they unlock), stacked within each column. Keyed by node id.
export function questLayout(graph, saved = {}) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) incoming.get(edge.to)?.push(edge.from);
  const depths = new Map();
  const depthOf = (id, visiting = new Set()) => {
    if (depths.has(id)) return depths.get(id);
    if (visiting.has(id)) return 0; // a cycle; Validate doesn't forbid them
    visiting.add(id);
    const depth = Math.max(-1, ...(incoming.get(id) ?? []).map((from) => depthOf(from, visiting))) + 1;
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  };
  const rows = new Map();
  const positions = {};
  for (const node of graph.nodes) {
    const position = saved[positionKey(node)];
    if (position) {
      positions[node.id] = position;
      continue;
    }
    const depth = depthOf(node.id);
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    positions[node.id] = {x: depth * COLUMN_WIDTH, y: row * ROW_HEIGHT};
  }
  return positions;
}
