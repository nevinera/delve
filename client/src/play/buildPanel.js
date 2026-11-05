import { iconNode } from "./icons.js";
import { SPEC_LEVEL, allowedBuild, offeredTalents } from "./build.js";

// The specialization and talents window: specializations as cards, then a row of talent tiles for
// each tier, lowest level first, with a line from each talent to the one it needs above it.

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// The icon a talent or specialization shows: its own, or that of the first thing it gives you.
export function iconOf(made, item) {
  if (item.icon) return item.icon;
  const ability = (id) => made.abilities?.find((a) => a.id === id)?.icon;
  const status = (id) => made.statuses?.find((s) => s.id === id)?.icon;
  for (const grant of item.grants ?? []) {
    const icon = (grant.ability && ability(grant.ability)) || (grant.status && status(grant.status));
    if (icon) return icon;
  }
  return (item.status && status(item.status)) || (item.abilities ?? []).map(ability).find(Boolean) || null;
}

// Every tier's talents as this character sees them: [{ tier, level, open, talents: [{ talent,
// state, needs }] }]. A talent's state is "picked", "open" (yours to pick), "needs" (it needs
// another above it picked), or "locked" (its tier is past your level). Talents your
// specialization can't take aren't there.
export function talentRows(made, level, build) {
  const rows = [];
  let above = "";
  for (const tier of Object.keys(made.talents ?? {}).sort((a, b) => Number(a) - Number(b))) {
    const open = Number(tier) <= level;
    const anyAbove = offeredTalents(made, tier, build.specialization, null);
    const ids = new Set(offeredTalents(made, tier, build.specialization, above).map((t) => t.id));
    const mine = (made.talents[tier] ?? []).filter((t) => anyAbove.includes(t) || (t.requires && offeredTalents(made, tier, build.specialization, t.requires).includes(t)));
    rows.push({
      tier,
      level: Number(tier),
      open,
      talents: mine.map((talent) => ({
        talent,
        needs: talent.requires ?? null,
        state: build.talents[tier] === talent.id ? "picked" : !open ? "locked" : ids.has(talent.id) ? "open" : "needs",
      })),
    });
    above = build.talents[tier] ?? "";
  }
  return rows;
}

function tile(made, { icon, name, state, title }) {
  const node = el("button", { type: "button", className: `play-tile is-${state}` });
  const image = iconNode(icon, "play-tile-icon") ?? el("span", { className: "play-tile-icon play-tile-letter", textContent: (name ?? "?").slice(0, 1) });
  node.append(image, el("span", { className: "play-tile-name", textContent: name }));
  if (title) node.title = title;
  return node;
}

// Shows what a tile is in the strip at the bottom. On a phone the first tap shows it and the
// second picks it; with a mouse, pointing shows it and a click picks it.
function explained(node, strip, words, pick) {
  const show = () => strip.replaceChildren(el("strong", { textContent: words.name }), ...(words.lines ?? []).map((line) => el("span", { textContent: line })));
  node.addEventListener("pointerenter", (event) => event.pointerType !== "touch" && show());
  node.addEventListener("focus", show);
  let shownBy = null;
  node.addEventListener("pointerdown", (event) => (shownBy = event.pointerType));
  node.addEventListener("click", () => {
    if (shownBy === "touch" && strip.dataset.showing !== words.name) {
      strip.dataset.showing = words.name;
      return show();
    }
    pick?.();
  });
}

// Fills `box` with the specializations and talents this character can pick, and calls onChange
// with the build asked for. The server says what it comes to, and this draws again then. `refused`
// is why it said no to the last one.
export function drawBuildPanel(box, { made, level, build, refused }, onChange) {
  const close = el("button", { type: "button", className: "play-build-close", textContent: "close" });
  close.addEventListener("click", () => (box.hidden = true));
  const strip = el("div", { className: "play-tile-detail" }, el("span", { textContent: "Point at something to see what it does." }));
  box.replaceChildren(el("h2", { textContent: "Specialization and talents" }), close);
  if (refused) box.append(el("p", { className: "play-build-refused", textContent: refused }));

  const specs = el("div", { className: "play-specs" });
  for (const spec of made.specializations ?? []) {
    const state = build.specialization === spec.id ? "picked" : level < SPEC_LEVEL ? "locked" : "open";
    const card = tile(made, { icon: iconOf(made, spec), name: spec.name ?? spec.id, state });
    card.classList.add("play-spec");
    const lines = [spec.description, state === "locked" ? `You choose at level ${SPEC_LEVEL}.` : null].filter(Boolean);
    explained(card, strip, { name: spec.name ?? spec.id, lines }, state === "open" ? () => onChange(allowedBuild(made, { ...build, specialization: spec.id }, level)) : null);
    specs.append(card);
  }
  box.append(el("h3", { textContent: "Specialization" }), specs);

  const tree = el("div", { className: "play-talents" });
  const lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  lines.classList.add("play-talent-lines");
  tree.append(lines);
  const tiles = new Map(); // talent id -> its tile
  const needs = []; // [talent id, what it needs, picked]
  for (const row of talentRows(made, level, build)) {
    const line = el("div", { className: `play-talent-row${row.open ? "" : " is-locked"}` }, el("span", { className: "play-talent-level", textContent: `${row.level}` }));
    for (const { talent, state, needs: needed } of row.talents) {
      const node = tile(made, { icon: iconOf(made, talent), name: talent.name ?? talent.id, state });
      const about = [talent.description];
      if (needed) about.push(`Needs ${(Object.values(made.talents).flat().find((t) => t.id === needed)?.name ?? needed)} above it.`);
      if (state === "locked") about.push(`Opens at level ${row.level}.`);
      explained(node, strip, { name: talent.name ?? talent.id, lines: about.filter(Boolean) }, state === "open" ? () => onChange(allowedBuild(made, { ...build, talents: { ...build.talents, [row.tier]: talent.id } }, level)) : null);
      tiles.set(talent.id, node);
      if (needed) needs.push([talent.id, needed, state === "picked"]);
      line.append(node);
    }
    tree.append(line);
  }
  box.append(el("h3", { textContent: "Talents" }), tree, strip);

  // The lines wait for the tiles to be laid out.
  requestAnimationFrame(() => {
    const at = tree.getBoundingClientRect();
    lines.setAttribute("width", at.width);
    lines.setAttribute("height", at.height);
    lines.replaceChildren();
    for (const [id, needed, picked] of needs) {
      const [to, from] = [tiles.get(id), tiles.get(needed)];
      if (!to || !from) continue;
      const [a, b] = [from.getBoundingClientRect(), to.getBoundingClientRect()];
      const path = document.createElementNS("http://www.w3.org/2000/svg", "line");
      path.setAttribute("x1", a.left + a.width / 2 - at.left);
      path.setAttribute("y1", a.bottom - at.top);
      path.setAttribute("x2", b.left + b.width / 2 - at.left);
      path.setAttribute("y2", b.top - at.top);
      if (picked) path.classList.add("is-picked");
      lines.append(path);
    }
  });
}
