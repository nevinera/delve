import {RepoSnapshot} from "../RepoSnapshot";
import {WorldDraft} from "../WorldDraft";

// A two-zone world shaped like the content repo's worlds/small/.
export function fixtureJson() {
  return {
    "worlds/w/w.json": {
      name: "W",
      description: null,
      thumbnailUrl: null,
      elevationRange: [0, 20],
      zones: {
        forest: {path: "./zones/forest/forest.json", name: "Forest", description: null},
        cave: {path: "./zones/cave/cave.json", name: "Cave", description: null},
      },
      worldLinks: [{zoneA: {zone: "forest", kind: "open", connection: "north-exit"}, zoneB: {zone: "cave", kind: "open", connection: "entrance"}, oneWay: false, requiredKey: null}],
      entryPoints: {"forest/hub/central": null},
    },
    "worlds/w/w.layout.json": {positions: {forest: {x: 1, y: 2}, "entryPoint:forest/hub/central": {x: 3, y: 4}, cave: {x: 5, y: 6}}},
    "worlds/w/zones/forest/forest.json": {
      name: "Forest", description: null, elvl: 0, private: false,
      maps: [{$ref: "./hub/hub.json", referenceTo: "map"}],
      unitTypes: {goblin: {$ref: "../../unit_types/goblin.json", referenceTo: "unit_type"}},
      items: {},
      zoneLinks: [],
      entryPoints: {"hub/central": null},
      openConnections: {"hub/north": "north-exit"},
    },
    "worlds/w/zones/forest/forest.layout.json": {positions: {}},
    "worlds/w/zones/forest/hub/hub.json": {
      identifier: "hub", name: "Hub", imageUrl: "hub.png", thumbnailUrl: "hub.thumb.webp",
      connections: [{identifier: "central"}, {identifier: "north"}],
      units: [{unitType: "goblin"}, {unitType: "archer", lootTable: {"iron-ring": 1}}],
    },
    "worlds/w/zones/forest/passage/passage.json": {identifier: "passage", name: "Passage", connections: [{identifier: "south"}], units: []},
    "worlds/w/zones/cave/cave.json": {
      name: "Cave", description: null, elvl: 0, private: false, maps: [],
      unitTypes: {}, items: {}, zoneLinks: [], entryPoints: {}, openConnections: {},
    },
    "worlds/w/unit_types/goblin.json": {name: "Goblin", tokenImageUrl: ["../tokens/goblin.webp"]},
  };
}

export function fixtureDraft() {
  const json = fixtureJson();
  const files = Object.fromEntries(Object.keys(json).map((path) => [path, {sha: `sha:${path}`, size: 1}]));
  files["worlds/w/zones/forest/hub/hub.png"] = {sha: "png-sha", size: 1000};
  files["worlds/w/tokens/goblin.webp"] = {sha: "tok-sha", size: 10};
  return WorldDraft.fromSnapshot(new RepoSnapshot({worldKey: "w", branch: "b", commitSha: "c1", files, json}));
}
