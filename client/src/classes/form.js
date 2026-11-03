// Forms from lists of fields, for editing a plain object in place. A field is { key, label, type },
// with `hint`, `show(value)` to show it only sometimes, and by type:
// - text, area, color, check: as they sound.
// - number: `min` and `step`.
// - select: `options`, an array of names or [value, label]s, and `none`, the label for leaving it out.
// - multi: `options`, kept as a list of those picked.
// - words: a list of words, written with commas.
// - group: `fields`, kept as an object under its key.
// - list: `fields` for each item, `blank()` for a new one, `one`, what to call one, `limit`, and
//   `read` and `write`, for items the form holds differently from the file.
// - amount, distance: as the game data's are (formats.md).
// Leaving a field empty takes its key away, so the file holds only what's been set.

// Whether a value is the same as leaving it out.
export const isBlank = (value) =>
  value === undefined || value === null || value === "" || Number.isNaN(value) || (Array.isArray(value) && !value.length) || (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length);

export function setKey(object, key, value) {
  if (isBlank(value)) delete object[key];
  else object[key] = value;
}

const AMOUNT_PARTS = ["attackPower", "spellPower", "weapon", "mastery", "byMastery", "maxHealth", "shareOfTrigger"];

// An amount as the form shows it: { min, max, attackPower, spellPower, weapon, mastery, byMastery, maxHealth, shareOfTrigger, perSpent },
// perSpent being another of these.
export function readAmount(amount) {
  if (amount === undefined || amount === null) return {};
  if (typeof amount === "number") return { min: amount, max: amount };
  if (Array.isArray(amount)) return { min: amount[0], max: amount[1] };
  const base = amount.base === undefined ? {} : readAmount(amount.base);
  const out = { ...base };
  for (const part of AMOUNT_PARTS) if (amount[part] !== undefined) out[part] = amount[part];
  if (amount.perSpent !== undefined) out.perSpent = readAmount(amount.perSpent);
  return out;
}

// That back as the shortest amount that says it: a number, [min, max], or parts.
export function writeAmount({ min, max, perSpent, ...parts }) {
  const low = min ?? max;
  const high = max ?? min;
  const base = low === undefined ? undefined : low === high ? low : [low, high];
  const others = Object.fromEntries(AMOUNT_PARTS.filter((part) => parts[part] !== undefined).map((part) => [part, parts[part]]));
  const each = perSpent && writeAmount(perSpent);
  if (each !== undefined) others.perSpent = each;
  if (!Object.keys(others).length) return base;
  return base === undefined ? others : { base, ...others };
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const numberOf = (text) => (text.trim() === "" ? undefined : Number(text));

const row = (field, ...inputs) =>
  el("label", { className: "form-row", title: field.hint ?? "" }, el("span", { className: "form-label", textContent: field.label ?? field.key }), ...inputs);

const optionsOf = (field) => (typeof field.options === "function" ? field.options() : field.options).map((o) => (Array.isArray(o) ? o : [o, o]));

const RENDERERS = {
  text: (field, value, { changed }) => {
    const input = el("input", { value: value[field.key] ?? "" });
    input.addEventListener("input", () => (setKey(value, field.key, input.value), changed()));
    return row(field, input);
  },
  area: (field, value, { changed }) => {
    const input = el("textarea", { value: value[field.key] ?? "", rows: 2 });
    input.addEventListener("input", () => (setKey(value, field.key, input.value), changed()));
    return row(field, input);
  },
  color: (field, value, { changed, reshaped }) => {
    const input = el("input", { type: "color", value: value[field.key] ?? "#808080" });
    input.addEventListener("input", () => (value[field.key] = input.value, changed()));
    const clear = el("button", { type: "button", textContent: "×", title: "leave it out", hidden: value[field.key] === undefined });
    clear.addEventListener("click", (e) => (e.preventDefault(), delete value[field.key], reshaped()));
    return row(field, input, clear);
  },
  number: (field, value, { changed }) => {
    const input = el("input", { type: "number", value: value[field.key] ?? "", step: field.step ?? "any" });
    if (field.min !== undefined) input.min = field.min;
    input.addEventListener("input", () => (setKey(value, field.key, numberOf(input.value)), changed()));
    return row(field, input);
  },
  check: (field, value, { reshaped }) => {
    const input = el("input", { type: "checkbox", checked: value[field.key] ?? field.default ?? false });
    input.addEventListener("change", () => {
      // What's the same as the default stays out of the file.
      setKey(value, field.key, input.checked === (field.default ?? false) ? undefined : input.checked);
      reshaped();
    });
    return row(field, input);
  },
  select: (field, value, { reshaped }) => {
    const options = optionsOf(field);
    // One that has to have a value starts on the first.
    if (field.none === undefined && value[field.key] === undefined && options.length) value[field.key] = options[0][0];
    const select = el("select");
    if (field.none !== undefined) select.append(el("option", { value: "", textContent: field.none }));
    for (const [v, label] of options) select.append(el("option", { value: v, textContent: label }));
    // A value that isn't among them any more still shows, to fix.
    if (value[field.key] !== undefined && !options.some(([v]) => v === value[field.key])) select.append(el("option", { value: value[field.key], textContent: `${value[field.key]} (missing)` }));
    select.value = value[field.key] ?? "";
    select.addEventListener("change", () => (setKey(value, field.key, select.value), reshaped()));
    return row(field, select);
  },
  multi: (field, value, { changed }) => {
    const picked = new Set(value[field.key] ?? []);
    const boxes = optionsOf(field).map(([v, label]) => {
      const box = el("input", { type: "checkbox", checked: picked.has(v) });
      box.addEventListener("change", () => {
        if (box.checked) picked.add(v);
        else picked.delete(v);
        setKey(value, field.key, optionsOf(field).map(([o]) => o).filter((o) => picked.has(o)));
        changed();
      });
      return el("label", { className: "form-pick" }, box, label);
    });
    return el("div", { className: "form-row", title: field.hint ?? "" }, el("span", { className: "form-label", textContent: field.label ?? field.key }), el("div", { className: "form-picks" }, ...boxes));
  },
  words: (field, value, { changed }) => {
    const input = el("input", { value: (value[field.key] ?? []).join(", ") });
    input.addEventListener("input", () => {
      setKey(value, field.key, input.value.split(",").map((w) => w.trim()).filter(Boolean));
      changed();
    });
    return row(field, input);
  },
  distance: (field, value, { reshaped, changed }) => {
    const melee = el("input", { type: "checkbox", checked: value[field.key] === "melee" });
    const feet = el("input", { type: "number", min: 0, step: "any", disabled: melee.checked, value: value[field.key] === "melee" ? "" : (value[field.key] ?? "") });
    feet.addEventListener("input", () => (setKey(value, field.key, numberOf(feet.value)), changed()));
    melee.addEventListener("change", () => (setKey(value, field.key, melee.checked ? "melee" : undefined), reshaped()));
    return row(field, feet, el("span", { textContent: "ft or melee" }), melee);
  },
  amount: (field, value, { changed }) => {
    const parts = readAmount(value[field.key]);
    const keep = () => (setKey(value, field.key, writeAmount(parts)), changed());
    parts.perSpent ??= {};
    const input = (held, part, label) => {
      const box = el("input", { type: "number", step: "any", value: held[part] ?? "", title: label, placeholder: label });
      box.addEventListener("input", () => {
        const number = numberOf(box.value);
        if (number === undefined) delete held[part];
        else held[part] = number;
        keep();
      });
      return box;
    };
    const inputs = (held, after = "") => [input(held, "min", `min${after}`), input(held, "max", `max${after}`), input(held, "attackPower", `× attack power${after}`), input(held, "spellPower", `× spell power${after}`), input(held, "weapon", `× weapon${after}`), input(held, "mastery", `× mastery${after}`), input(held, "byMastery", `% per mastery${after}`), input(held, "maxHealth", `× max health${after}`), input(held, "shareOfTrigger", `× what set it off${after}`)];
    return el(
      "div",
      { className: "form-row", title: field.hint ?? "" },
      el("span", { className: "form-label", textContent: field.label ?? field.key }),
      el("div", { className: "form-amount" }, ...inputs(parts), ...inputs(parts.perSpent, " per point spent")),
    );
  },
  group: (field, value, hooks) => {
    const inner = value[field.key] ?? {};
    const keep = () => setKey(value, field.key, inner);
    return el(
      "fieldset",
      { className: "form-group" },
      el("legend", { textContent: field.label ?? field.key }),
      ...renderFields(field.fields, inner, {
        changed: () => (keep(), hooks.changed()),
        reshaped: () => (keep(), hooks.reshaped()),
      }),
    );
  },
  list: (field, value, hooks) => {
    const read = field.read ?? ((item) => item);
    const write = field.write ?? ((item) => item);
    const items = (value[field.key] ?? []).map(read);
    const keep = () => setKey(value, field.key, items.map(write));
    const changed = () => (keep(), hooks.changed());
    const reshaped = () => (keep(), hooks.reshaped());
    const add = el("button", { type: "button", textContent: `add ${field.one ?? "one"}`, disabled: field.limit !== undefined && items.length >= field.limit });
    add.addEventListener("click", () => {
      items.push(field.blank());
      reshaped();
    });
    const nodes = items.map((item, n) => {
      const remove = el("button", { type: "button", textContent: "remove", className: "form-remove" });
      remove.addEventListener("click", () => {
        items.splice(n, 1);
        reshaped();
      });
      return el("div", { className: "form-item" }, remove, ...renderFields(field.fields, item, { changed, reshaped }));
    });
    return el("fieldset", { className: "form-group" }, el("legend", { textContent: field.label ?? field.key }), ...nodes, add);
  },
};

// The nodes for `fields`, editing `value` in place. changed() hears any change, and reshaped() one
// that changes which fields there are, so they have to be drawn again.
export function renderFields(fields, value, hooks) {
  return fields.filter((field) => !field.show || field.show(value)).map((field) => RENDERERS[field.type ?? "text"](field, value, hooks));
}
