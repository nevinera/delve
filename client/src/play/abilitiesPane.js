import { iconNode } from "./icons.js";
// What an ability's cost reads as, the way the server charges it, with what each resource is called
// if `names` says.
export function costWords(costs, names = {}) {
  return costs
    .map(({ resource: key, amount, percent, all, upTo, perSecond }) => {
      const resource = names[key] ?? key;
      if (perSecond) return `${perSecond} ${resource} a second`;
      const least = percent ? `${percent}%` : amount ?? 0;
      if (all) return `${least}+ ${resource}, spends it all`;
      if (upTo) return `${least} to ${upTo} ${resource}`;
      return `${least} ${resource}`;
    })
    .join(", ");
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// A tile for the spellbook, and what it says in the strip when pointed at.
function bookTile(item, state, strip, lines) {
  const node = el("button", { type: "button", className: `play-tile is-${state}` });
  node.append(iconNode(item.icon, "play-tile-icon") ?? el("span", { className: "play-tile-icon play-tile-letter", textContent: (item.name ?? item.id).slice(0, 1) }), el("span", { className: "play-tile-name", textContent: item.name ?? item.id }));
  const show = () => strip.replaceChildren(el("strong", { textContent: item.name ?? item.id }), ...lines.filter(Boolean).map((line) => el("span", { textContent: line })));
  node.addEventListener("pointerenter", (event) => event.pointerType !== "touch" && show());
  node.addEventListener("focus", show);
  return { node, show };
}

// Fills `box` with what you know and what you always hold, as a spellbook of tiles. `picked` is
// the ability you've picked to place, and onPick says you've picked or dropped one. Abilities can
// be dragged out by id. On a phone, a tap shows what an ability does as well as picking it.
export function drawAbilitiesPane(box, { known, passives, picked }, { onPick, onClose }) {
  const close = el("button", { type: "button", className: "play-build-close", textContent: "close" });
  close.addEventListener("click", onClose);
  const strip = el("div", { className: "play-tile-detail" }, el("span", { textContent: "Point at one to see what it does." }));
  box.replaceChildren(
    el("h2", { textContent: "Abilities" }),
    close,
    el("p", { textContent: "Drag one onto a bar, or tap it and then a slot. Tap a slot, then another to move it, or the same one again to clear it." }),
  );
  const book = el("div", { className: "play-book" });
  for (const ability of known) {
    const { node, show } = bookTile(ability, picked === ability.id ? "picked" : "open", strip, [ability.cost?.length ? costWords(ability.cost) : null, ability.description]);
    node.draggable = true;
    node.addEventListener("click", () => {
      show();
      onPick(picked === ability.id ? null : ability.id);
    });
    node.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", JSON.stringify({ ability: ability.id })));
    book.append(node);
  }
  box.append(book);
  if (passives.length) {
    const held = el("div", { className: "play-book" });
    for (const passive of passives) {
      const { node, show } = bookTile(passive, "held", strip, [passive.description]);
      node.addEventListener("click", show);
      held.append(node);
    }
    box.append(el("h3", { textContent: "Always on" }), held);
  }
  box.append(strip);
}
