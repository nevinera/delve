const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// Fills `box` with what you know and what you always hold. `picked` is the ability you've picked to
// place, and onPick says you've picked or dropped one. Abilities can be dragged out by id.
export function drawAbilitiesPane(box, { known, passives, picked }, { onPick, onClose }) {
  const close = el("button", { type: "button", className: "play-build-close", textContent: "close" });
  close.addEventListener("click", onClose);
  box.replaceChildren(
    el("h2", { textContent: "Abilities" }),
    close,
    el("p", { textContent: "Drag one onto a bar, or tap it and then a slot. Tap a slot, then another to move it, or the same one again to clear it." }),
  );
  for (const ability of known) {
    const button = el("button", { type: "button", draggable: true, className: picked === ability.id ? "play-build-on" : "" }, el("strong", { textContent: ability.name ?? ability.id }));
    if (ability.description) button.append(el("span", { textContent: ability.description }));
    button.addEventListener("click", () => onPick(picked === ability.id ? null : ability.id));
    button.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", JSON.stringify({ ability: ability.id })));
    box.append(button);
  }
  if (passives.length) box.append(el("h3", { textContent: "Always on" }));
  for (const passive of passives) {
    const line = el("div", { className: "play-passive" }, el("strong", { textContent: passive.name ?? passive.id }));
    if (passive.description) line.append(el("span", { textContent: passive.description }));
    box.append(line);
  }
}
