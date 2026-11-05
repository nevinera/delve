// The menu a right-click or a long press opens. Items are { label, run, keepOpen, danger }.

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

let openMenu = null;

export function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}

document.addEventListener("pointerdown", (event) => {
  if (openMenu && !openMenu.contains(event.target)) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

function itemNode(item) {
  const button = el("button", { type: "button", textContent: item.label, className: item.danger ? "form-remove" : "" });
  button.setAttribute("role", "menuitem");
  button.addEventListener("click", () => {
    // Deleting asks once more, in place of the item.
    if (item.confirm) return button.replaceWith(itemNode({ label: item.confirm, run: item.run, danger: true }));
    closeMenu();
    item.run();
  });
  return button;
}

export function showMenu(x, y, items) {
  closeMenu();
  const menu = el("div", { className: "tile-menu" }, ...items.map(itemNode));
  menu.setAttribute("role", "menu");
  document.body.append(menu);
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - box.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - box.height - 4))}px`;
  openMenu = menu;
  menu.querySelector("button")?.focus();
}

const LONG_PRESS_MS = 500;

// Calls `open(x, y)` on a right-click, the menu key, or a long press on a touch screen.
export function onMenu(node, open) {
  node.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const box = node.getBoundingClientRect();
    // The menu key has no place of its own, so the menu opens by the node.
    open(event.clientX || box.left, event.clientY || box.bottom);
  });
  let timer = null;
  let pressed = false;
  const stop = () => clearTimeout(timer);
  node.addEventListener("pointerdown", (event) => {
    pressed = false;
    if (event.pointerType !== "touch") return;
    event.stopPropagation();
    timer = setTimeout(() => {
      pressed = true;
      open(event.clientX, event.clientY);
    }, LONG_PRESS_MS);
  });
  for (const type of ["pointerup", "pointercancel", "pointermove", "pointerleave"]) node.addEventListener(type, stop);
  // The press that opened a menu isn't also a click.
  node.addEventListener("click", (event) => {
    if (!pressed) return;
    pressed = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
