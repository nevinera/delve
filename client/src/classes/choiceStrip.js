import { fold } from "./form.js";

// A row of choices. It has no heading: what's on offer says what it's asking. A strip is
// { name, options: [{ value, label, swatch }], value, pick(value) }, with `other`, the unit of a number
// that's none of the options, `signed` if that number can be negative, and `more` and `owner` for rarer
// options folded away, remembered against `owner`.

export const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

export const SCHOOL_COLORS = { physical: "#b8b0a0", holy: "#f0d870", fire: "#f07030", nature: "#60c060", frost: "#70c8f0", shadow: "#9060c0", arcane: "#d070e0" };

const numberOf = (text) => (text.trim() === "" ? undefined : Number(text));

export function choice(option, on, pick) {
  const button = el("button", { type: "button", className: "choice" });
  if (option.swatch) button.append(el("span", { className: "choice-swatch", style: `background:${SCHOOL_COLORS[option.swatch]}` }));
  button.append(option.label);
  button.classList.toggle("on", on);
  button.setAttribute("aria-pressed", on);
  button.addEventListener("click", () => pick(option.value));
  return button;
}

// Marks a row for those who can't see what it's next to.
export function asStrip(node, name) {
  node.dataset.strip = name;
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", name);
  return node;
}

export function drawStrip(strip, { changed, reshaped }) {
  const pick = (value) => {
    strip.pick(value);
    reshaped();
  };
  const buttons = (options) => options.map((option) => choice(option, option.value === strip.value, pick));
  const offered = [...strip.options, ...(strip.more ?? [])].some((o) => o.value === strip.value);
  const node = asStrip(el("div", { className: "choice-strip" }, ...buttons(strip.options)), strip.name);
  if (strip.other !== undefined) {
    const input = el("input", { type: "number", step: "any", className: "choice-other", placeholder: "other", value: !offered && typeof strip.value === "number" ? strip.value : "" });
    if (!strip.signed) input.min = 0;
    input.setAttribute("aria-label", `${strip.name}, another number`);
    input.addEventListener("input", () => {
      strip.pick(numberOf(input.value));
      changed();
    });
    input.addEventListener("change", reshaped);
    node.append(el("label", { className: "choice-other-box" }, input, strip.other));
  }
  if (strip.more?.length) {
    node.append(
      fold({
        owner: strip.owner,
        name: `strip ${strip.name}`,
        className: "form-advanced choice-more",
        summary: "more",
        startOpen: strip.more.some((o) => o.value === strip.value),
        draw: () => [el("div", { className: "choice-strip" }, ...buttons(strip.more))],
      }),
    );
  }
  return node;
}

// An effect's fields for the fold-out on its card, less what the card's choices ask: `drop` goes, `tuck`
// moves into the fold-out without counting as anything set, for what the choices can't say, and `quiet`
// doesn't count either. `tuck` is { key: heading }.
export function foldOutFields(fields, { drop = [], tuck = {}, quiet = [], move = {} }) {
  return fields.flatMap((field) => {
    if (field.advanced) return [quiet.includes(field.key) ? { ...field, quiet: true } : field];
    if (drop.includes(field.key)) return [];
    if (tuck[field.key]) return [{ ...field, advanced: tuck[field.key], quiet: true }];
    if (move[field.key]) return [{ ...field, advanced: move[field.key] }];
    return [field];
  });
}

// A row of tiles that each add something. `first` shows, and `rest` folds away against `owner`.
export function addRow({ first, rest, owner, label, icon, add, summary }) {
  const tile = (type) => {
    const button = el("button", { type: "button", className: "effect-add" });
    const face = icon(type);
    if (face) button.append(face);
    button.append(label(type));
    button.dataset.add = type;
    button.addEventListener("click", () => add(type));
    return button;
  };
  return el(
    "div",
    { className: "effect-adds" },
    el("div", { className: "choice-strip" }, ...first.map(tile)),
    ...(rest.length ? [fold({ owner, name: "more effects", className: "form-advanced", summary, startOpen: false, draw: () => [el("div", { className: "choice-strip" }, ...rest.map(tile))] })] : []),
  );
}
