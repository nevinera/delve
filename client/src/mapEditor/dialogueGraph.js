// An NCU's dialogue (docs/schema/ncu.md#dialogue) plus the quests it offers,
// as a directed graph for DialogueGraphCanvas. Kinds: "start" (the
// conversation opening), "npc" (a line the NCU says, yellow), "choice"
// (something the player says, green), "quest" (a quest on offer, orange).

export const START_ID = "start";
export const questNodeId = (identifier) => `quest:${identifier}`;
export const choiceNodeId = (nodeId, index) => `${nodeId}#${index}`;

export function dialogueGraph(dialogue, offers = []) {
  const nodes = [{id: START_ID, kind: "start", text: "Start"}];
  const edges = [];
  const known = new Set(Object.keys(dialogue?.nodes ?? {}));
  const link = (from, to) => {
    if (to && known.has(to)) edges.push({from, to});
  };

  for (const [id, node] of Object.entries(dialogue?.nodes ?? {})) {
    nodes.push({id, kind: "npc", text: node.text ?? ""});
    if (node.choices) {
      node.choices.forEach((choice, i) => {
        const choiceId = choiceNodeId(id, i);
        nodes.push({id: choiceId, kind: "choice", text: choice.text ?? ""});
        edges.push({from: id, to: choiceId});
        link(choiceId, choice.next);
      });
    } else {
      link(id, node.next);
    }
  }
  for (const entry of dialogue?.entry ?? []) link(START_ID, entry.node);
  for (const quest of offers) {
    nodes.push({id: questNodeId(quest.identifier), kind: "quest", text: quest.name || quest.identifier, identifier: quest.identifier});
    edges.push({from: START_ID, to: questNodeId(quest.identifier)});
  }
  return {nodes, edges};
}

export const edgeKey = (edge) => `${edge.from}->${edge.to}`;

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 90;

// Positions for every node: saved ones kept, the rest placed in columns by
// distance from the start, stacked within each column.
export function dialogueLayout(graph, saved = {}) {
  const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) outgoing.get(edge.from)?.push(edge.to);
  const depths = new Map([[START_ID, 0]]);
  const queue = [START_ID];
  while (queue.length) {
    const id = queue.shift();
    for (const to of outgoing.get(id) ?? []) {
      if (!depths.has(to)) {
        depths.set(to, depths.get(id) + 1);
        queue.push(to);
      }
    }
  }
  const rows = new Map();
  const positions = {};
  for (const node of graph.nodes) {
    if (saved[node.id]) {
      positions[node.id] = saved[node.id];
      continue;
    }
    const depth = depths.get(node.id) ?? 0;
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    positions[node.id] = {x: depth * COLUMN_WIDTH, y: row * ROW_HEIGHT};
  }
  return positions;
}
