import { readFileSync } from "node:fs";
import { parse } from "acorn";
import { describe, expect, it } from "vitest";

// The play page against the protocol's schema (docs/schema/messages.schema.json): it handles every
// message the server sends and no others, and sends only messages the server takes.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const defs = JSON.parse(read("../../../docs/schema/messages.schema.json")).$defs;
const kinds = (side) => Object.keys(defs).filter((k) => k.startsWith(`${side}.`)).map((k) => k.slice(side.length + 1)).sort();

// The keys of every object literal passed to `new GameConnection(...)` or `enter(...)` in main.js:
// the page's handlers, by message type.
function handlers() {
  const keys = new Set();
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    const callee = node.callee?.name;
    if ((node.type === "NewExpression" && callee === "GameConnection") || (node.type === "CallExpression" && callee === "enter")) {
      for (const arg of node.arguments) {
        if (arg.type !== "ObjectExpression") continue;
        for (const p of arg.properties) if (p.type === "Property") keys.add(p.key.name ?? p.key.value);
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(parse(read("./main.js"), { ecmaVersion: "latest", sourceType: "module" }));
  keys.delete("closed"); // the socket closing, not a message
  keys.add("correct"); // GameConnection takes it itself
  return [...keys].sort();
}

// The message types in a formats.md table, under its heading.
function documented(heading) {
  const text = read("../../../.agents/formats.md");
  const table = text.slice(text.indexOf(`#### ${heading}`)).split("\n#### ")[0];
  return [...table.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]).sort();
}

describe("the game protocol", () => {
  it("has the play page handle every message the server sends, and no others", () => {
    expect(handlers()).toEqual(kinds("server"));
  });

  it("has the play page send only messages the server takes, and each of them", () => {
    const game = read("./game.js");
    const sent = [...game.matchAll(/type: "(\w+)"/g), ...game.matchAll(/return "(move|heartbeat)"/g)].map((m) => m[1]);
    expect([...new Set(sent)].sort()).toEqual(kinds("client"));
  });

  it("lists in formats.md the same messages the schema has", () => {
    expect(documented("Server to client")).toEqual(kinds("server"));
    expect(documented("Client to server")).toEqual(kinds("client"));
  });
});
