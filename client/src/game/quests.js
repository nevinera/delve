// Quests on the client (see docs/quests.md). The game server tells each
// player which quests each NCU offers them (quest-offers, NCU identifier ->
// quest identifiers). The client keeps its own quest log: read from Rails
// on load (each active quest's structure and objective progress), then
// kept up to date from the game server's events. Prose (names, texts)
// comes from the world's quests file.

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

// What a quest server message means for the client: new offers, an
// active quest to add or replace, one to remove, or a line for the log.
// Null for anything else.
export function questMessageAction(msg, definitions) {
  const name = (id) => definitions?.[id]?.name ?? id;
  switch (msg.type) {
    case "quest-offers":
      return {type: "offers", offers: msg.offers ?? {}};
    case "quest-received":
      return {type: "upsert", quest: msg.quest, log: `Quest accepted: ${name(msg.quest?.quest_identifier)}`};
    case "quest-updated":
      return {type: "upsert", quest: msg.quest};
    case "quest-abandoned":
      return {type: "remove", quest: msg.quest, log: `Quest abandoned: ${name(msg.quest)}`};
    case "quest-accept-failed":
      return {type: "log", log: `Couldn't accept ${name(msg.quest)}: ${msg.error}`};
    case "quest-abandon-failed":
      return {type: "log", log: `Couldn't abandon ${name(msg.quest)}: ${msg.error}`};
    case "quest-progress":
      return {type: "progress", quest: msg.quest, objective: msg.objective, count: msg.count};
    case "quest-completed":
      return {type: "remove", quest: msg.quest, log: completedLog(name(msg.quest), msg.items)};
    case "quest-failed":
      return {type: "remove", quest: msg.quest, log: `Quest failed: ${name(msg.quest)} (out of time)`};
    case "quest-turn-in-failed":
      return {type: "log", log: `Couldn't turn in ${name(msg.quest)}: ${msg.error}`};
    default:
      return null;
  }
}

function completedLog(name, items) {
  const rewards = items?.length ? ` Received: ${items.join(", ")}.` : "";
  return `Quest complete: ${name}.${rewards}`;
}

// The quest log after an upsert, progress or remove action: active quests
// by identifier. now (ms) stamps when an upserted quest's timer started.
export function applyQuestAction(activeQuests, action, now = Date.now()) {
  if (action?.type === "upsert") return {...activeQuests, [action.quest.quest_identifier]: withTimerStart(action.quest, now)};
  if (action?.type === "progress") {
    const quest = activeQuests[action.quest];
    if (!quest) return activeQuests;
    const objectives = (quest.objectives ?? []).map((objective) =>
      objective.hash === action.objective ? {...objective, count: action.count} : objective
    );
    return {...activeQuests, [action.quest]: {...quest, objectives}};
  }
  if (action?.type === "remove") {
    const {[action.quest]: _removed, ...rest} = activeQuests;
    return rest;
  }
  return activeQuests;
}

// Active quests (as Rails lists them) by identifier, with when (ms) each
// one's timer started counting from now.
export function activeQuestsById(quests, now = Date.now()) {
  return Object.fromEntries((quests ?? []).map((quest) => [quest.quest_identifier, withTimerStart(quest, now)]));
}

// The timer runs on the game server while the player's connected; the
// client counts down from what it was last told.
function withTimerStart(quest, now) {
  return {...quest, timer_started_at: now - (quest.timer_elapsed_seconds ?? 0) * 1000};
}

// A quest timer ("90s", "5m") in seconds, or null for none.
export function timerSeconds(timer) {
  const match = /^([1-9]\d*)([sm])$/.exec(timer ?? "");
  if (!match) return null;
  return Number(match[1]) * (match[2] === "m" ? 60 : 1);
}

// Seconds left on a timed quest at now (ms), never below 0.
export function timerRemaining(seconds, startedAt, now) {
  return Math.max(0, seconds - Math.floor((now - startedAt) / 1000));
}

// The active quests ncuIdentifier (in zoneIdentifier) takes turned in, as
// {identifier, name, ready, text}: ready once every objective is met, with
// the quest's completionText, otherwise its progressText.
export function turnInsFor(activeQuests, ncuIdentifier, zoneIdentifier, definitions) {
  return Object.values(activeQuests ?? {})
    .filter(({definition}) => definition?.turnIn?.zone === zoneIdentifier && definition.turnIn.ncu === ncuIdentifier)
    .sort((a, b) => a.quest_identifier.localeCompare(b.quest_identifier))
    .map((active) => {
      const prose = definitions?.[active.quest_identifier];
      const ready = (active.objectives ?? []).every(({count, required}) => count >= required);
      return {
        identifier: active.quest_identifier,
        name: prose?.name ?? active.quest_identifier,
        ready,
        text: (ready ? prose?.completionText : prose?.progressText) ?? "",
      };
    });
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
export function questDescription(prose, offeredBy, here) {
  if (prose?.description) return prose.description;
  if (!prose?.offerText) return "";
  return `${nameIn(offeredBy?.zone, "ncus", offeredBy?.ncu, here)} said: ${prose.offerText}`;
}

// The quest log grouped into chains, sorted by chain name. Each active
// quest (as Rails stores it: structure and per-objective progress) gets its
// prose from the quests file's definitions, falling back to identifiers
// when the file doesn't have it. here is {zoneIdentifier, names} for
// naming things in the current zone.
export function questLogChains(activeQuests, definitions, here) {
  const chains = new Map();
  for (const active of Object.values(activeQuests ?? {}).sort((a, b) => a.quest_identifier.localeCompare(b.quest_identifier))) {
    const {definition = {}} = active;
    const prose = definitions?.[active.quest_identifier];
    const chainId = definition.chainIdentifier ?? "";
    const chain = chains.get(chainId) ?? {identifier: chainId, name: prose?.chainName ?? chainId, quests: []};
    chain.quests.push({
      identifier: active.quest_identifier,
      name: prose?.name ?? active.quest_identifier,
      description: questDescription(prose, definition.offeredBy, here),
      timerSeconds: timerSeconds(definition.timer),
      timerStartedAt: active.timer_started_at ?? null,
      objectives: (active.objectives ?? []).map(({objective, count, required}) => ({
        text: describeObjective(objective, here),
        count,
        required,
      })),
    });
    chains.set(chainId, chain);
  }
  return [...chains.values()].sort((a, b) => a.name.localeCompare(b.name));
}
