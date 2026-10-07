// Quest offers (see docs/quests.md): the game server tells each player
// which quests each NCU offers them (quest_offers, NCU identifier -> quest
// identifiers); quest definitions come from the world's quests file.

export function questsById(quests) {
  return Object.fromEntries((quests ?? []).map((quest) => [quest.identifier, quest]));
}

// The NCU identifiers with at least one quest on offer.
export function questNcus(offers) {
  return new Set(Object.entries(offers ?? {}).filter(([, ids]) => ids.length > 0).map(([ncu]) => ncu));
}

// The quests ncuIdentifier offers, as {identifier, name, offerText}, in
// the server's order. Quests missing from the definitions are left out.
export function offersFor(offers, ncuIdentifier, definitions) {
  return (offers?.[ncuIdentifier] ?? [])
    .map((id) => definitions?.[id])
    .filter(Boolean)
    .map(({identifier, name, offerText}) => ({identifier, name, offerText}));
}

// What a quest server message means for the client: new offers, or a line
// for the log. Null for anything else.
export function questMessageAction(msg, definitions) {
  const name = (id) => definitions?.[id]?.name ?? id;
  switch (msg.type) {
    case "quest_offers":
      return {type: "offers", offers: msg.offers ?? {}};
    case "quest_accepted":
      return {type: "log", log: `Quest accepted: ${name(msg.quest?.quest_identifier)}`};
    case "quest_accept_failed":
      return {type: "log", log: `Couldn't accept ${name(msg.quest)}: ${msg.error}`};
    case "quest_log":
      return {type: "quest_log", quests: msg.quests ?? []};
    case "quest_abandon_failed":
      return {type: "log", log: `Couldn't abandon ${name(msg.quest)}: ${msg.error}`};
    default:
      return null;
  }
}

// Display names from a zone's file, by identifier: its unit types, units
// (named by their unit type), NCUs and maps.
export function zoneNames(zone) {
  const names = {unitTypes: {}, units: {}, ncus: {}, maps: {}};
  for (const [id, unitType] of Object.entries(zone?.unitTypes ?? {})) names.unitTypes[id] = unitType.name;
  for (const map of zone?.maps ?? []) {
    if (map.name) names.maps[map.identifier] = map.name;
    for (const unit of map.units ?? []) {
      const name = zone.unitTypes?.[unit.unitType]?.name;
      if (name) names.units[unit.identifier] = name;
    }
    for (const ncu of map.ncus ?? []) names.ncus[ncu.identifier] = ncu.name;
  }
  return names;
}

// A name for something in a zone: from names when it's the current zone,
// otherwise its identifier.
function nameIn(zone, kind, id, here) {
  return (zone === here.zoneIdentifier && here.names?.[kind]?.[id]) || id;
}

// One line describing an objective, like "Kill Rat in Depths".
export function describeObjective(objective, here) {
  const name = (kind, id) => nameIn(objective.zone, kind, id, here);
  switch (objective.type) {
    case "talk":
      return `Talk to ${name("ncus", objective.ncu)}`;
    case "reach":
      return `Reach ${name("maps", objective.map)}`;
    case "kill": {
      const target = objective.unitType ? name("unitTypes", objective.unitType) : name("units", objective.unit);
      return objective.map ? `Kill ${target} in ${name("maps", objective.map)}` : `Kill ${target}`;
    }
    default:
      return objective.type;
  }
}

// A quest's log text: its description, or what its NCU said offering it.
export function questDescription(quest, here) {
  if (quest.description) return quest.description;
  return `${nameIn(quest.offeredBy?.zone, "ncus", quest.offeredBy?.ncu, here)} said: ${quest.offerText}`;
}

// The quest log (the server's quest_log entries) grouped into chains,
// sorted by chain name, each quest with its text and objective progress.
// here is {zoneIdentifier, names} for naming things in the current zone.
// Quests missing from the definitions are left out.
export function questLogChains(entries, definitions, here) {
  const chains = new Map();
  for (const entry of entries ?? []) {
    const quest = definitions?.[entry.quest_identifier];
    if (!quest) continue;
    const chain = chains.get(quest.chainIdentifier) ?? {identifier: quest.chainIdentifier, name: quest.chainName, quests: []};
    chain.quests.push({
      identifier: quest.identifier,
      name: quest.name,
      description: questDescription(quest, here),
      timer: quest.timer ?? null,
      objectives: (quest.objectives ?? []).map((objective, i) => ({
        text: describeObjective(objective, here),
        count: entry.objectives?.[i] ?? 0,
        required: objective.count ?? 1,
      })),
    });
    chains.set(quest.chainIdentifier, chain);
  }
  return [...chains.values()].sort((a, b) => a.name.localeCompare(b.name));
}
