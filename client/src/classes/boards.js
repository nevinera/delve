import { iconNode } from "../play/icons.js";
import { TALENT_TIERS } from "./classFile.js";
import { GENERAL, bookPages, pageTiles, talentIcon, talentSpecs, usedBy } from "./spellbook.js";
import { onMenu } from "./tileMenu.js";

// What the Spellbook, Talents and Statuses tabs draw. Each takes what to do when something's picked or
// a menu's asked for, and main.js does it.

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("") || "?";

// An icon, or the first letters of a name for something without one.
function face(icon, name) {
  return iconNode(icon, "board-icon") ?? el("span", { className: "board-letters", textContent: initials(name) });
}

function tile({ name, icon, note, active, passive, click, menu }) {
  const button = el("button", { type: "button", className: "board-tile", title: name }, face(icon, name), el("span", { className: "board-name", textContent: name || "(no name)" }));
  if (note) button.append(el("span", { className: "board-note", textContent: note }));
  button.classList.toggle("active", Boolean(active));
  button.classList.toggle("passive", Boolean(passive));
  button.addEventListener("click", click);
  if (menu) onMenu(button, menu);
  return button;
}

const addButton = (label, open) => {
  const add = el("button", { type: "button", className: "board-add", textContent: label });
  add.addEventListener("click", () => {
    const box = add.getBoundingClientRect();
    open(box.left, box.bottom);
  });
  return add;
};

// A page of the spellbook, with tabs for the rest. `on` has page(id), pick(tile), tileMenu(tile, x, y) and addMenu(level, x, y).
export function spellbookBoard(made, { page, isActive, on }) {
  const pages = el(
    "div",
    { className: "book-pages" },
    ...bookPages(made).map((p) => {
      const button = el("button", { type: "button", textContent: p.name });
      button.classList.toggle("active", p.id === page);
      button.addEventListener("click", () => on.page(p.id));
      return button;
    }),
  );
  const { rows, fromTalents } = pageTiles(made, page);
  const tileNode = (t) =>
    tile({
      name: t.name,
      icon: t.icon,
      active: isActive(t),
      passive: t.kind !== "ability",
      note: t.kind !== "ability" ? "passive" : undefined,
      click: () => on.pick(t),
      menu: (x, y) => on.tileMenu(t, x, y),
    });
  const rowNode = (label, tiles, level) => {
    const row = el("div", { className: level ? "book-row" : "book-row apart" }, el("div", { className: "book-level", textContent: label }), el("div", { className: "book-tiles" }, ...tiles.map(tileNode)));
    if (level) onMenu(row, (x, y) => on.addMenu(level, x, y));
    return row;
  };
  const body = el("div", { className: "book-body" }, ...rows.map((r) => rowNode(`Lv ${r.level}`, r.tiles, r.level)));
  if (!rows.length) body.append(el("p", { className: "board-empty", textContent: page === GENERAL ? "Nothing here yet. Right-click to add an ability or a passive." : "Nothing only this specialization has yet. Right-click to add one." }));
  if (fromTalents.length) body.append(rowNode("From talents", fromTalents));
  onMenu(body, (x, y) => on.addMenu(1, x, y));
  return [pages, body, addButton("add", (x, y) => on.addMenu(rows.at(-1)?.level ?? 1, x, y))];
}

// Lines from each talent to the one it requires, drawn once the cards have places.
function drawLines(tree, svg) {
  const at = tree.getBoundingClientRect();
  svg.setAttribute("width", tree.scrollWidth);
  svg.setAttribute("height", tree.scrollHeight);
  const lines = [...tree.querySelectorAll("[data-requires]")].flatMap((card) => {
    const above = tree.querySelector(`[data-talent="${CSS.escape(card.dataset.requires)}"]`);
    if (!above) return [];
    const from = above.getBoundingClientRect();
    const to = card.getBoundingClientRect();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", from.left + from.width / 2 - at.left);
    line.setAttribute("y1", from.bottom - at.top);
    line.setAttribute("x2", to.left + to.width / 2 - at.left);
    line.setAttribute("y2", to.top - at.top);
    return [line];
  });
  svg.replaceChildren(...lines);
}

let linesObserver = null;

// Every talent tier in rows. `on` has pick(level, talent), cardMenu(level, talent, x, y) and addTalent(level).
export function talentBoard(made, { isActive, on }) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("talent-lines");
  svg.setAttribute("aria-hidden", "true");
  const tree = el("div", { className: "talent-tree" });
  tree.append(svg);
  for (const level of TALENT_TIERS) {
    const cards = made.talents?.[level] ?? [];
    const nodes = cards.map((t) => {
      const specs = talentSpecs(made, t);
      const card = tile({
        name: t.name,
        icon: talentIcon(made, t),
        note: specs.join(", "),
        active: isActive(level, t),
        click: () => on.pick(level, t),
        menu: (x, y) => on.cardMenu(level, t, x, y),
      });
      card.classList.add("talent-card");
      card.dataset.talent = t.id;
      if (t.requires) card.dataset.requires = t.requires;
      if (t.description) card.append(el("span", { className: "talent-text", textContent: t.description }));
      return card;
    });
    const row = el("div", { className: "talent-tier" }, el("div", { className: "book-level", textContent: `Level ${level}` }), el("div", { className: "talent-cards" }, ...nodes));
    onMenu(row, (x, y) => on.tierMenu(level, x, y));
    tree.append(row);
  }
  requestAnimationFrame(() => drawLines(tree, svg));
  linesObserver?.disconnect();
  linesObserver = new ResizeObserver(() => drawLines(tree, svg));
  linesObserver.observe(tree);
  return [tree];
}

// Every status, to find one. `on` has pick(status), menu(status, x, y) and add().
export function statusBoard(made, { filter, on }) {
  const tiles = el("div", { className: "book-tiles status-tiles" });
  const fill = (text) => {
    const wanted = text.trim().toLowerCase();
    const shown = [...(made.statuses ?? [])].filter((s) => !wanted || (s.name ?? "").toLowerCase().includes(wanted)).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    tiles.replaceChildren(
      ...shown.map((s) => {
        const uses = usedBy(made, s.id);
        return tile({
          name: s.name,
          icon: s.icon,
          note: uses.length ? `${uses.slice(0, 2).join(", ")}${uses.length > 2 ? ` and ${uses.length - 2} more` : ""}` : "unused",
          click: () => on.pick(s),
          menu: (x, y) => on.menu(s, x, y),
        });
      }),
    );
    if (!shown.length) tiles.append(el("p", { className: "board-empty", textContent: made.statuses?.length ? "No status has that name." : "No statuses yet. You can make one from anything that uses one." }));
  };
  const search = el("input", { type: "search", placeholder: "find a status", value: filter.text });
  search.setAttribute("aria-label", "find a status");
  search.addEventListener("input", () => {
    filter.text = search.value;
    fill(search.value);
  });
  fill(filter.text);
  const add = el("button", { type: "button", className: "board-add", textContent: "new status" });
  add.addEventListener("click", on.add);
  return [el("div", { className: "status-find" }, search, add), tiles];
}
