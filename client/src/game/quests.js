// Quests on the client (see docs/quests.md). The game server tells each
// player which quests each NCU offers them (quest-offers, NCU identifier ->
// quest identifiers). The client keeps its own quest log: read from Rails
// on load (each active quest's structure and objectives, with their text
// and progress), then kept up to date from the game server's events.
// Quest-level prose (names, dialogue) comes from the world's quests file.

export function questsById(quests) {
  return Object.fromEntries((quests ?? []).map((quest) => [quest.identifier, quest]));
}

// The NCU identifiers to mark: those offering at least one quest with
// marker: true. Other offers are only hinted at by the dialogue.
export function questNcus(offers, definitions) {
  return new Set(
    Object.entries(offers ?? {})
      .filter(([, ids]) => ids.some((id) => definitions?.[id]?.marker === true))
      .map(([ncu]) => ncu)
  );
}

// The quests ncuIdentifier offers, as {identifier, offerText, description,
// marker}, in the server's order. Quests missing from the definitions are
// left out.
export function offersFor(offers, ncuIdentifier, definitions) {
  return (offers?.[ncuIdentifier] ?? [])
    .map((id) => definitions?.[id])
    .filter(Boolean)
    .map(({identifier, offerText, description, marker}) => ({identifier, offerText, description, marker: marker === true}));
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
      return {type: "upsert", quest: msg.quest, log: `Quest started: ${name(msg.quest?.quest_identifier)}`};
    case "quest-updated":
      return {type: "upsert", quest: msg.quest};
    case "quest-abandoned":
      return {type: "remove", quest: msg.quest, log: `Quest abandoned: ${name(msg.quest)}`};
    case "quest-accept-failed":
      return {type: "log", log: `Couldn't start ${name(msg.quest)}: ${msg.error}`};
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

// Display names from a zone's file, by identifier: its NCUs and maps.
export function zoneNames(zone) {
  const names = {ncus: {}, maps: {}};
  for (const map of zone?.maps ?? []) {
    if (map.name) names.maps[map.identifier] = map.name;
    for (const ncu of map.ncus ?? []) names.ncus[ncu.identifier] = ncu.name;
  }
  return names;
}

// The quest log by zone (see docs/quests.md#quest-log): each zone with
// something to do, as {identifier, name, count, quests}, the current zone
// (here.zoneIdentifier) first and the rest by name. A zone lists each
// quest with unfinished objectives there, and each finished quest turned
// in there (turnIn set to its NCU's identifier); count is how many
// objectives and turn-ins it has. Zone names come from here.zoneNames
// (from Rails), falling back to identifiers.
export function questLogZones(activeQuests, definitions, here) {
  const zones = new Map();
  const zoneFor = (identifier) => {
    if (!zones.has(identifier)) {
      zones.set(identifier, {identifier, name: here?.zoneNames?.[identifier] ?? identifier, count: 0, quests: new Map()});
    }
    return zones.get(identifier);
  };
  const entryFor = (zone, active) => {
    if (!zone.quests.has(active.quest_identifier)) {
      const prose = definitions?.[active.quest_identifier];
      zone.quests.set(active.quest_identifier, {
        identifier: active.quest_identifier,
        name: prose?.name ?? active.quest_identifier,
        description: prose?.description ?? "",
        timerSeconds: timerSeconds(active.definition?.timer),
        timerStartedAt: active.timer_started_at ?? null,
        objectives: [],
        turnIn: null,
      });
    }
    return zone.quests.get(active.quest_identifier);
  };

  for (const active of Object.values(activeQuests ?? {})) {
    const unfinished = (active.objectives ?? []).filter(({count, required}) => count < required);
    for (const {hash, objective, count, required} of unfinished) {
      const zone = zoneFor(objective.zone);
      entryFor(zone, active).objectives.push({hash, text: objective.text ?? "", count, required, map: objective.map ?? null});
      zone.count += 1;
    }
    const turnIn = active.definition?.turnIn;
    if (unfinished.length === 0 && turnIn) {
      const zone = zoneFor(turnIn.zone);
      entryFor(zone, active).turnIn = turnIn.ncu;
      zone.count += 1;
    }
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  return [...zones.values()]
    .map((zone) => ({...zone, quests: [...zone.quests.values()].sort(byName)}))
    .sort((a, b) => (b.identifier === here?.zoneIdentifier) - (a.identifier === here?.zoneIdentifier) || byName(a, b));
}
