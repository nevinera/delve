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
    default:
      return null;
  }
}
